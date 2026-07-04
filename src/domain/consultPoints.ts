/**
 * « 3 points à aborder avec votre gastro » — module PUR (§5.8, §2 loi 3).
 *
 * Règles LOCALES, déterministes, au ton FACTUEL (jamais alarmiste). Chaque point
 * porte sa donnée source (les nombres), JAMAIS une chaîne traduite : l'UI et le
 * HTML rendent le libellé via i18n / labels. Au plus 3 points ; si rien de
 * notable, un unique point de repli rassurant.
 *
 * Le domaine ne connaît ni i18next ni React : il renvoie `{ kind, data }`.
 */

import { medianOf } from "./baseline";

/** Nature d'un point à aborder (map vers une clé i18n côté UI/HTML). */
export type ConsultPointKind =
	| "visibleBlood"
	| "scoreAboveBaseline"
	| "highFatigue"
	| "nocturnalStools"
	| "allClear";

/** Un point + sa donnée source (interpolée par l'appelant). */
export interface ConsultPoint {
	kind: ConsultPointKind;
	data: Record<string, number | string>;
}

/** Un score daté (jour documenté avec score calculable), ordre chronologique. */
export interface DatedScore {
	date: string;
	score: number;
}

export interface ConsultPointsInput {
	/** Jours documentés sur la période (le « sur M »). */
	documentedDays: number;
	/** Jours avec sang VISIBLE (blood ≥ 2) sur la période. */
	visibleBloodDays: number;
	/** Jours avec fatigue élevée (≥ 2) sur la période. */
	highFatigueDays: number;
	/** Nombre de selles nocturnes (23h-6h) sur la période. */
	nocturnalStools: number;
	/** Scores HBI/SCCAI datés (jours documentés calculables), chronologiques. */
	scoreByDate: DatedScore[];
}

/** Seuils (documentés ici, testés unitairement un par un). */
export const CONSULT_THRESHOLDS = {
	visibleBloodDays: 3,
	highFatigueDays: 7,
	nocturnalStools: 3,
	/** Nb minimal de jours de score pour parler d'une « plage habituelle ». */
	minScoreDays: 7,
	/** Taille de la fenêtre récente comparée à la médiane de période. */
	recentWindow: 7,
} as const;

const MAX_POINTS = 3;

/**
 * Construit au plus 3 points, par ordre de priorité clinique
 * (sang → score au-dessus de la normale → fatigue → selles nocturnes).
 * Repli unique « aucun signal particulier » si rien ne dépasse les seuils.
 */
export function consultPoints(input: ConsultPointsInput): ConsultPoint[] {
	const points: ConsultPoint[] = [];

	// 1. Sang visible rapporté N jours sur M (N ≥ 3).
	if (input.visibleBloodDays >= CONSULT_THRESHOLDS.visibleBloodDays) {
		points.push({
			kind: "visibleBlood",
			data: { days: input.visibleBloodDays, total: input.documentedDays },
		});
	}

	// 2. Score au-dessus de la plage habituelle (médiane 7 j > médiane période).
	const scorePoint = scoreAboveBaselinePoint(input.scoreByDate);
	if (scorePoint) points.push(scorePoint);

	// 3. Fatigue élevée (≥2) rapportée N jours (N ≥ 7).
	if (input.highFatigueDays >= CONSULT_THRESHOLDS.highFatigueDays) {
		points.push({ kind: "highFatigue", data: { days: input.highFatigueDays } });
	}

	// 4. Selles nocturnes sur la période (≥ 3).
	if (input.nocturnalStools >= CONSULT_THRESHOLDS.nocturnalStools) {
		points.push({ kind: "nocturnalStools", data: { count: input.nocturnalStools } });
	}

	if (points.length === 0) {
		return [{ kind: "allClear", data: {} }];
	}
	return points.slice(0, MAX_POINTS);
}

/**
 * Point « score au-dessus de la plage habituelle » : compare la médiane des
 * `recentWindow` derniers scores à la médiane de la période. Renvoie `null`
 * si trop peu de données ou si le récent n'excède pas l'habituel.
 * `since` = première date de la fenêtre récente dépassant la médiane de période.
 */
function scoreAboveBaselinePoint(scoreByDate: DatedScore[]): ConsultPoint | null {
	if (scoreByDate.length < CONSULT_THRESHOLDS.minScoreDays) return null;
	const all = scoreByDate.map((s) => s.score);
	const periodMedian = medianOf(all);
	const recent = scoreByDate.slice(-CONSULT_THRESHOLDS.recentWindow);
	const recentMedian = medianOf(recent.map((s) => s.score));
	if (recentMedian <= periodMedian) return null;
	const onset = recent.find((s) => s.score > periodMedian) ?? recent[0];
	return { kind: "scoreAboveBaseline", data: { since: onset.date } };
}
