/**
 * Typographie — Crohnicle (§3).
 *
 * Typo système (SF sur iOS, Roboto sur Android). On ne charge pas de police
 * custom : les gros chiffres bold portent l'identité visuelle des données.
 *
 * Fichier PUR (zéro import React Native).
 */

import type { TextStyle } from "react-native";

/** Poids réutilisables (typés pour StyleSheet). */
export const fontWeight = {
	regular: "400",
	medium: "500",
	semibold: "600",
	bold: "700",
} as const satisfies Record<string, TextStyle["fontWeight"]>;

/**
 * Échelle typographique. `data*` = gros chiffres bold (34-48 px) pour les
 * mesures affichées au centre des anneaux et cartes.
 */
export const typography = {
	/** Très gros chiffre central (anneau « Aujourd'hui »). */
	dataXL: {
		fontSize: 48,
		fontWeight: fontWeight.bold,
		letterSpacing: -1,
	},
	/** Gros chiffre de carte. */
	dataLg: {
		fontSize: 34,
		fontWeight: fontWeight.bold,
		letterSpacing: -0.5,
	},
	/** Titre d'écran. */
	title: {
		fontSize: 28,
		fontWeight: fontWeight.bold,
		letterSpacing: -0.3,
	},
	/** En-tête de section / titre de carte. */
	heading: {
		fontSize: 20,
		fontWeight: fontWeight.semibold,
	},
	/** Sous-titre. */
	subheading: {
		fontSize: 17,
		fontWeight: fontWeight.semibold,
	},
	/** Corps de texte. */
	body: {
		fontSize: 16,
		fontWeight: fontWeight.regular,
	},
	/** Libellé de bouton / chip. */
	label: {
		fontSize: 15,
		fontWeight: fontWeight.medium,
	},
	/** Légende, sous-texte discret. */
	caption: {
		fontSize: 13,
		fontWeight: fontWeight.regular,
	},
} as const satisfies Record<string, TextStyle>;

export type TypographyKey = keyof typeof typography;
