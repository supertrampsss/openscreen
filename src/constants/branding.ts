/**
 * Constantes de marque (§2) — centralisées pour un renommage trivial.
 *
 * Les URLs de store sont des PLACEHOLDERS tant que les fiches n'existent pas
 * (comptes stores en Phase 6/10). La demande d'avis (§7) pointe dessus.
 */

import { Platform } from "react-native";

/** Nom de travail affiché (aussi dans app.json + i18n `common.appName`). */
export const APP_NAME = "Crohnicle";

/** Fiches stores (placeholders — à remplacer au lancement réel). */
export const STORE_URLS = {
	ios: "https://apps.apple.com/app/crohnicle/id000000000",
	android: "https://play.google.com/store/apps/details?id=app.crohnicle",
} as const;

/** URL de la fiche store adaptée à la plateforme courante (défaut iOS). */
export function storeReviewUrl(): string {
	return Platform.OS === "android" ? STORE_URLS.android : STORE_URLS.ios;
}
