/**
 * Simple Clinical Colitis Activity Index (SCCAI) — module PUR, testable Node.
 *
 * Score d'activité de la rectocolite hémorragique (RCH), par `local_date`
 * (§9, §5.7). Comme le HBI : estimé par auto-évaluation, `null` si une donnée
 * subjective clé manque (jamais de zéros fabriqués — §2).
 *
 * SCCAI original = fréquence des selles diurnes, nocturnes, urgence, sang,
 * bien-être général, manifestations extra-intestinales.
 */

/**
 * Bandes SCCAI. NUANCE : le SCCAI n'a pas de bande « légère » (mild) formelle
 * et consensuelle. Le seuil de rémission le mieux documenté est ≤ 4 (score < 5).
 * Faute de bande « mild » standard, on SIMPLIFIE volontairement en 3 bandes :
 * <5 rémission, 5-11 « modérée », >11 « sévère ». On réutilise l'étiquette
 * 'moderate' pour toute activité 5-11 (assumé et documenté ici + dans l'UI).
 */
export type SccaiBand = "remission" | "moderate" | "severe";

export interface SccaiInputs {
	/** Nb de selles diurnes. `null` si non renseigné. */
	dayStools: number | null;
	/** Nb de selles nocturnes (23h-6h). `null` toléré → compté 0 (cf. plus bas). */
	nightStools: number | null;
	/** Urgence, pire du jour : 0 aucune, 1 pressant, 2 immédiat, 3 incontinence. `null` interdit. */
	urgency: number | null;
	/** Sang : 0 non, 1 traces, 2 visible <50%, 3 la plupart des selles. `null` interdit. */
	blood: number | null;
	/** Bien-être général : 0 très bien … 4 très mauvais. `null` interdit. */
	wellbeing: number | null;
	/** Nb de manifestations extra-intestinales (1 pt chacune). */
	extraIntestinalCount: number;
}

export interface SccaiResult {
	score: number;
	band: SccaiBand;
}

/** Barème selles diurnes : 0-3 → 0, 4-6 → 1, 7-9 → 2, >9 → 3. */
export function sccaiDayStoolScore(count: number): number {
	if (count <= 3) return 0;
	if (count <= 6) return 1;
	if (count <= 9) return 2;
	return 3;
}

/**
 * Barème selles nocturnes : 0 → 0, 1-3 → 1, 4-6 → 2.
 * Le SCCAI plafonne à 2 pour ce poste ; on étend >6 → 2 (borne haute) pour
 * rester défini et monotone sur tout entier positif.
 */
export function sccaiNightStoolScore(count: number): number {
	if (count <= 0) return 0;
	if (count <= 3) return 1;
	return 2;
}

/** Bande SCCAI : <5 rémission, 5-11 modérée, >11 sévère (cf. note SccaiBand). */
export function sccaiBand(score: number): SccaiBand {
	if (score < 5) return "remission";
	if (score <= 11) return "moderate";
	return "severe";
}

/**
 * Calcule le SCCAI. Renvoie `null` si dayStools, urgency, blood OU wellbeing
 * manque (données indispensables). `nightStools` null est toléré et compté 0
 * (une nuit sans selle notée est l'absence d'événement, pas une donnée manquante).
 */
export function sccai(inputs: SccaiInputs): SccaiResult | null {
	const { dayStools, nightStools, urgency, blood, wellbeing, extraIntestinalCount } = inputs;
	if (dayStools == null || urgency == null || blood == null || wellbeing == null) {
		return null;
	}
	const score =
		sccaiDayStoolScore(dayStools) +
		sccaiNightStoolScore(nightStools ?? 0) +
		urgency +
		blood +
		wellbeing +
		extraIntestinalCount;
	return { score, band: sccaiBand(score) };
}

/** Sous-ensemble d'une entrée nécessaire au calcul (découplé du schéma DB). */
export interface SccaiDayEntry {
	kind?: string;
	occurredAt: number;
	tz: string;
	bristol?: number | null;
	urgency?: number | null;
	/** Sang 0-2 dans NOTRE modèle (non / traces / visible). */
	blood?: number | null;
	wellbeing?: number | null;
	extraIntestinal?: string[] | null;
}

/**
 * Heure locale (0-23) d'un instant dans une timezone IANA. Pur (Intl).
 * Utilisé pour classer une selle en diurne/nocturne selon le tz de l'entrée.
 */
export function localHourInTz(epochMs: number, tz: string): number {
	const s = new Intl.DateTimeFormat("en-GB", {
		timeZone: tz,
		hour: "2-digit",
		hour12: false,
	}).format(new Date(epochMs));
	// en-GB rend « 24 » à minuit dans certains environnements : normalise en 0.
	const h = Number.parseInt(s, 10);
	return h === 24 ? 0 : h;
}

/** Une selle est nocturne si son heure locale ∈ [23h, 6h[ (tz de l'entrée). */
export function isNightStool(epochMs: number, tz: string): boolean {
	const h = localHourInTz(epochMs, tz);
	return h >= 23 || h < 6;
}

/**
 * Agrège les entrées d'UN jour vers les entrées du calcul SCCAI.
 * - dayStools / nightStools : nb de selles classées diurnes/nocturnes selon
 *   l'heure LOCALE (tz figé de chaque entrée — un voyage ne fausse pas le jour).
 * - urgency / wellbeing : pire (max) valeur non nulle du jour, sinon `null`.
 * - blood : pire du jour, mappé depuis notre échelle 0-2 → 0→0, 1→1, 2→2.
 *   Le niveau 3 SCCAI (« la plupart des selles ») n'est JAMAIS déduit
 *   automatiquement de notre échelle plafonnée à 2.
 * - extraIntestinalCount : nb de manifestations distinctes (union des entrées
 *   ∪ complications de `daily_extras`).
 */
export function sccaiInputsFromEntries(
	entries: SccaiDayEntry[],
	dailyExtras?: { complications?: string[] | null } | null,
): SccaiInputs {
	const stools = entries.filter((e) => e.kind === "stool" || e.bristol != null);
	let dayStools = 0;
	let nightStools = 0;
	for (const s of stools) {
		if (isNightStool(s.occurredAt, s.tz)) nightStools++;
		else dayStools++;
	}

	const urgencies = entries.map((e) => e.urgency).filter((v): v is number => v != null);
	const bloods = entries.map((e) => e.blood).filter((v): v is number => v != null);
	const wellbeings = entries.map((e) => e.wellbeing).filter((v): v is number => v != null);

	const extras = new Set<string>();
	for (const e of entries) {
		for (const x of e.extraIntestinal ?? []) extras.add(x);
	}
	for (const x of dailyExtras?.complications ?? []) extras.add(x);

	return {
		dayStools,
		nightStools,
		urgency: urgencies.length > 0 ? Math.max(...urgencies) : null,
		// mapping 0-2 → 0-2, jamais 3 auto (cf. doc de la fonction).
		blood: bloods.length > 0 ? Math.min(2, Math.max(...bloods)) : null,
		wellbeing: wellbeings.length > 0 ? Math.max(...wellbeings) : null,
		extraIntestinalCount: extras.size,
	};
}
