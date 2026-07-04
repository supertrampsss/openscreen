/**
 * Design tokens — Crohnicle (§3 du document produit).
 *
 * Base monochrome, la couleur ne code QUE la donnée.
 * Aucun rouge alarmiste : le sang utilise `#E11D48` en pastille discrète,
 * la poussée un fond ambre pâle.
 *
 * Fichier PUR (zéro import React Native) pour rester testable.
 */

/** Couleurs sémantiques de la donnée — identiques en clair et sombre. */
export const dataColors = {
	/** Selles (Bristol, fréquence). */
	stool: "#8B5CF6",
	/** Douleur. */
	pain: "#F59E0B",
	/** Énergie / fatigue. */
	energy: "#10B981",
	/** Repas / triggers alimentaires. */
	meal: "#3B82F6",
	/** Sang — réservé, jamais en aplat, uniquement pastille discrète. */
	blood: "#E11D48",
} as const;

export type DataColorKey = keyof typeof dataColors;

/** Palette du thème clair (§3). */
const lightColors = {
	/** Fond de l'app. */
	background: "#F7F7F8",
	/** Surface des cartes. */
	card: "#FFFFFF",
	/** Surface légèrement contrastée (rangées, chips inactifs). */
	surface: "#F0F0F2",
	/** Bordure discrète. */
	border: "#E5E5EA",
	/** Texte principal. */
	text: "#0A0A0A",
	/** Texte secondaire. */
	textMuted: "#6B6B70",
	/** Texte tertiaire / désactivé. */
	textFaint: "#A1A1A6",
	/** Fond du CTA principal (pilule noire). */
	ctaBackground: "#0A0A0A",
	/** Texte du CTA principal. */
	ctaText: "#FFFFFF",
	/** Fond de carte en mode poussée (ambre pâle, jamais rouge). */
	flareBackground: "#FDF3E3",
	/** Bordure de carte en mode poussée. */
	flareBorder: "#F5D9A8",
	/** Scrim des bottom-sheets / modales. */
	scrim: "rgba(0, 0, 0, 0.35)",
	...dataColors,
} as const;

/** Palette du thème sombre (§3 : usage nocturne / salle de bain). */
const darkColors = {
	background: "#0F0F10",
	card: "#1C1C1E",
	surface: "#2C2C2E",
	border: "#38383A",
	text: "#F5F5F5",
	textMuted: "#A1A1A6",
	textFaint: "#6B6B70",
	ctaBackground: "#F5F5F5",
	ctaText: "#0A0A0A",
	flareBackground: "#3A2E19",
	flareBorder: "#5C4A26",
	scrim: "rgba(0, 0, 0, 0.6)",
	...dataColors,
} as const;

export type ThemeColors = Record<keyof typeof lightColors, string>;

export const palettes = {
	light: lightColors,
	dark: darkColors,
} as const;

/** Échelle d'espacement (multiples de 4). */
export const spacing = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 20,
	xxl: 24,
} as const;

/** Rayons de coin. Cartes = 20 px (§3). */
export const radii = {
	sm: 10,
	md: 14,
	lg: 20,
	pill: 999,
} as const;

/** Cible tactile minimale (accessibilité §3). */
export const hitTarget = 48;

/** Ombres douces. Clé plate car les valeurs diffèrent iOS/Android/web. */
export const shadows = {
	card: {
		shadowColor: "#000000",
		shadowOpacity: 0.06,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 4 },
		elevation: 2,
	},
	floating: {
		shadowColor: "#000000",
		shadowOpacity: 0.18,
		shadowRadius: 16,
		shadowOffset: { width: 0, height: 6 },
		elevation: 8,
	},
} as const;

export type ThemeName = keyof typeof palettes;
