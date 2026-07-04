/**
 * Carte d'urgence toilettes (§5.10) — 5 messages EN DUR, multilingues.
 *
 * VOLONTAIREMENT hors du système i18n : la carte doit rester disponible dans
 * n'importe quelle langue, INDÉPENDAMMENT de la langue de l'application (un
 * patient francophone peut avoir besoin de la montrer en allemand à l'étranger).
 * Ne jamais router ces chaînes via i18next.
 */

export type UrgencyLang = "fr" | "en" | "es" | "de" | "it";

export const URGENCY_LANGS: UrgencyLang[] = ["fr", "en", "es", "de", "it"];

/** Libellé court de chaque langue (pour les chips de sélection). */
export const URGENCY_LANG_LABEL: Record<UrgencyLang, string> = {
	fr: "FR",
	en: "EN",
	es: "ES",
	de: "DE",
	it: "IT",
};

/**
 * Message plein écran par langue. Une seule phrase, claire, à montrer à un tiers
 * pour obtenir un accès urgent aux toilettes.
 */
export const URGENCY_MESSAGE: Record<UrgencyLang, string> = {
	fr: "J'ai une maladie chronique intestinale (MICI). J'ai besoin d'un accès urgent aux toilettes, merci.",
	en: "I have a chronic bowel disease (IBD). I urgently need access to a toilet, thank you.",
	es: "Tengo una enfermedad intestinal crónica (EII). Necesito acceso urgente a un baño, gracias.",
	de: "Ich habe eine chronische Darmerkrankung (CED). Ich brauche dringend Zugang zu einer Toilette, danke.",
	it: "Ho una malattia intestinale cronica (MICI). Ho bisogno urgente di accedere a un bagno, grazie.",
};
