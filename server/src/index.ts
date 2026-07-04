/**
 * Crohnicle AI meal-analysis proxy — Cloudflare Worker (§6).
 *
 * POST /analyze-meal
 *   body: { images: string[] (base64 JPEG, 1-2), userNote?: string,
 *           deviceId: string, entitlementToken?: string }
 *
 * Responsibilities:
 *  - access control: RevenueCat `premium` entitlement (KV-cached 1 h) OR a
 *    10-photo anonymous trial quota; subscribers capped at DAILY_CAP/day.
 *  - call the Anthropic Messages API DIRECTLY (no SDK — minimal bundle) with
 *    haiku vision + structured outputs, the frozen cached system prompt, and
 *    image-first / task-text-last content ordering.
 *  - never store images; logs carry no content (only duration/status/deviceId
 *    prefix). Errors are always structured JSON, never silent.
 *
 * Types are declared locally so the core logic needs no @cloudflare/workers-types
 * at build time (Request/Response/fetch come from the WebWorker lib).
 */

import { SYSTEM_PROMPT } from "./prompt";
import { SCHEMA } from "./schema";

export interface KVNamespace {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
	/** Anthropic API key (secret). */
	ANTHROPIC_API_KEY: string;
	/** RevenueCat REST key (secret, optional). When set, entitlementToken is checked. */
	REVENUECAT_API_KEY?: string;
	/** KV namespace for quota + entitlement cache. */
	QUOTA_KV: KVNamespace;
	/** Trial photo quota per device (default 10). */
	TRIAL_QUOTA?: string;
	/** Subscriber anti-abuse daily cap (default 200). */
	DAILY_CAP?: string;
}

interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
}

interface AnalyzeBody {
	images?: unknown;
	userNote?: unknown;
	deviceId?: unknown;
	entitlementToken?: unknown;
}

const CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Max-Age": "86400",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const RC_BASE = "https://api.revenuecat.com/v1/subscribers/";
const MODEL = "claude-haiku-4-5";

/** JSON response with CORS + structured body. */
function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...CORS_HEADERS },
	});
}

function toInt(value: string | null, fallback: number): number {
	const n = value == null ? Number.NaN : Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : fallback;
}

/** UTC date key (YYYY-MM-DD) for the daily cap. */
function utcDate(now = Date.now()): string {
	return new Date(now).toISOString().slice(0, 10);
}

/**
 * Is the RevenueCat subscriber's `premium` entitlement active? Result cached in
 * KV (`rc:{token}`) for 1 h. Any RevenueCat failure → treat as not premium
 * (falls back to the trial quota; never blocks silently on their outage).
 */
async function isPremium(env: Env, token: string): Promise<boolean> {
	const cacheKey = `rc:${token}`;
	const cached = await env.QUOTA_KV.get(cacheKey);
	if (cached != null) return cached === "1";

	let premium = false;
	try {
		const resp = await fetch(`${RC_BASE}${encodeURIComponent(token)}`, {
			headers: { Authorization: `Bearer ${env.REVENUECAT_API_KEY}` },
		});
		if (resp.ok) {
			const data = (await resp.json()) as {
				subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> };
			};
			const ent = data.subscriber?.entitlements?.premium;
			if (ent) {
				premium = ent.expires_date == null || new Date(ent.expires_date).getTime() > Date.now();
			}
		}
	} catch {
		premium = false;
	}
	await env.QUOTA_KV.put(cacheKey, premium ? "1" : "0", { expirationTtl: 3600 });
	return premium;
}

type Access =
	| { ok: true; premium: boolean; remaining: number | null; commit: () => Promise<void> }
	| { ok: false; response: Response };

/**
 * Resolve access for this request. Reads quota state and returns a `commit`
 * that increments the counter — called only AFTER a successful analysis so a
 * failed upstream call never burns the user's quota.
 */
async function resolveAccess(
	env: Env,
	deviceId: string,
	entitlementToken: string | undefined,
): Promise<Access> {
	const dailyCap = toInt(env.DAILY_CAP ?? null, 200);
	const trialQuota = toInt(env.TRIAL_QUOTA ?? null, 10);

	// Premium path: only when RevenueCat is configured AND a token is supplied.
	if (env.REVENUECAT_API_KEY && entitlementToken) {
		if (await isPremium(env, entitlementToken)) {
			const capKey = `cap:${deviceId}:${utcDate()}`;
			const used = toInt(await env.QUOTA_KV.get(capKey), 0);
			if (used >= dailyCap) {
				return { ok: false, response: json({ error: "daily_cap", remaining: 0 }, 429) };
			}
			return {
				ok: true,
				premium: true,
				remaining: null,
				commit: () => env.QUOTA_KV.put(capKey, String(used + 1), { expirationTtl: 172800 }),
			};
		}
	}

	// Trial path: anonymous 10-photo quota per device.
	const trialKey = `trial:${deviceId}`;
	const used = toInt(await env.QUOTA_KV.get(trialKey), 0);
	if (used >= trialQuota) {
		return { ok: false, response: json({ error: "trial_exhausted", remaining: 0 }, 429) };
	}
	return {
		ok: true,
		premium: false,
		remaining: trialQuota - (used + 1),
		commit: () => env.QUOTA_KV.put(trialKey, String(used + 1)),
	};
}

interface AnthropicMessage {
	stop_reason?: string;
	content?: { type: string; text?: string }[];
}

/** Build the user content: image FIRST after its label, task text LAST (§6). */
function buildContent(images: string[], userNote: string | undefined): unknown[] {
	const content: unknown[] = [];
	images.forEach((data, i) => {
		content.push({ type: "text", text: `Image ${i + 1}:` });
		content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
	});
	content.push({
		type: "text",
		text: userNote
			? `Analyze this meal photo(s). The user clarifies: "${userNote}" — re-analyze taking this into account.`
			: "Analyze this meal photo(s) and extract the trigger attributes.",
	});
	return content;
}

/** One Anthropic Messages call. Throws on non-2xx (caller maps to 502). */
async function callAnthropic(
	env: Env,
	content: unknown[],
	maxTokens: number,
): Promise<AnthropicMessage> {
	const resp = await fetch(ANTHROPIC_URL, {
		method: "POST",
		headers: {
			"x-api-key": env.ANTHROPIC_API_KEY,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: maxTokens,
			system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
			output_config: { format: { type: "json_schema", schema: SCHEMA } },
			messages: [{ role: "user", content }],
		}),
	});
	if (!resp.ok) {
		const detail = await resp.text().catch(() => "");
		throw new Error(`anthropic ${resp.status}: ${detail.slice(0, 200)}`);
	}
	return (await resp.json()) as AnthropicMessage;
}

async function handleAnalyze(request: Request, env: Env): Promise<Response> {
	const started = Date.now();
	let body: AnalyzeBody;
	try {
		body = (await request.json()) as AnalyzeBody;
	} catch {
		return json({ error: "invalid_json" }, 400);
	}

	const images = Array.isArray(body.images)
		? body.images.filter((x): x is string => typeof x === "string" && x.length > 0)
		: [];
	const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
	const userNote =
		typeof body.userNote === "string" && body.userNote.trim() ? body.userNote.trim() : undefined;
	const entitlementToken =
		typeof body.entitlementToken === "string" && body.entitlementToken
			? body.entitlementToken
			: undefined;

	if (images.length < 1 || images.length > 2) {
		return json({ error: "invalid_images", detail: "expected 1 or 2 base64 JPEG images" }, 400);
	}
	if (!deviceId) {
		return json({ error: "missing_device_id" }, 400);
	}
	if (!env.ANTHROPIC_API_KEY) {
		return json({ error: "not_configured" }, 500);
	}

	const access = await resolveAccess(env, deviceId, entitlementToken);
	if (!access.ok) {
		log(deviceId, 429, started);
		return access.response;
	}

	const content = buildContent(images, userNote);
	let message: AnthropicMessage;
	try {
		message = await callAnthropic(env, content, 1500);
		if (message.stop_reason === "max_tokens") {
			message = await callAnthropic(env, content, 2500);
		}
	} catch {
		log(deviceId, 502, started);
		return json({ error: "upstream_error" }, 502);
	}

	if (message.stop_reason === "refusal") {
		log(deviceId, 422, started);
		return json({ error: "refused" }, 422);
	}

	const textBlock = message.content?.find((b) => b.type === "text" && typeof b.text === "string");
	if (!textBlock?.text) {
		log(deviceId, 502, started);
		return json({ error: "empty_result" }, 502);
	}

	let result: unknown;
	try {
		result = JSON.parse(textBlock.text);
	} catch {
		log(deviceId, 502, started);
		return json({ error: "parse_error" }, 502);
	}

	await access.commit();
	log(deviceId, 200, started);
	return json({ result, remaining: access.remaining, cached: false });
}

/** Content-free structured log: status, duration, truncated deviceId only. */
function log(deviceId: string, status: number, started: number): void {
	console.log(
		JSON.stringify({
			route: "/analyze-meal",
			status,
			ms: Date.now() - started,
			device: deviceId.slice(0, 8),
		}),
	);
}

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}
		const url = new URL(request.url);
		if (request.method === "POST" && url.pathname === "/analyze-meal") {
			return handleAnalyze(request, env);
		}
		return json({ error: "not_found" }, 404);
	},
};
