import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";
import { INSIGHT_SCHEMA } from "./insightSchema";

/**
 * /weekly-insight tests — PREMIUM-only, anonymous aggregates only. Global fetch
 * mocked, KV in-memory. No real network, no real keys (§7).
 */

const ctx = { waitUntil: () => undefined };

type Node = Record<string, unknown>;
function walk(node: Node, path: string, visit: (n: Node, path: string) => void): void {
	visit(node, path);
	if (node.type === "object") {
		const props = (node.properties ?? {}) as Record<string, Node>;
		for (const [key, child] of Object.entries(props)) walk(child, `${path}.${key}`, visit);
	}
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

const RESULT = {
	reasoning: "quiet week",
	headline: "Une semaine régulière",
	insight: "Vous avez documenté 5 jours cette semaine. Aucun jour avec du sang.",
};

function anthropicResponse(stopReason: string, result: unknown = RESULT): Response {
	return new Response(
		JSON.stringify({
			stop_reason: stopReason,
			content: [{ type: "text", text: JSON.stringify(result) }],
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
}

const AGG = {
	periodDays: 7,
	documentedDays: 5,
	avgStoolsPerDay: 4,
	painDays: 2,
	bloodDays: 0,
	scoreKind: "hbi",
	scoreMin: 3,
	scoreMax: 8,
	scoreMedian: 5,
	topAssociations: ["lactose", "fried"],
	adherencePct: 90,
};

function makeReq(body: Record<string, unknown>): Request {
	return new Request("https://proxy.example/weekly-insight", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("insight schema", () => {
	it("sets additionalProperties:false and descriptions, reasoning first, all required", () => {
		const offenders: string[] = [];
		walk(INSIGHT_SCHEMA as unknown as Node, "root", (n, path) => {
			if (n.type === "object") {
				if (n.additionalProperties !== false) offenders.push(`${path}:addl`);
				const props = (n.properties ?? {}) as Record<string, Node>;
				for (const [key, child] of Object.entries(props)) {
					if (typeof child.description !== "string" || !child.description.length) {
						offenders.push(`${path}.${key}:desc`);
					}
				}
			}
		});
		expect(offenders).toEqual([]);
		expect(Object.keys(INSIGHT_SCHEMA.properties)[0]).toBe("reasoning");
		expect(INSIGHT_SCHEMA.required).toEqual(["reasoning", "headline", "insight"]);
	});
});

describe("/weekly-insight", () => {
	it("403s premium_required without an entitlement", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => anthropicResponse("end_turn")),
		);
		const r = await worker.fetch(
			makeReq({ aggregates: AGG, lang: "fr", deviceId: "d" }),
			makeEnv(),
			ctx,
		);
		expect(r.status).toBe(403);
		expect(await r.json()).toEqual({ error: "premium_required" });
	});

	it("returns a headline + insight for a premium (demo) caller", async () => {
		const fetchMock = vi.fn<(input: unknown, init: { body: string }) => Promise<Response>>(
			async () => anthropicResponse("end_turn"),
		);
		vi.stubGlobal("fetch", fetchMock);
		const r = await worker.fetch(
			makeReq({ aggregates: AGG, lang: "fr", deviceId: "d" }),
			makeEnv({ DEMO_ALLOW_TRIAL: "true" }),
			ctx,
		);
		expect(r.status).toBe(200);
		const payload = await r.json();
		expect(payload.result.headline).toBeTruthy();
		expect(payload.result.insight).toBeTruthy();
		// The frozen prompt is cached and the aggregates are sent as text.
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
		expect(body.messages[0].content[0].text).toContain("French");
	});

	it("rejects a missing aggregates object", async () => {
		const fetchMock = vi.fn(async () => anthropicResponse("end_turn"));
		vi.stubGlobal("fetch", fetchMock);
		const r = await worker.fetch(
			makeReq({ lang: "fr", deviceId: "d" }),
			makeEnv({ DEMO_ALLOW_TRIAL: "true" }),
			ctx,
		);
		expect(r.status).toBe(400);
		expect(await r.json()).toEqual({ error: "missing_aggregates" });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
