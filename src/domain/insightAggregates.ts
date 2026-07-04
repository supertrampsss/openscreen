/**
 * Insight IA hebdo — agrégats ANONYMES (§6, §7, §2 loi 4). Module PUR.
 *
 * CONTRAT DE PRIVACY (testé) : l'objet renvoyé ne contient QUE des nombres, des
 * énumérations et des libellés génériques (clés de déclencheurs type « lactose »).
 * JAMAIS de note libre, JAMAIS de date précise, JAMAIS de nom d'aliment custom —
 * rien qui puisse ré-identifier ou fuiter du contenu de santé. C'est ce seul
 * objet qui part au proxy pour rédiger l'insight ; les données brutes ne sortent
 * jamais de l'appareil.
 */

import { medianOf } from "./baseline";

export type InsightScoreKind = "hbi" | "sccai";

/** Motif d'un libellé d'association générique autorisé (clé, aucun espace). */
export const GENERIC_LABEL_PATTERN = /^[a-z_]+$/;

export interface InsightAggregatesInput {
	/** Selles par jour sur la période ; `null` = jour non documenté (jamais 0). */
	dailyStools: (number | null)[];
	/** Pire douleur par jour (0-3) ; `null` = non renseigné. */
	painValues: (number | null)[];
	/** Niveau de sang par jour (0-2). */
	bloodByDay: number[];
	/** Scores HBI/SCCAI des jours documentés calculables. */
	scores: number[];
	scoreKind: InsightScoreKind;
	/** Libellés GÉNÉRIQUES d'associations (clés de déclencheurs), déjà top-N. */
	triggerAssociations: string[];
	/** Observance traitement en %, ou `null` si non pertinent. */
	adherencePct: number | null;
}

/**
 * Agrégat anonyme envoyé au proxy. Forme FIGÉE et vérifiée par le test : toute
 * addition d'un champ texte libre / date casse le contrat de privacy.
 */
export interface InsightAggregates {
	/** Longueur de la fenêtre (un COMPTE de jours, pas une date). */
	periodDays: number;
	documentedDays: number;
	/** Moyenne de selles/jour documenté (1 décimale), `null` si aucun. */
	avgStoolsPerDay: number | null;
	/** Jours avec douleur ≥ 2. */
	painDays: number;
	/** Jours avec du sang (> 0). */
	bloodDays: number;
	scoreKind: InsightScoreKind;
	scoreMin: number | null;
	scoreMax: number | null;
	scoreMedian: number | null;
	/** Libellés génériques (max 3), aucun texte libre. */
	topAssociations: string[];
	adherencePct: number | null;
}

/** Les clés exactes de l'objet agrégat (référence du test de forme). */
export const INSIGHT_AGGREGATE_KEYS = [
	"periodDays",
	"documentedDays",
	"avgStoolsPerDay",
	"painDays",
	"bloodDays",
	"scoreKind",
	"scoreMin",
	"scoreMax",
	"scoreMedian",
	"topAssociations",
	"adherencePct",
] as const;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Construit l'agrégat anonyme à partir des primitives de l'écran Tendances. */
export function buildInsightAggregates(input: InsightAggregatesInput): InsightAggregates {
	const documented = input.dailyStools.filter((v): v is number => v != null);
	const documentedDays = documented.length;
	const avgStoolsPerDay =
		documentedDays > 0 ? round1(documented.reduce((a, b) => a + b, 0) / documentedDays) : null;
	const painDays = input.painValues.filter((v): v is number => v != null && v >= 2).length;
	const bloodDays = input.bloodByDay.filter((v) => v > 0).length;

	const scores = input.scores.filter((v) => Number.isFinite(v));
	const hasScores = scores.length > 0;

	// Seulement des libellés génériques (clés), déduplication + plafond 3.
	const topAssociations = [...new Set(input.triggerAssociations)]
		.filter((k) => GENERIC_LABEL_PATTERN.test(k))
		.slice(0, 3);

	return {
		periodDays: input.dailyStools.length,
		documentedDays,
		avgStoolsPerDay,
		painDays,
		bloodDays,
		scoreKind: input.scoreKind,
		scoreMin: hasScores ? Math.min(...scores) : null,
		scoreMax: hasScores ? Math.max(...scores) : null,
		scoreMedian: hasScores ? round1(medianOf(scores)) : null,
		topAssociations,
		adherencePct:
			input.adherencePct == null
				? null
				: Math.max(0, Math.min(100, Math.round(input.adherencePct))),
	};
}
