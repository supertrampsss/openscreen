/**
 * Structured-output JSON schema for /analyze-meal (§6 of the product bible).
 *
 * Contract (do NOT reorder — the field order is part of the frozen grammar):
 *   1. reasoning  — short thinking step, ordered FIRST (lightweight chain-of-thought)
 *   2. is_food    — whether the photo contains food at all
 *   3. dishes[]   — each with name, confidence enum, ingredients[] (portion enum + 9 triggers)
 *   4. notes      — free-text caveats
 *
 * Rules enforced by the schema (and asserted by schema.test.ts):
 *  - `additionalProperties: false` on EVERY object node.
 *  - a `description` on EVERY property (in English — it is read by the model).
 *  - exhaustive `required` arrays.
 *
 * The schema is frozen: Anthropic compiles the grammar and caches it 24 h, so any
 * byte change invalidates that cache. Keep it deterministic.
 */

/** The nine IBD trigger attributes (fodmap enum + eight booleans), per ingredient. */
const TRIGGERS = {
	type: "object",
	description:
		"The nine IBD dietary trigger attributes for this single ingredient. Use the most neutral value when uncertain.",
	additionalProperties: false,
	properties: {
		fodmap: {
			type: "string",
			enum: ["low", "medium", "high"],
			description:
				"Fermentable-carbohydrate (FODMAP) load, graded per the Monash University classification. Use 'medium' when uncertain.",
		},
		lactose: {
			type: "boolean",
			description:
				"True for non-aged dairy that still contains lactose (milk, cream, fresh cheese, yoghurt, ice cream). Hard aged cheeses are effectively lactose-free.",
		},
		gluten: {
			type: "boolean",
			description:
				"True when the ingredient contains wheat, barley or rye (bread, pasta, breading, most flours, beer).",
		},
		fried: {
			type: "boolean",
			description: "True when deep-fried, pan-fried in abundant fat, or breaded-and-fried.",
		},
		spicy: {
			type: "boolean",
			description: "True when chili, hot pepper or strong pungent spices are present.",
		},
		insoluble_fiber: {
			type: "boolean",
			description:
				"True for tough insoluble fibre: fruit/vegetable skins, seeds, raw crunchy vegetables (crudités), whole-grain cereals, nuts, corn.",
		},
		alcohol: {
			type: "boolean",
			description:
				"True when the ingredient contains alcohol that is not cooked off (wine, beer, spirits, alcohol-based sauces).",
		},
		caffeine: {
			type: "boolean",
			description: "True for coffee, black/green tea, cola, dark chocolate, energy drinks.",
		},
		additives: {
			type: "boolean",
			description:
				"True when the item is visibly ultra-processed and likely to contain emulsifiers, thickeners or other additives (industrial sauces, deli/processed meats, sodas, packaged snacks).",
		},
	},
	required: [
		"fodmap",
		"lactose",
		"gluten",
		"fried",
		"spicy",
		"insoluble_fiber",
		"alcohol",
		"caffeine",
		"additives",
	],
} as const;

/** One visible ingredient inside a dish. */
const INGREDIENT = {
	type: "object",
	description: "A single ingredient that is visible in, or confidently inferred from, the dish.",
	additionalProperties: false,
	properties: {
		name: {
			type: "string",
			description:
				"Short ingredient name in French, lowercase unless a proper noun. Never invent an ingredient you cannot see.",
		},
		portion: {
			type: "string",
			enum: ["small", "medium", "large"],
			description:
				"Approximate portion size. Only small, medium or large — never grams or calories.",
		},
		triggers: TRIGGERS,
	},
	required: ["name", "portion", "triggers"],
} as const;

/** One distinct dish detected in the photo(s). */
const DISH = {
	type: "object",
	description: "A distinct dish detected in the photo(s).",
	additionalProperties: false,
	properties: {
		name: {
			type: "string",
			description: "Short dish name in French, lowercase unless a proper noun.",
		},
		confidence: {
			type: "string",
			enum: ["high", "medium", "low"],
			description:
				"Honest confidence for this dish: high when clearly identifiable, medium when partly inferred, low when the image is ambiguous.",
		},
		ingredients: {
			type: "array",
			description: "The ingredients of this dish, each with its portion and trigger attributes.",
			items: INGREDIENT,
		},
	},
	required: ["name", "confidence", "ingredients"],
} as const;

/** Root schema passed to output_config.format.schema. */
export const SCHEMA = {
	type: "object",
	description: "Structured analysis of a meal photo for an IBD food diary.",
	additionalProperties: false,
	properties: {
		reasoning: {
			type: "string",
			description:
				"A short (one or two sentences) description of what is visible and how the analysis was decided. Ordered first as a lightweight thinking step — not a chat message.",
		},
		is_food: {
			type: "boolean",
			description:
				"Whether the photo actually contains food. False for non-food photos (people, objects, landscapes).",
		},
		dishes: {
			type: "array",
			description: "Every distinct dish detected. Empty when is_food is false.",
			items: DISH,
		},
		notes: {
			type: "string",
			description:
				"Short free-text caveats for the user (uncertainty, hidden components, portion approximation). May be empty.",
		},
	},
	required: ["reasoning", "is_food", "dishes", "notes"],
} as const;

export type MealSchema = typeof SCHEMA;
