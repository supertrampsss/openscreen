import { describe, expect, it } from "vitest";
import { CONSULT_THRESHOLDS, type ConsultPointsInput, consultPoints } from "./consultPoints";

const BASE: ConsultPointsInput = {
	documentedDays: 30,
	visibleBloodDays: 0,
	highFatigueDays: 0,
	nocturnalStools: 0,
	scoreByDate: [],
};

function kinds(input: Partial<ConsultPointsInput>): string[] {
	return consultPoints({ ...BASE, ...input }).map((p) => p.kind);
}

describe("consultPoints — repli", () => {
	it("aucun signal → un unique point rassurant allClear", () => {
		const points = consultPoints(BASE);
		expect(points).toEqual([{ kind: "allClear", data: {} }]);
	});
});

describe("consultPoints — sang visible", () => {
	it("sous le seuil (2 jours) → pas de point sang", () => {
		expect(kinds({ visibleBloodDays: 2 })).not.toContain("visibleBlood");
	});
	it("au seuil (3 jours) → point sang avec N sur M", () => {
		const p = consultPoints({ ...BASE, visibleBloodDays: 3, documentedDays: 28 });
		expect(p[0]).toEqual({ kind: "visibleBlood", data: { days: 3, total: 28 } });
	});
});

describe("consultPoints — score au-dessus de la plage habituelle", () => {
	function scores(vals: number[]): { date: string; score: number }[] {
		return vals.map((score, i) => ({ date: `2026-06-${String(i + 1).padStart(2, "0")}`, score }));
	}

	it("trop peu de jours (< minScoreDays) → pas de point score", () => {
		expect(kinds({ scoreByDate: scores([3, 4, 8, 9]) })).not.toContain("scoreAboveBaseline");
	});

	it("récent stable = médiane période → pas de point", () => {
		expect(kinds({ scoreByDate: scores([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]) })).not.toContain(
			"scoreAboveBaseline",
		);
	});

	it("médiane récente > médiane période → point avec date d'apparition", () => {
		// 7 jours bas puis 7 jours hauts : la fenêtre récente médiane (10) > période.
		const vals = [2, 2, 2, 2, 2, 2, 2, 10, 10, 10, 10, 10, 10, 10];
		const p = consultPoints({ ...BASE, scoreByDate: scores(vals) });
		const score = p.find((x) => x.kind === "scoreAboveBaseline");
		expect(score).toBeDefined();
		// La date « depuis le J » = 1re date de la fenêtre récente dépassant la médiane.
		expect(typeof score?.data.since).toBe("string");
	});
});

describe("consultPoints — fatigue élevée", () => {
	it("sous le seuil (6 jours) → pas de point fatigue", () => {
		expect(kinds({ highFatigueDays: 6 })).not.toContain("highFatigue");
	});
	it("au seuil (7 jours) → point fatigue avec N", () => {
		const p = consultPoints({ ...BASE, highFatigueDays: 7 });
		expect(p[0]).toEqual({ kind: "highFatigue", data: { days: 7 } });
	});
});

describe("consultPoints — selles nocturnes", () => {
	it("sous le seuil (2) → pas de point nocturne", () => {
		expect(kinds({ nocturnalStools: 2 })).not.toContain("nocturnalStools");
	});
	it("au seuil (3) → point nocturne avec le compte", () => {
		const p = consultPoints({ ...BASE, nocturnalStools: 3 });
		expect(p[0]).toEqual({ kind: "nocturnalStools", data: { count: 3 } });
	});
});

describe("consultPoints — priorité & plafond", () => {
	it("plafonne à 3 points même si les 4 règles se déclenchent", () => {
		const vals = [2, 2, 2, 2, 2, 2, 2, 10, 10, 10, 10, 10, 10, 10];
		const p = consultPoints({
			documentedDays: 30,
			visibleBloodDays: 5,
			highFatigueDays: 9,
			nocturnalStools: 4,
			scoreByDate: vals.map((score, i) => ({
				date: `2026-06-${String(i + 1).padStart(2, "0")}`,
				score,
			})),
		});
		expect(p).toHaveLength(3);
		// Ordre de priorité : sang, score, fatigue (nocturne évincé).
		expect(p.map((x) => x.kind)).toEqual(["visibleBlood", "scoreAboveBaseline", "highFatigue"]);
	});

	it("les seuils exportés sont cohérents", () => {
		expect(CONSULT_THRESHOLDS.visibleBloodDays).toBe(3);
		expect(CONSULT_THRESHOLDS.highFatigueDays).toBe(7);
		expect(CONSULT_THRESHOLDS.nocturnalStools).toBe(3);
	});
});
