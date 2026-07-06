/**
 * Retour haptique (« feel » premium, §3). Enrobe `expo-haptics` : no-op propre
 * sur web et si l'API échoue (jamais bloquant). Import dynamique pour ne pas
 * charger le module natif sur web.
 *
 * Usage : `haptics.selection()` au tap d'un choix, `haptics.success()` à un log
 * enregistré, `haptics.impact()` au bouton principal.
 */

import { Platform } from "react-native";

type HapticsModule = typeof import("expo-haptics");
let cached: HapticsModule | null = null;
const SUPPORTED = Platform.OS !== "web";

async function lib(): Promise<HapticsModule | null> {
	if (!SUPPORTED) return null;
	if (!cached) cached = await import("expo-haptics");
	return cached;
}

/** Sélection légère (tap d'une option, chip, segment). */
function selection(): void {
	if (!SUPPORTED) return;
	lib()
		.then((h) => h?.selectionAsync())
		.catch(() => undefined);
}

/** Impact léger/moyen (bouton principal, FAB). */
function impact(style: "light" | "medium" = "light"): void {
	if (!SUPPORTED) return;
	lib()
		.then((h) => {
			if (!h) return;
			const map = {
				light: h.ImpactFeedbackStyle.Light,
				medium: h.ImpactFeedbackStyle.Medium,
			};
			return h.impactAsync(map[style]);
		})
		.catch(() => undefined);
}

/** Notification de succès (log enregistré, jalon atteint). */
function success(): void {
	if (!SUPPORTED) return;
	lib()
		.then((h) => h?.notificationAsync(h.NotificationFeedbackType.Success))
		.catch(() => undefined);
}

/** Notification d'avertissement (échec doux, quota épuisé). */
function warning(): void {
	if (!SUPPORTED) return;
	lib()
		.then((h) => h?.notificationAsync(h.NotificationFeedbackType.Warning))
		.catch(() => undefined);
}

export const haptics = { selection, impact, success, warning };
