/**
 * Séries de score par jour (HBI/SCCAI) — module PUR (§5.1, §5.7).
 *
 * Réutilise `hbiInputsFromEntries`/`sccaiInputsFromEntries` pour produire une
 * courbe : un point par jour, `null` si le jour n'a pas de donnée suffisante
 * (TROU, jamais un zéro fabriqué — §2). Partagé Home (7 j) / Tendances (30-90 j).
 */

import { type HbiDayEntry, hbi, hbiInputsFromEntries } from "./hbi";
import { type SccaiDayEntry, sccai, sccaiInputsFromEntries } from "./sccai";

export type ScoreKind = "hbi" | "sccai";

/** Sur-ensemble d'entrée couvrant HBI et SCCAI. */
export interface ScoreDayEntry extends HbiDayEntry, SccaiDayEntry {
	localDate: string;
}

/**
 * Choix du score selon le diagnostic (§5.7) : SCCAI pour la RCH, HBI par défaut
 * pour Crohn / MICI indéterminée / non diagnostiqué.
 */
export function scoreKindForDiagnosis(diagnosis: string | null | undefined): ScoreKind {
	return diagnosis === "uc" ? "sccai" : "hbi";
}

/**
 * Une valeur de score par date (ordre fourni). `null` si le jour n'a aucune
 * entrée ou si le score n'est pas calculable (donnée subjective clé manquante).
 */
export function dailyScoreSeries(
	dates: string[],
	entriesByDate: Map<string, ScoreDayEntry[]>,
	extrasByDate: Map<string, { complications?: string[] | null } | undefined>,
	kind: ScoreKind,
): (number | null)[] {
	return dates.map((d) => {
		const entries = entriesByDate.get(d);
		if (!entries || entries.length === 0) return null;
		const extra = extrasByDate.get(d) ?? null;
		if (kind === "sccai") {
			return sccai(sccaiInputsFromEntries(entries, extra))?.score ?? null;
		}
		return hbi(hbiInputsFromEntries(entries, extra))?.score ?? null;
	});
}

/** Regroupe des entrées par leur `localDate`. */
export function groupEntriesByDate<T extends { localDate: string }>(
	entries: T[],
): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const e of entries) {
		const bucket = map.get(e.localDate);
		if (bucket) bucket.push(e);
		else map.set(e.localDate, [e]);
	}
	return map;
}
