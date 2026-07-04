/**
 * Aliments — module PUR (zéro import React Native / expo), testable sous Node.
 *
 * Centralise la sémantique « triggers » MICI (§5.4, §6) partagée par le seed FR,
 * la saisie de repas manuel (aliments custom) et le moteur de corrélations :
 *  - normalisation du nom (clé de déduplication `name_normalized`),
 *  - schéma des 9 attributs déclencheurs + validation,
 *  - défaut neutre honnête (aucun trigger, FODMAP moyen = aveu d'incertitude),
 *  - résumé des attributs actifs d'un aliment (chips ChipTrigger).
 *
 * RÈGLE (loi 3 + honnêteté scientifique) : ces drapeaux sont INDICATIFS, jamais
 * un diagnostic. En cas de doute → valeur la plus neutre.
 */

/** Niveau FODMAP possible. */
export type FodmapLevel = "low" | "medium" | "high";

export const FODMAP_LEVELS: readonly FodmapLevel[] = ["low", "medium", "high"] as const;

/** Les 8 attributs booléens (l'ordre est stable pour l'affichage). */
export const BOOLEAN_TRIGGER_KEYS = [
	"lactose",
	"gluten",
	"fried",
	"spicy",
	"insoluble_fiber",
	"alcohol",
	"caffeine",
	"additives",
] as const;

export type BooleanTriggerKey = (typeof BOOLEAN_TRIGGER_KEYS)[number];

/** Les 9 clés du schéma (fodmap + les 8 booléens). */
export const TRIGGER_KEYS = ["fodmap", ...BOOLEAN_TRIGGER_KEYS] as const;

/** Attributs déclencheurs d'un aliment (schéma figé §6). */
export interface FoodTriggers {
	fodmap: FodmapLevel;
	lactose: boolean;
	gluten: boolean;
	fried: boolean;
	spicy: boolean;
	insoluble_fiber: boolean;
	alcohol: boolean;
	caffeine: boolean;
	additives: boolean;
}

/**
 * Défaut NEUTRE pour un aliment custom (loi 3 : jamais anxiogène, aveu
 * d'incertitude). FODMAP « medium » = « on ne sait pas », aucun drapeau actif.
 */
export function neutralTriggers(): FoodTriggers {
	return {
		fodmap: "medium",
		lactose: false,
		gluten: false,
		fried: false,
		spicy: false,
		insoluble_fiber: false,
		alcohol: false,
		caffeine: false,
		additives: false,
	};
}

/**
 * Normalise un nom d'aliment en clé stable : minuscules, sans accents, sans
 * ponctuation, espaces simples. C'est la clé de déduplication `name_normalized`
 * (unique en base). Idempotente : `normalize(normalize(x)) === normalize(x)`.
 */
export function normalizeFoodName(input: string): string {
	return input
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // supprime les diacritiques (accents)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ") // toute ponctuation / apostrophe → espace
		.trim()
		.replace(/\s+/g, " ");
}

/** Motif d'un `name_normalized` valide (minuscules, chiffres, espaces simples). */
export const NORMALIZED_NAME_PATTERN = /^[a-z0-9]+( [a-z0-9]+)*$/;

/**
 * Coerce une valeur `triggers` stockée (json, potentiellement partielle/nulle)
 * vers un objet complet en comblant les manques par le défaut neutre.
 */
export function coerceTriggers(value: unknown): FoodTriggers {
	const base = neutralTriggers();
	if (value && typeof value === "object") {
		const v = value as Partial<FoodTriggers>;
		return {
			fodmap: FODMAP_LEVELS.includes(v.fodmap as FodmapLevel)
				? (v.fodmap as FodmapLevel)
				: base.fodmap,
			lactose: v.lactose ?? base.lactose,
			gluten: v.gluten ?? base.gluten,
			fried: v.fried ?? base.fried,
			spicy: v.spicy ?? base.spicy,
			insoluble_fiber: v.insoluble_fiber ?? base.insoluble_fiber,
			alcohol: v.alcohol ?? base.alcohol,
			caffeine: v.caffeine ?? base.caffeine,
			additives: v.additives ?? base.additives,
		};
	}
	return base;
}

/** Vrai si la valeur respecte intégralement le schéma des 9 attributs. */
export function isValidTriggers(value: unknown): value is FoodTriggers {
	if (!value || typeof value !== "object") return false;
	const t = value as Record<string, unknown>;
	if (!FODMAP_LEVELS.includes(t.fodmap as FodmapLevel)) return false;
	for (const key of BOOLEAN_TRIGGER_KEYS) {
		if (typeof t[key] !== "boolean") return false;
	}
	// Aucune clé superflue (schéma figé).
	return Object.keys(t).length === TRIGGER_KEYS.length;
}

/**
 * Liste des attributs « actifs » d'un aliment, pour les chips ChipTrigger.
 * FODMAP n'apparaît que s'il est élevé (haut) — moyen/bas = pas un signal.
 */
export function activeTriggerKeys(triggers: Partial<FoodTriggers> | null | undefined): string[] {
	if (!triggers) return [];
	const out: string[] = [];
	if (triggers.fodmap === "high") out.push("fodmap");
	for (const key of BOOLEAN_TRIGGER_KEYS) {
		if (triggers[key]) out.push(key);
	}
	return out;
}
