import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "./prompt";

/**
 * The system prompt is frozen au byte près (it is prompt-cached). A snapshot
 * guards against accidental edits; the structural checks document the contract.
 */
describe("system prompt", () => {
	it("is a single frozen string (snapshot)", () => {
		expect(SYSTEM_PROMPT).toMatchSnapshot();
	});

	it("carries the required XML sections", () => {
		for (const tag of ["instructions", "taxonomy", "edge_cases", "examples"]) {
			expect(SYSTEM_PROMPT).toContain(`<${tag}>`);
			expect(SYSTEM_PROMPT).toContain(`</${tag}>`);
		}
	});

	it("names all nine trigger attributes", () => {
		for (const attr of [
			"fodmap",
			"lactose",
			"gluten",
			"fried",
			"spicy",
			"insoluble_fiber",
			"alcohol",
			"caffeine",
			"additives",
		]) {
			expect(SYSTEM_PROMPT).toContain(attr);
		}
	});

	it("includes three text few-shot examples and forbids grams", () => {
		expect(SYSTEM_PROMPT).toContain("Example 1");
		expect(SYSTEM_PROMPT).toContain("Example 2");
		expect(SYSTEM_PROMPT).toContain("Example 3");
		expect(SYSTEM_PROMPT).toContain("couscous royal");
		expect(SYSTEM_PROMPT.toLowerCase()).toContain("never report grams");
	});
});
