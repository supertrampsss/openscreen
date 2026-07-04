import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";
import { VOICE_SCHEMA } from "./voiceSchema";

/**
 * /parse-voice tests — global fetch is mocked (Anthropic + RevenueCat), KV is an
 * in-memory Map. No real network, no real keys. The endpoint is text-only and
 * PREMIUM-ONLY (no trial quota); audio is never uploaded (§6.1, §7, §11-bis).
 */

const ctx = { waitUntil: () => undefined };

type Node = Record<string, unknown>;

function walk(node: Node, path: string, visit: (n: Node, path: string) => void): void {
	visit(node, path);
	if (node.type === "object") {
		const props = (node.properties ?? {}) as Record<string, Node>;
		for (const [key, child] of Object.entries(props)) walk(child, `${path}.${key}`, visit);
	}
	if (node.type === "array" && node.items) walk(node.items as Node, `${path}[]`, visit);
}

function makeKV() {
	const store = new Map<string, string>();
	return {
		store,
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => void store.set(k, v),
	};
}

function makeEnv(overrides: Partial<Env> = {}): Env {
	return { ANTHROPIC_API_KEY: "sk-test", QUOTA_KV: makeKV(), ...overrides };
}

const SAMPLE = {
	reasoning: "three liquid stools this morning and pain 2",
	entries: [
		{ type: "stool", bristol: 6, count: 3, timeOfDay: "morning" },
		{ type: "symptom", pain: 2 },
		{ type: "meal", name: "raclette", timeOfDay: "yesterday_evening" },
	],
};

function anthropicResponse(stopReason: string, result: unknown = SAMPLE): Response {
	return new Response(
		JSON.stringify({
			stop_reason: stopReason,
			content: [{ type: "text", text: JSON.stringify(result) }],
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
}

function makeReq(body: Record<string, unknown>): Request {
	return new Request("https://proxy.example/parse-voice", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("voice schema", () => {
	it("sets additionalProperties:false on every object node", () => {
		const offenders: string[] = [];
		walk(VOICE_SCHEMA as unknown as Node, "root", (n, path) => {
			if (n.type === "object" && n.additionalProperties !== false) offenders.push(path);
		});
		expect(offenders).toEqual([]);
	});

	it("gives every property a description", () => {
		const offenders: string[] = [];
		walk(VOICE_SCHEMA as unknown as Node, "root", (n, path) => {
			if (n.type === "object") {
				const props = (n.properties ?? {}) as Record<string, Node>;
				for (const [key, child] of Object.entries(props)) {
					if (typeof child.description !== "string" || !child.description.length) {
						offenders.push(`${path}.${key}`);
					}
				}
			}
		});
		expect(offenders).toEqual([]);
	});

	it("orders reasoning first, requires only type per entry, restricts the type enum", () => {
		expect(Object.keys(VOICE_SCHEMA.properties)[0]).toBe("reasoning");
		expect(VOICE_SCHEMA.required).toEqual(["reasoning", "entries"]);
		const entry = VOICE_SCHEMA.properties.entries.items;
		expect(entry.required).toEqual(["type"]);
		expect(entry.properties.type.enum).toEqual(["stool", "symptom", "meal"]);
	});
});

describe("/parse-voice access control", () => {
	it("403s premium_required without an entitlement", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => anthropicResponse("end_turn")),
		);
		const r = await worker.fetch(
			makeReq({ transcript: "3 selles ce matin", deviceId: "d" }),
			makeEnv(),
			ctx,
		);
		expect(r.status).toBe(403);
		expect(await r.json()).toEqual({ error: "premium_required" });
	});

	it("allows a verified premium subscriber and returns parsed entries", async () => {
		const fetchMock = vi.fn(async (input: unknown) => {
			if (String(input).includes("revenuecat.com")) {
				return new Response(
					JSON.stringify({ subscriber: { entitlements: { premium: { expires_date: null } } } }),
					{ status: 200 },
				);
			}
			return anthropicResponse("end_turn");
		});
		vi.stubGlobal("fetch", fetchMock);
		const env = makeEnv({ REVENUECAT_API_KEY: "rc-key" });

		const r = await worker.fetch(
			makeReq({ transcript: "3 selles liquides ce matin", deviceId: "d", entitlementToken: "u1" }),
			env,
			ctx,
		);
		expect(r.status).toBe(200);
		const payload = await r.json();
		expect(payload.result.entries).toHaveLength(3);
		expect(payload.result.entries[0]).toMatchObject({ type: "stool", bristol: 6, count: 3 });
	});

	it("allows the demo escape hatch without an entitlement", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => anthropicResponse("end_turn")),
		);
		const r = await worker.fetch(
			makeReq({ transcript: "j'ai mangé une raclette hier soir", deviceId: "d" }),
			makeEnv({ DEMO_ALLOW_TRIAL: "true" }),
			ctx,
		);
		expect(r.status).toBe(200);
		expect((await r.json()).result.entries).toHaveLength(3);
	});

	it("rejects an empty transcript before any upstream call", async () => {
		const fetchMock = vi.fn(async () => anthropicResponse("end_turn"));
		vi.stubGlobal("fetch", fetchMock);
		const r = await worker.fetch(
			makeReq({ transcript: "   ", deviceId: "d" }),
			makeEnv({ DEMO_ALLOW_TRIAL: "true" }),
			ctx,
		);
		expect(r.status).toBe(400);
		expect(await r.json()).toEqual({ error: "empty_transcript" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends the frozen cached voice prompt and text-only content", async () => {
		const fetchMock = vi.fn<(input: unknown, init: { body: string }) => Promise<Response>>(
			async () => anthropicResponse("end_turn"),
		);
		vi.stubGlobal("fetch", fetchMock);
		await worker.fetch(
			makeReq({ transcript: "grosse fatigue aujourd'hui", deviceId: "d" }),
			makeEnv({ DEMO_ALLOW_TRIAL: "true" }),
			ctx,
		);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.model).toBe("claude-haiku-4-5");
		expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
		// No image blocks — text only (privacy: no audio, no image).
		expect(body.messages[0].content.every((b: { type: string }) => b.type === "text")).toBe(true);
	});
});
