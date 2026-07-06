/**
 * Design tokens — Crohnicle (§3 du document produit).
 *
 * Base monochrome, la couleur ne code QUE la donnée.
 * Aucun rouge alarmiste : le sang utilise `#E11D48` en pastille discrète,
 * la poussée un fond ambre pâle.
 *
 * Fichier PUR (zéro import React Native) pour rester testable.
 */

/** Couleurs sémantiques de la donnée — identiques en clair et sombre.
 * Direction « Clinique calme » : teintes muettes (désaturées) qui restent
 * lisibles sur fond clair ET sombre. La couleur ne vit QUE dans la donnée. */
export const dataColors = {
	/** Selles (Bristol, fréquence). */
	stool: "#7A70E6",
	/** Douleur. */
	pain: "#D68A2E",
	/** Énergie / fatigue. */
	energy: "#35A883",
	/** Repas / triggers alimentaires. */
	meal: "#4A7FE0",
	/** Sang — réservé, jamais en aplat, uniquement pastille discrète. */
	blood: "#CE4668",
} as const;

export type DataColorKey = keyof typeof dataColors;

/** Palette du thème clair — neutres à léger biais violet froid (choisis, pas
 * hérités) + un accent unique `brand` et des fonds `*Soft` pour pastilles/chips. */
const lightColors = {
	/** Fond de l'app. */
	background: "#F4F4F7",
	/** Surface des cartes. */
	card: "#FFFFFF",
	/** Surface légèrement contrastée (rangées, chips inactifs, piste d'anneau). */
	surface: "#F1F1F5",
	/** Bordure discrète (hairline). */
	border: "#E6E6EC",
	/** Texte principal. */
	text: "#16161C",
	/** Texte secondaire. */
	textMuted: "#5C5C68",
	/** Texte tertiaire / désactivé. */
	textFaint: "#9A9AA6",
	/** Fond du CTA principal (pilule sombre). */
	ctaBackground: "#16161C",
	/** Texte du CTA principal. */
	ctaText: "#FFFFFF",
	/** Accent unique de marque (navigation active, progression, liens). */
	brand: "#6E63E6",
	/** Fond doux de l'accent (pastille/chip actif). */
	brandSoft: "#EEEBFC",
	/** Fonds doux des couleurs de donnée (pastilles d'avatar, chips). */
	stoolSoft: "#ECEAFB",
	painSoft: "#FBF0DE",
	energySoft: "#E2F3EC",
	mealSoft: "#E6EDFB",
	/** Fond de carte en mode poussée (ambre pâle, jamais rouge). */
	flareBackground: "#FBF1E1",
	/** Bordure de carte en mode poussée. */
	flareBorder: "#F0DEB8",
	/** Scrim des bottom-sheets / modales. */
	scrim: "rgba(16, 16, 24, 0.38)",
	...dataColors,
} as const;

/** Palette du thème sombre (§3 : usage nocturne / salle de bain). */
const darkColors = {
	background: "#0A0B0E",
	card: "#16171D",
	surface: "#1E1F26",
	border: "#26272F",
	text: "#F3F3F6",
	textMuted: "#A6A7B2",
	textFaint: "#6B6C78",
	ctaBackground: "#F3F3F6",
	ctaText: "#16161C",
	brand: "#8B82F2",
	brandSoft: "#211F3A",
	stoolSoft: "#211F3A",
	painSoft: "#322718",
	energySoft: "#16281F",
	mealSoft: "#172236",
	flareBackground: "#322718",
	flareBorder: "#4A3A1E",
	scrim: "rgba(0, 0, 0, 0.62)",
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

/** Rayons de coin. Cartes = 22 px (« Clinique calme »), pastilles = 13-14 px. */
export const radii = {
	sm: 10,
	md: 13,
	lg: 20,
	xl: 22,
	pill: 999,
} as const;

/** Cible tactile minimale (accessibilité §3). */
export const hitTarget = 48;

/** Ombres douces (« Clinique calme » : discrètes, jamais dures). Clé plate car
 * les valeurs diffèrent iOS/Android/web. */
export const shadows = {
	card: {
		shadowColor: "#141420",
		shadowOpacity: 0.05,
		shadowRadius: 14,
		shadowOffset: { width: 0, height: 6 },
		elevation: 2,
	},
	floating: {
		shadowColor: "#141420",
		shadowOpacity: 0.16,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 8 },
		elevation: 8,
	},
} as const;

export type ThemeName = keyof typeof palettes;
