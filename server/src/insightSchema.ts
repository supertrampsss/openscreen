/**
 * Structured-output JSON schema for /weekly-insight (§7).
 *
 * Contract (do NOT reorder — field order is part of the frozen grammar):
 *   1. reasoning — short internal thinking step, ordered FIRST
 *   2. headline  — a very short title (≤ 6 words)
 *   3. insight   — the 3-5 kind, factual sentences shown to the user
 *
 * Rules (asserted by insight.test.ts): `additionalProperties: false`, a
 * `description` on every property, all three required.
 */
export const INSIGHT_SCHEMA = {
	type: "object",
	description: "A short, kind weekly insight for an IBD patient, from anonymous aggregates only.",
	additionalProperties: false,
	properties: {
		reasoning: {
			type: "string",
			description:
				"One short internal sentence on what the aggregates show. Ordered first as a lightweight thinking step — not shown to the user.",
		},
		headline: {
			type: "string",
			description:
				"A very short title (at most 6 words, no trailing period), in the requested language.",
		},
		insight: {
			type: "string",
			description:
				"3 to 5 short, factual, kind sentences grounded in the aggregates, in the requested language. Never medical advice, never alarmist.",
		},
	},
	required: ["reasoning", "headline", "insight"],
} as const;

export type InsightSchema = typeof INSIGHT_SCHEMA;
