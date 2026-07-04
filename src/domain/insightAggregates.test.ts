import { describe, expect, it } from "vitest";
import {
	buildInsightAggregates,
	GENERIC_LABEL_PATTERN,
	INSIGHT_AGGREGATE_KEYS,
	type InsightAggregatesInput,
} from "./insightAggregates";

/**
 * Test CONTRACTUEL de privacy (§2 loi 4) : l'agrégat envoyé au proxy ne doit
 * contenir QUE des nombres / énumérations / libellés génériques — jamais de note
 * libre ni de date précise. On vérifie la forme EXACTE de l'objet.
 */

const INPUT: InsightAggregatesInput = {
	dailyStools: [3, null, 4, 5, 2, null, 6],
	painValues: [1, null, 2, 3, 0, null, 2],
	bloodByDay: [0, 0, 1, 0, 2, 0, 0],
	scores: [4, 6, 5, 8, 3],
	scoreKind: "hbi",
	triggerAssociations: ["lactose", "fried", "fodmap", "insoluble_fiber"],
	adherencePct: 87.4,
};

describe("buildInsightAggregates — forme & privacy", () => {
	const agg = buildInsightAggregates(INPUT);

	it("expose EXACTEMENT les clés attendues (aucun champ en plus)", () => {
		expect(Object.keys(agg).sort()).toEqual([...INSIGHT_AGGREGATE_KEYS].sort());
	});

	it("ne contient que des nombres, null, une enum score, et des libellés génériques", () => {
		for (const [key, value] of Object.entries(agg)) {
			if (key === "topAssociations") {
				expect(Array.isArray(value)).toBe(true);
				for (const label of value as string[]) {
					// Aucun espace, aucune ponctuation, aucune date → clé générique.
					expect(label).toMatch(GENERIC_LABEL_PATTERN);
				}
			} else if (key === "scoreKind") {
				expect(["hbi", "sccai"]).toContain(value);
			} else {
				expect(value === null || typeof value === "number").toBe(true);
			}
		}
	});

	it("aucune valeur ne ressemble à une date (YYYY-MM-DD) ni à du texte libre", () => {
		const serialized = JSON.stringify(agg);
		expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}/);
		// Les seules chaînes présentes sont l'enum + les clés génériques.
		const strings = JSON.stringify(agg).match(/"[^"]*"/g) ?? [];
		for (const s of strings) {
			const inner = s.slice(1, -1);
			// clé d'objet OU valeur : tout doit être [a-z_] (clés camelCase incluses).
			expect(inner).toMatch(/^[a-zA-Z_]+$/);
		}
	});

	it("calcule les agrégats correctement", () => {
		expect(agg.periodDays).toBe(7);
		expect(agg.documentedDays).toBe(5);
		expect(agg.avgStoolsPerDay).toBe(4); // (3+4+5+2+6)/5
		expect(agg.painDays).toBe(3); // 2,3,2
		expect(agg.bloodDays).toBe(2);
		expect(agg.scoreMin).toBe(3);
		expect(agg.scoreMax).toBe(8);
		expect(agg.scoreMedian).toBe(5);
		expect(agg.topAssociations).toEqual(["lactose", "fried", "fodmap"]); // plafonné à 3
		expect(agg.adherencePct).toBe(87);
	});

	it("gère une période vide sans fabriquer de valeurs", () => {
		const empty = buildInsightAggregates({
			dailyStools: [null, null],
			painValues: [null, null],
			bloodByDay: [0, 0],
			scores: [],
			scoreKind: "sccai",
			triggerAssociations: [],
			adherencePct: null,
		});
		expect(empty.avgStoolsPerDay).toBeNull();
		expect(empty.scoreMedian).toBeNull();
		expect(empty.adherencePct).toBeNull();
		expect(empty.topAssociations).toEqual([]);
	});

	it("rejette un libellé non générique (nom d'aliment custom avec espace)", () => {
		const agg2 = buildInsightAggregates({
			...INPUT,
			triggerAssociations: ["poulet basquaise", "lactose"],
		});
		expect(agg2.topAssociations).toEqual(["lactose"]);
	});
});
