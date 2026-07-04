import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	BASELINE_MIN_DAYS,
	classifyDay,
	medianOf,
	parseProfileBaseline,
	stoolNormalFromCounts,
} from "./baseline";

describe("medianOf", () => {
	it("liste impaire → centre", () => {
		expect(medianOf([3, 1, 2])).toBe(2);
	});
	it("liste paire → moyenne des deux centraux", () => {
		expect(medianOf([1, 2, 3, 4])).toBe(2.5);
	});
	it("liste vide → 0", () => {
		expect(medianOf([])).toBe(0);
	});
});

describe("stoolNormalFromCounts", () => {
	it("moins de 5 jours → null (pas de normale fabriquée)", () => {
		expect(stoolNormalFromCounts([3, 4, 3, 5])).toBeNull();
		expect(stoolNormalFromCounts([])).toBeNull();
	});

	it("assez de données → plage interquartile arrondie", () => {
		const normal = stoolNormalFromCounts([2, 3, 3, 4, 4, 5, 6]);
		expect(normal).not.toBeNull();
		if (normal) {
			expect(normal.low).toBeLessThanOrEqual(normal.high);
			expect(normal.low).toBeGreaterThanOrEqual(2);
			expect(normal.high).toBeLessThanOrEqual(6);
		}
	});

	it("valeurs identiques → plage plate", () => {
		expect(stoolNormalFromCounts([4, 4, 4, 4, 4])).toEqual({ low: 4, high: 4 });
	});
});

describe("parseProfileBaseline", () => {
	it("parse « 3-5 »", () => {
		expect(parseProfileBaseline("3-5")).toEqual({ low: 3, high: 5 });
	});
	it("parse « 10+ » en borne plate", () => {
		expect(parseProfileBaseline("10+")).toEqual({ low: 10, high: 10 });
	});
	it("valeur absente/inconnue → null", () => {
		expect(parseProfileBaseline(null)).toBeNull();
		expect(parseProfileBaseline(undefined)).toBeNull();
		expect(parseProfileBaseline("bizarre")).toBeNull();
	});
});

describe("classifyDay", () => {
	it("dans la normale si ≤ borne haute (jamais alarmiste pour peu de selles)", () => {
		expect(classifyDay(3, { low: 3, high: 5 })).toBe("within");
		expect(classifyDay(1, { low: 3, high: 5 })).toBe("within");
		expect(classifyDay(5, { low: 3, high: 5 })).toBe("within");
	});
	it("plus chargée seulement au-dessus de la borne haute", () => {
		expect(classifyDay(6, { low: 3, high: 5 })).toBe("busier");
	});
});

describe("propriétés (fast-check)", () => {
	it("stoolNormalFromCounts : toujours low ≤ high, jamais négatif", () => {
		fc.assert(
			fc.property(fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 5 }), (counts) => {
				const normal = stoolNormalFromCounts(counts);
				expect(normal).not.toBeNull();
				if (normal) {
					expect(normal.low).toBeGreaterThanOrEqual(0);
					expect(normal.low).toBeLessThanOrEqual(normal.high);
				}
			}),
		);
	});

	it("moins de BASELINE_MIN_DAYS → toujours null", () => {
		fc.assert(
			fc.property(
				fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: BASELINE_MIN_DAYS - 1 }),
				(counts) => {
					expect(stoolNormalFromCounts(counts)).toBeNull();
				},
			),
		);
	});
});
