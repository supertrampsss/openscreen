import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type HbiInputs, hbi, hbiBand, hbiInputsFromEntries } from "./hbi";

const base: HbiInputs = { wellbeing: 0, pain: 0, liquidStoolCount: 0, complications: [] };

describe("hbi — table de vérité", () => {
	const cases: [HbiInputs, number, string][] = [
		[{ wellbeing: 0, pain: 0, liquidStoolCount: 0, complications: [] }, 0, "remission"],
		[{ wellbeing: 1, pain: 1, liquidStoolCount: 1, complications: [] }, 3, "remission"],
		[{ wellbeing: 2, pain: 1, liquidStoolCount: 2, complications: [] }, 5, "mild"],
		[{ wellbeing: 2, pain: 2, liquidStoolCount: 2, complications: ["fistula"] }, 7, "mild"],
		[{ wellbeing: 3, pain: 2, liquidStoolCount: 3, complications: [] }, 8, "moderate"],
		[{ wellbeing: 2, pain: 3, liquidStoolCount: 5, complications: ["uveitis"] }, 11, "moderate"],
		[
			{ wellbeing: 4, pain: 3, liquidStoolCount: 8, complications: ["fistula", "abscess"] },
			17,
			"severe",
		],
	];
	for (const [input, score, band] of cases) {
		it(`score ${score} → ${band}`, () => {
			expect(hbi(input)).toEqual({ score, band });
		});
	}
});

describe("hbi — null si donnée subjective manquante", () => {
	it("wellbeing manquant → null", () => {
		expect(hbi({ ...base, wellbeing: null })).toBeNull();
	});
	it("pain manquant → null", () => {
		expect(hbi({ ...base, pain: null })).toBeNull();
	});
	it("les deux présents → non null même à 0 (pas de zéro fabriqué : le 0 est réel)", () => {
		expect(hbi(base)).not.toBeNull();
	});
});

describe("hbi — bandes aux bornes exactes", () => {
	it("4 → remission, 5 → mild", () => {
		expect(hbiBand(4)).toBe("remission");
		expect(hbiBand(5)).toBe("mild");
	});
	it("7 → mild, 8 → moderate", () => {
		expect(hbiBand(7)).toBe("mild");
		expect(hbiBand(8)).toBe("moderate");
	});
	it("16 → moderate, 17 → severe", () => {
		expect(hbiBand(16)).toBe("moderate");
		expect(hbiBand(17)).toBe("severe");
	});
});

describe("hbi — propriétés (fast-check)", () => {
	const arbInputs = fc.record({
		wellbeing: fc.integer({ min: 0, max: 4 }),
		pain: fc.integer({ min: 0, max: 3 }),
		liquidStoolCount: fc.nat({ max: 30 }),
		complications: fc.array(fc.constantFrom("a", "b", "c", "d"), { maxLength: 8 }),
	});

	it("score ≥ 0 et band cohérente avec score", () => {
		fc.assert(
			fc.property(arbInputs, (input) => {
				const r = hbi(input);
				expect(r).not.toBeNull();
				if (!r) return;
				expect(r.score).toBeGreaterThanOrEqual(0);
				expect(r.band).toBe(hbiBand(r.score));
			}),
		);
	});

	it("monotonie croissante en chaque composant", () => {
		fc.assert(
			fc.property(arbInputs, (input) => {
				const s0 = hbi(input)?.score ?? 0;
				expect(hbi({ ...input, wellbeing: input.wellbeing + 1 })?.score).toBe(s0 + 1);
				expect(hbi({ ...input, pain: input.pain + 1 })?.score).toBe(s0 + 1);
				expect(hbi({ ...input, liquidStoolCount: input.liquidStoolCount + 1 })?.score).toBe(s0 + 1);
				expect(hbi({ ...input, complications: [...input.complications, "x"] })?.score).toBe(s0 + 1);
			}),
		);
	});
});

describe("hbiInputsFromEntries — agrégation worst-of-day", () => {
	it("prend le pire (max) de wellbeing/pain et compte les selles liquides", () => {
		const inputs = hbiInputsFromEntries(
			[
				{ bristol: 6, pain: 1, wellbeing: 1 },
				{ bristol: 7, pain: 3, wellbeing: 2 },
				{ bristol: 4, pain: null, wellbeing: null },
			],
			{ complications: ["fistula", "uveitis"] },
		);
		expect(inputs).toEqual({
			wellbeing: 2,
			pain: 3,
			liquidStoolCount: 2,
			complications: ["fistula", "uveitis"],
		});
	});

	it("wellbeing/pain null si aucune valeur du jour → hbi renvoie null", () => {
		const inputs = hbiInputsFromEntries([{ bristol: 6 }], null);
		expect(inputs.wellbeing).toBeNull();
		expect(inputs.pain).toBeNull();
		expect(hbi(inputs)).toBeNull();
	});
});
