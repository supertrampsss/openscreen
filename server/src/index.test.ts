import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";

/**
 * Worker tests — global fetch is mocked (Anthropic + RevenueCat), KV is an
 * in-memory Map. No real network, no real keys.
 */

const ctx = { waitUntil: () => undefined };

function makeKV() {
	const store = new Map<string, string>();
	return {
		store,
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => void store.set(k, v),
	};
}

function makeEnv(overrides: Partial<Env> = {}): Env {
	return {
		ANTHROPIC_API_KEY: "sk-test",
		QUOTA_KV: makeKV(),
		TRIAL_QUOTA: "3",
		DAILY_CAP: "200",
		...overrides,
	};
}

const SAMPLE_RESULT = {
	reasoning: "a plate of rice",
	is_food: true,
	dishes: [
		{
			name: "riz",
			confidence: "high",
			ingredients: [
				{
					name: "riz",
					portion: "medium",
					triggers: {
						fodmap: "low",
						lactose: false,
						gluten: false,
						fried: false,
						spicy: false,
						insoluble_fiber: false,
						alcohol: false,
						caffeine: false,
						additives: false,
					},
				},
			],
		},
	],
	notes: "",
};

/** A fake Anthropic Messages response. */
function anthropicResponse(stopReason: string, result: unknown = SAMPLE_RESULT): Response {
	return new Response(
		JSON.stringify({
			stop_reason: stopReason,
			content: [{ type: "text", text: JSON.stringify(result) }],
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
}

function makeReq(body: Record<string, unknown>): Request {
	return new Request("https://proxy.example/analyze-meal", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

const IMG = "aGVsbG8="; // base64 placeholder — never actually decoded (fetch mocked)

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("/analyze-meal quota", () => {
	it("decrements the trial quota and 429s at zero", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => anthropicResponse("end_turn")),
		);
		const env = makeEnv({ TRIAL_QUOTA: "2" });

		const r1 = await worker.fetch(makeReq({ images: [IMG], deviceId: "dev-1" }), env, ctx);
		expect(r1.status).toBe(200);
		expect((await r1.json()).remaining).toBe(1);

		const r2 = await worker.fetch(makeReq({ images: [IMG], deviceId: "dev-1" }), env, ctx);
		expect((await r2.json()).remaining).toBe(0);

		const r3 = await worker.fetch(makeReq({ images: [IMG], deviceId: "dev-1" }), env, ctx);
		expect(r3.status).toBe(429);
		expect(await r3.json()).toEqual({ error: "trial_exhausted", remaining: 0 });
	});

	it("does not burn quota when the upstream call fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("boom", { status: 500 })),
		);
		const env = makeEnv({ TRIAL_QUOTA: "1" });
		const r = await worker.fetch(makeReq({ images: [IMG], deviceId: "dev-x" }), env, ctx);
		expect(r.status).toBe(502);
		// counter untouched → a later good call still succeeds
		expect(await env.QUOTA_KV.get("trial:dev-x")).toBeNull();
	});

	it("premium entitlement bypasses the trial quota", async () => {
		const fetchMock = vi.fn(async (input: unknown) => {
			const url = String(input);
			if (url.includes("revenuecat.com")) {
				return new Response(
					JSON.stringify({ subscriber: { entitlements: { premium: { expires_date: null } } } }),
					{ status: 200 },
				);
			}
			return anthropicResponse("end_turn");
		});
		vi.stubGlobal("fetch", fetchMock);
		const env = makeEnv({ TRIAL_QUOTA: "0", REVENUECAT_API_KEY: "rc-key" });

		const r = await worker.fetch(
			makeReq({ images: [IMG], deviceId: "dev-p", entitlementToken: "app-user-1" }),
			env,
			ctx,
		);
		expect(r.status).toBe(200);
		const payload = await r.json();
		expect(payload.remaining).toBeNull(); // subscribers have no trial countdown
		// trial counter untouched; daily cap counter used instead
		expect(await env.QUOTA_KV.get("trial:dev-p")).toBeNull();
	});
});

describe("/analyze-meal Anthropic handling", () => {
	it("maps stop_reason refusal to 422", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => anthropicResponse("refusal")),
		);
		const r = await worker.fetch(makeReq({ images: [IMG], deviceId: "d" }), makeEnv(), ctx);
		expect(r.status).toBe(422);
		expect(await r.json()).toEqual({ error: "refused" });
	});

	it("retries once with a higher token cap on max_tokens", async () => {
		const fetchMock = vi
			.fn<(input: unknown, init: { body: string }) => Promise<Response>>()
			.mockResolvedValueOnce(anthropicResponse("max_tokens"))
			.mockResolvedValueOnce(anthropicResponse("end_turn"));
		vi.stubGlobal("fetch", fetchMock);

		const r = await worker.fetch(makeReq({ images: [IMG], deviceId: "d" }), makeEnv(), ctx);
		expect(r.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
		expect(secondBody.max_tokens).toBe(2500);
	});

	it("injects the userNote and orders image before task text", async () => {
		const fetchMock = vi.fn<(input: unknown, init: { body: string }) => Promise<Response>>(
			async () => anthropicResponse("end_turn"),
		);
		vi.stubGlobal("fetch", fetchMock);

		await worker.fetch(
			makeReq({ images: [IMG], deviceId: "d", userNote: "c'est du couscous, pas du riz" }),
			makeEnv(),
			ctx,
		);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		const content = body.messages[0].content;
		// image (after its label) comes before the trailing task text
		expect(content[0]).toEqual({ type: "text", text: "Image 1:" });
		expect(content[1].type).toBe("image");
		expect(content[content.length - 1].type).toBe("text");
		expect(content[content.length - 1].text).toContain("couscous");
		// system prompt is cached
		expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
		expect(body.model).toBe("claude-haiku-4-5");
	});
});

describe("/analyze-meal size limits", () => {
	it("413s payload_too_large when an image exceeds the char ceiling", async () => {
		const fetchMock = vi.fn(async () => anthropicResponse("end_turn"));
		vi.stubGlobal("fetch", fetchMock);
		const huge = "a".repeat(1_500_001);
		const r = await worker.fetch(makeReq({ images: [huge], deviceId: "d" }), makeEnv(), ctx);
		expect(r.status).toBe(413);
		expect(await r.json()).toEqual({ error: "payload_too_large" });
		expect(fetchMock).not.toHaveBeenCalled(); // rejected before any upstream cost
	});

	it("413s payload_too_large when userNote exceeds 500 chars", async () => {
		const fetchMock = vi.fn(async () => anthropicResponse("end_turn"));
		vi.stubGlobal("fetch", fetchMock);
		const r = await worker.fetch(
			makeReq({ images: [IMG], deviceId: "d", userNote: "x".repeat(501) }),
			makeEnv(),
			ctx,
		);
		expect(r.status).toBe(413);
		expect(await r.json()).toEqual({ error: "payload_too_large" });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("per-IP rate limit (best-effort)", () => {
	function reqWithIp(ip: string | null): Request {
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (ip) headers["cf-connecting-ip"] = ip;
		return new Request("https://proxy.example/analyze-meal", {
			method: "POST",
			headers,
			body: JSON.stringify({ images: [IMG], deviceId: "d" }),
		});
	}

	it("429s rate_limited past IP_RATE_LIMIT for a given IP", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => anthropicResponse("end_turn")),
		);
		const env = makeEnv({ IP_RATE_LIMIT: "2" });
		expect((await worker.fetch(reqWithIp("1.2.3.4"), env, ctx)).status).toBe(200);
		expect((await worker.fetch(reqWithIp("1.2.3.4"), env, ctx)).status).toBe(200);
		const r3 = await worker.fetch(reqWithIp("1.2.3.4"), env, ctx);
		expect(r3.status).toBe(429);
		expect(await r3.json()).toEqual({ error: "rate_limited" });
		// A different IP is unaffected (independent bucket).
		expect((await worker.fetch(reqWithIp("5.6.7.8"), env, ctx)).status).toBe(200);
	});

	it("limits the shared 'unknown' bucket when the header is absent (dev/tests)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => anthropicResponse("end_turn")),
		);
		const env = makeEnv({ IP_RATE_LIMIT: "1" });
		expect((await worker.fetch(reqWithIp(null), env, ctx)).status).toBe(200);
		const r2 = await worker.fetch(reqWithIp(null), env, ctx);
		expect(r2.status).toBe(429);
		expect(await r2.json()).toEqual({ error: "rate_limited" });
	});
});

describe("/analyze-meal transport", () => {
	it("handles CORS preflight", async () => {
		const r = await worker.fetch(
			new Request("https://proxy.example/analyze-meal", { method: "OPTIONS" }),
			makeEnv(),
			ctx,
		);
		expect(r.status).toBe(204);
		expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	it("adds CORS headers to JSON responses and rejects bad image counts", async () => {
		const r = await worker.fetch(makeReq({ images: [], deviceId: "d" }), makeEnv(), ctx);
		expect(r.status).toBe(400);
		expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect((await r.json()).error).toBe("invalid_images");
	});

	it("404s unknown routes", async () => {
		const r = await worker.fetch(
			new Request("https://proxy.example/other", { method: "POST" }),
			makeEnv(),
			ctx,
		);
		expect(r.status).toBe(404);
	});
});
