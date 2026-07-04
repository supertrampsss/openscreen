/**
 * Quick actions (§5.12) — long-press sur l'icône de l'app : Selle rapide /
 * Photo repas / Carte urgence. Chaque action porte un `href` de deep-link résolu
 * par `useQuickActionRouting()` (branché dans le layout des tabs).
 *
 * expo-quick-actions est installé + son plugin config déclaré (app.json) : le
 * code est prêt pour un dev build. Sur web / Expo Go, `setItems` no-op proprement
 * (voir docs/RELEASE.md pour la vérification device). Les cibles de deep-link
 * (`/log/stool`, `/log/photo`, `/urgence`) fonctionnent, elles, dès maintenant.
 */

import { Platform } from "react-native";
import i18n from "@/i18n";

const SUPPORTED = Platform.OS !== "web";

const tc = (key: string) => i18n.t(key, { ns: "common" }) as string;

/**
 * (Ré)enregistre les 3 quick actions. No-op sur web ou si le module natif est
 * absent (Expo Go sans dev build). Idempotent.
 */
export async function registerQuickActions(): Promise<void> {
	if (!SUPPORTED) return;
	try {
		const QuickActions = await import("expo-quick-actions");
		await QuickActions.setItems([
			{
				id: "stool",
				title: tc("quickActions.stool"),
				icon: Platform.OS === "ios" ? "symbol:drop.fill" : undefined,
				params: { href: "/log/stool" },
			},
			{
				id: "photo",
				title: tc("quickActions.photo"),
				icon: Platform.OS === "ios" ? "symbol:camera.fill" : undefined,
				params: { href: "/log/photo" },
			},
			{
				id: "urgence",
				title: tc("quickActions.urgence"),
				icon: Platform.OS === "ios" ? "symbol:cross.case.fill" : undefined,
				params: { href: "/urgence" },
			},
		]);
	} catch {
		// Module natif indisponible (Expo Go) : les quick actions arrivent avec le
		// dev build (Phase 10). Le deep-linking reste fonctionnel entre-temps.
	}
}
