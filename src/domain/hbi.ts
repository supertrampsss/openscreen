/**
 * Harvey-Bradshaw Index (HBI) — module PUR (zéro import RN), testable sous Node.
 *
 * Score d'activité de la maladie de Crohn, calculé par `local_date` (§9, §5.7).
 * Toujours estimé par auto-évaluation → l'UI l'affiche « estimé » et renvoie
 * `null` dès qu'une donnée subjective clé manque (jamais de zéros fabriqués — §2).
 *
 * HBI original = 5 items : bien-être général, douleur abdominale, nb de selles
 * liquides, MASSE ABDOMINALE, complications. L'item « masse abdominale » exige
 * un examen clinique (palpation) : IMPOSSIBLE en auto-évaluation, il est donc
 * VOLONTAIREMENT OMIS. Conséquence assumée : notre score est minoré d'au plus
 * 3 points par rapport au HBI clinique complet ; il reste cohérent en interne
 * (tendances) mais n'est pas un diagnostic — d'où le disclaimer « estimé ».
 */

/** Bandes d'activité HBI (bornes cliniques standard). */
export type HbiBand = "remission" | "mild" | "moderate" | "severe";

/** Manifestations/complications comptant 1 pt chacune dans le HBI. */
export const HBI_COMPLICATIONS = [
	"arthralgia",
	"uveitis",
	"erythema_nodosum",
	"aphthous_ulcers",
	"pyoderma",
	"anal_fissure",
	"fistula",
	"abscess",
] as const;

export type HbiComplication = (typeof HBI_COMPLICATIONS)[number];

export interface HbiInputs {
	/** Bien-être général, pire du jour : 0 très bien … 4 très mauvais. `null` si non renseigné. */
	wellbeing: number | null;
	/** Douleur abdominale, pire du jour : 0 aucune … 3 sévère. `null` si non renseignée. */
	pain: number | null;
	/** Nb d'entrées Bristol ∈ {6,7} du jour (selles liquides). */
	liquidStoolCount: number;
	/** Complications observées (1 pt chacune). */
	complications: string[];
}

export interface HbiResult {
	score: number;
	band: HbiBand;
}

/** Bande HBI à partir du score : <5 rémission, 5-7 légère, 8-16 modérée, >16 sévère. */
export function hbiBand(score: number): HbiBand {
	if (score < 5) return "remission";
	if (score <= 7) return "mild";
	if (score <= 16) return "moderate";
	return "severe";
}

/**
 * Calcule le HBI (item « masse abdominale » omis, cf. en-tête).
 * Renvoie `null` si le bien-être OU la douleur manque (données subjectives
 * indispensables — jamais de score fabriqué à partir de zéros).
 */
export function hbi(inputs: HbiInputs): HbiResult | null {
	const { wellbeing, pain, liquidStoolCount, complications } = inputs;
	if (wellbeing == null || pain == null) return null;
	// masse abdominale : OMISE (0-3 dans le HBI original) — auto-évaluation impossible.
	const score = wellbeing + pain + liquidStoolCount + complications.length;
	return { score, band: hbiBand(score) };
}

/** Sous-ensemble d'une entrée nécessaire au calcul (découplé du schéma DB). */
export interface HbiDayEntry {
	bristol?: number | null;
	pain?: number | null;
	wellbeing?: number | null;
}

/**
 * Agrège les entrées d'UN jour (worst-of-day) vers les entrées du calcul HBI.
 * - wellbeing / pain : pire (max) valeur non nulle du jour, sinon `null`.
 * - liquidStoolCount : nb d'entrées Bristol ∈ {6,7}.
 * - complications : fournies par `daily_extras` (agrégat du jour).
 */
export function hbiInputsFromEntries(
	entries: HbiDayEntry[],
	dailyExtras?: { complications?: string[] | null } | null,
): HbiInputs {
	const wellbeings = entries.map((e) => e.wellbeing).filter((v): v is number => v != null);
	const pains = entries.map((e) => e.pain).filter((v): v is number => v != null);
	const liquidStoolCount = entries.filter((e) => e.bristol === 6 || e.bristol === 7).length;
	return {
		wellbeing: wellbeings.length > 0 ? Math.max(...wellbeings) : null,
		pain: pains.length > 0 ? Math.max(...pains) : null,
		liquidStoolCount,
		complications: dailyExtras?.complications ?? [],
	};
}
