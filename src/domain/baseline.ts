/**
 * Baseline personnelle de fréquence de selles — module PUR (§5.1).
 *
 * « Votre normale : X-Y » sur l'anneau Home. Source de la normale :
 *   1. baseline du profil si renseignée (enum onboarding « 3-5 »…) ;
 *   2. sinon médiane des 14 derniers jours DOCUMENTÉS — `null` si < 5 jours de
 *      données (jamais de normale fabriquée à partir de trop peu — §2 loi 3).
 *
 * Le sous-texte reste NEUTRE et jamais alarmiste : une journée n'est signalée
 * que « plus chargée que d'habitude » (au-dessus de la normale), jamais « pire ».
 */

/** Plage « normale » de selles par jour (bornes inclusives). */
export interface StoolNormal {
	low: number;
	high: number;
}

/** Médiane d'une liste de nombres (moyenne des deux centraux si pair). */
export function medianOf(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Percentile (interpolation linéaire) d'une liste triée non vide. */
function percentile(sorted: number[], p: number): number {
	if (sorted.length === 1) return sorted[0];
	const idx = (sorted.length - 1) * p;
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) return sorted[lo];
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Nombre minimal de jours documentés pour proposer une normale. */
export const BASELINE_MIN_DAYS = 5;

/**
 * Normale calculée à partir des comptes de selles par jour DOCUMENTÉ.
 * Plage = [⌊p25⌋ … ⌈p75⌉] (bande interquartile arrondie, toujours low ≤ high).
 * `null` si moins de `BASELINE_MIN_DAYS` jours de données.
 */
export function stoolNormalFromCounts(dailyCounts: number[]): StoolNormal | null {
	if (dailyCounts.length < BASELINE_MIN_DAYS) return null;
	const sorted = [...dailyCounts].sort((a, b) => a - b);
	const low = Math.floor(percentile(sorted, 0.25));
	const high = Math.ceil(percentile(sorted, 0.75));
	return { low, high: Math.max(low, high) };
}

/**
 * Parse la baseline du profil (enum onboarding). `null` si absente/inconnue.
 * « 10+ » → borne haute ouverte représentée par low=high=10.
 */
export function parseProfileBaseline(value: string | null | undefined): StoolNormal | null {
	if (!value) return null;
	if (value === "10+") return { low: 10, high: 10 };
	const m = value.match(/^(\d+)-(\d+)$/);
	if (!m) return null;
	const low = Number(m[1]);
	const high = Number(m[2]);
	return { low, high: Math.max(low, high) };
}

/**
 * Classe une journée par rapport à la normale — NEUTRE :
 * `busier` seulement au-dessus de la borne haute, sinon `within`.
 */
export function classifyDay(count: number, normal: StoolNormal): "within" | "busier" {
	return count > normal.high ? "busier" : "within";
}
