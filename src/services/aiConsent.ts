/**
 * Consentement à l'analyse par IA tierce (§2 loi 4, App Store §5.1.2).
 *
 * Les fonctions IA (analyse photo, note vocale, bilan hebdo) transmettent des
 * données à un service tiers (Anthropic Claude via notre proxy). Apple exige un
 * consentement explicite AVANT tout envoi. Un seul consentement couvre les trois
 * flux ; il est persisté dans le settingsRepo (clé `ai_consent`), donc conservé
 * localement comme le reste des préférences.
 */

import { get as getSetting, set as setSetting } from "@/repositories/settingsRepo";

/** Clé de réglage du consentement IA (booléen). */
export const AI_CONSENT_KEY = "ai_consent";

/** Vrai si l'utilisateur a explicitement accepté l'analyse par IA tierce. */
export async function hasAiConsent(): Promise<boolean> {
	return (await getSetting<boolean>(AI_CONSENT_KEY)) === true;
}

/** Persiste le choix de consentement IA. */
export async function setAiConsent(value: boolean): Promise<void> {
	await setSetting(AI_CONSENT_KEY, value);
}
