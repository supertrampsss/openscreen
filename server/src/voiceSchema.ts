/**
 * Structured-output JSON schema for /parse-voice (§6.1, §7).
 *
 * Contract (do NOT reorder — field order is part of the frozen grammar):
 *   1. reasoning — short thinking step, ordered FIRST (lightweight chain-of-thought)
 *   2. entries[] — one per distinct event, each with a `type` enum + optional
 *      per-type fields (stool: bristol/count; symptom: pain/fatigue; meal: name)
 *      plus the shared timeOfDay/notes.
 *
 * Rules (asserted by voice.test.ts):
 *  - `additionalProperties: false` on EVERY object node.
 *  - a `description` on EVERY property (English — read by the model).
 *  - only `type` is required per entry; every other field is optional so the
 *    model omits what does not apply.
 *
 * The schema is frozen: Anthropic compiles the grammar and caches it 24 h.
 */

/** One diary event extracted from the transcript. */
const ENTRY = {
	type: "object",
	description:
		"A single diary event extracted from the transcript. Fill only the fields relevant to its type.",
	additionalProperties: false,
	properties: {
		type: {
			type: "string",
			enum: ["stool", "symptom", "meal"],
			description: "The kind of event: a bowel movement, a symptom report, or a meal.",
		},
		timeOfDay: {
			type: "string",
			enum: [
				"morning",
				"midday",
				"afternoon",
				"evening",
				"night",
				"yesterday_evening",
				"unspecified",
			],
			description:
				"When the event happened, mapped from the French time words. Use 'unspecified' when no time is stated.",
		},
		bristol: {
			type: "integer",
			minimum: 1,
			maximum: 7,
			description:
				"Stool only. Bristol Stool Scale 1-7 (1 hard lumps … 7 entirely liquid). Liquid ≈ 6-7, soft ≈ 5-6, normal ≈ 4.",
		},
		count: {
			type: "integer",
			minimum: 1,
			maximum: 20,
			description: "Stool only. How many stools this entry describes ('3 selles' → 3). Default 1.",
		},
		pain: {
			type: "integer",
			minimum: 0,
			maximum: 3,
			description:
				"Symptom only. Pain on the app 0-3 scale. Convert a patient 0-10 wording by dividing by 3 and rounding (0-1→0, 2-4→1, 5-7→2, 8-10→3).",
		},
		fatigue: {
			type: "integer",
			minimum: 0,
			maximum: 3,
			description: "Symptom only. Fatigue on the app 0-3 scale (same 0-10 → 0-3 conversion rule).",
		},
		name: {
			type: "string",
			description: "Meal only. Short dish or food name in French, lowercase unless a proper noun.",
		},
		notes: {
			type: "string",
			description: "Optional short free-text detail in French (e.g. 'un peu de sang').",
		},
	},
	required: ["type"],
} as const;

/** Root schema passed to output_config.format.schema. */
export const VOICE_SCHEMA = {
	type: "object",
	description: "Structured diary entries extracted from a spoken note by an IBD patient.",
	additionalProperties: false,
	properties: {
		reasoning: {
			type: "string",
			description:
				"A short (one sentence) description of what was extracted and how. Ordered first as a lightweight thinking step — not a chat message.",
		},
		entries: {
			type: "array",
			description:
				"Every distinct event extracted from the transcript. Empty when nothing applies.",
			items: ENTRY,
		},
	},
	required: ["reasoning", "entries"],
} as const;

export type VoiceSchema = typeof VOICE_SCHEMA;
