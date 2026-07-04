/**
 * Constantes de marque (§2) — centralisées pour un renommage trivial.
 *
 * Les URLs de store sont des PLACEHOLDERS tant que les fiches n'existent pas
 * (comptes stores en Phase 6/10). La demande d'avis (§7) pointe dessus.
 */

import { Platform } from "react-native";

/** Nom de l'app (confirmé) — aussi dans app.json + i18n `common.appName`. */
export const APP_NAME = "Crohnicle";

/** Accroche de marque (§2) — affichée au splash/à-propos, réutilisable en ASO. */
export const TAGLINE = {
	fr: "Votre compagnon MICI",
	en: "Your IBD companion",
} as const;

/** Couleurs de marque (§3) — le violet « selles » sert de teinte primaire. */
export const BRAND_COLORS = {
	primary: "#8B5CF6",
	background: "#F7F7F8",
	backgroundDark: "#0A0A0A",
} as const;

/**
 * Adresse de support / remboursement humain (§8) — PLACEHOLDER de marque.
 * Affichée dans le paywall : le remboursement passe par un humain, jamais un bot.
 */
export const SUPPORT_EMAIL = "support@crohnicle.app";

/** Fiches stores (placeholders — à remplacer au lancement réel). */
export const STORE_URLS = {
	ios: "https://apps.apple.com/app/crohnicle/id000000000",
	android: "https://play.google.com/store/apps/details?id=app.crohnicle",
} as const;

/** URL de la fiche store adaptée à la plateforme courante (défaut iOS). */
export function storeReviewUrl(): string {
	return Platform.OS === "android" ? STORE_URLS.android : STORE_URLS.ios;
}

/**
 * Ressources toilettes/urgence (§5.10) — la Carte Urgence Toilettes officielle de
 * l'afa (association François Aupetit) + apps communautaires complémentaires FR.
 */
export const AFA_URGENCY_CARD_URL = "https://www.afa.asso.fr/produit/carte-urgence-toilettes/";
export const ICI_TOILETTES_URL = "https://www.icitoilettes.com/";
export const OU_SONT_LES_TOILETTES_URL = "https://www.ou-sont-les-toilettes.fr/";
