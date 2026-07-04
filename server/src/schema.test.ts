import { describe, expect, it } from "vitest";
import { SCHEMA } from "./schema";

/**
 * The schema is contractual (§6). We walk it recursively and assert the two
 * invariants Anthropic structured outputs relies on: every object node sets
 * `additionalProperties: false`, and every property carries a `description`.
 */

type Node = Record<string, unknown>;

function walk(node: Node, path: string, visit: (n: Node, path: string) => void): void {
	visit(node, path);
	if (node.type === "object") {
		const props = (node.properties ?? {}) as Record<string, Node>;
		for (const [key, child] of Object.entries(props)) {
			walk(child, `${path}.${key}`, visit);
		}
	}
	if (node.type === "array" && node.items) {
		walk(node.items as Node, `${path}[]`, visit);
	}
}

describe("meal schema", () => {
	it("sets additionalProperties:false on every object node", () => {
		const offenders: string[] = [];
		walk(SCHEMA as unknown as Node, "root", (n, path) => {
			if (n.type === "object" && n.additionalProperties !== false) offenders.push(path);
		});
		expect(offenders).toEqual([]);
	});

	it("gives every property a description", () => {
		const offenders: string[] = [];
		walk(SCHEMA as unknown as Node, "root", (n, path) => {
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

	it("orders reasoning first and lists all four root fields as required", () => {
		const props = Object.keys(SCHEMA.properties);
		expect(props[0]).toBe("reasoning");
		expect(props).toEqual(["reasoning", "is_food", "dishes", "notes"]);
		expect(SCHEMA.required).toEqual(["reasoning", "is_food", "dishes", "notes"]);
	});

	it("defines the nine trigger attributes as required", () => {
		const triggers =
			SCHEMA.properties.dishes.items.properties.ingredients.items.properties.triggers;
		expect(triggers.required).toEqual([
			"fodmap",
			"lactose",
			"gluten",
			"fried",
			"spicy",
			"insoluble_fiber",
			"alcohol",
			"caffeine",
			"additives",
		]);
		expect(triggers.properties.fodmap.enum).toEqual(["low", "medium", "high"]);
	});

	it("restricts portion and confidence to the documented enums", () => {
		const ingredient = SCHEMA.properties.dishes.items.properties.ingredients.items;
		expect(ingredient.properties.portion.enum).toEqual(["small", "medium", "large"]);
		expect(SCHEMA.properties.dishes.items.properties.confidence.enum).toEqual([
			"high",
			"medium",
			"low",
		]);
	});
});
