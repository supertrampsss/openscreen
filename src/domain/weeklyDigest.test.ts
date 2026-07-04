import { describe, expect, it } from "vitest";
import { weeklyDigest } from "./weeklyDigest";

describe("weeklyDigest", () => {
	it("semaine vide → notable 'empty', moyenne null", () => {
		const d = weeklyDigest({
			dailyStools: [null, null, null, null, null, null, null],
			bloodDays: 0,
		});
		expect(d.documentedDays).toBe(0);
		expect(d.avgStools).toBeNull();
		expect(d.notable.kind).toBe("empty");
	});

	it("jours non documentés = trous, pas des zéros dans la moyenne", () => {
		const d = weeklyDigest({ dailyStools: [3, null, 5, null, 4, null, null], bloodDays: 0 });
		expect(d.documentedDays).toBe(3);
		expect(d.totalStools).toBe(12);
		expect(d.avgStools).toBe(4);
	});

	it("semaine ≥3 jours sans sang → notable 'noBlood'", () => {
		const d = weeklyDigest({ dailyStools: [3, 4, 3, null, null, null, null], bloodDays: 0 });
		expect(d.notable.kind).toBe("noBlood");
	});

	it("baisse des selles vs semaine précédente → notable 'fewerStools'", () => {
		const d = weeklyDigest({
			dailyStools: [2, 3, 2, 3, null, null, null],
			bloodDays: 2, // du sang → pas 'noBlood'
			previousAvgStools: 5,
		});
		expect(d.notable.kind).toBe("fewerStools");
	});

	it("semaine complète documentée (avec du sang, pas de baisse) → 'fullWeek'", () => {
		const d = weeklyDigest({
			dailyStools: [4, 4, 4, 4, 4, 4, 4],
			bloodDays: 4,
			previousAvgStools: 4,
		});
		expect(d.notable.kind).toBe("fullWeek");
	});

	it("suivi partiel → notable 'documented' avec le compte", () => {
		const d = weeklyDigest({ dailyStools: [4, 4, null, null, null, null, null], bloodDays: 1 });
		expect(d.notable).toEqual({ kind: "documented", count: 2 });
	});
});
