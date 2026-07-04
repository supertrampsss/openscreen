/**
 * Gate d'onboarding (§4) — redirige vers le funnel tant que `onboarding_done`
 * n'est pas vrai, et vers les tabs une fois terminé. Motif « protected route »
 * documenté d'expo-router (useSegments + router.replace).
 *
 * Semis E2E : sur web, `?e2e=1` pré-écrit `onboarding_done=true` AVANT le gate,
 * pour que les smokes existants n'aient pas à traverser le funnel. Le smoke
 * d'onboarding, lui, ouvre « / » sans ce paramètre.
 */

import { useRouter, useSegments } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { get as getSetting, set as setSetting } from "@/repositories/settingsRepo";

export const ONBOARDING_DONE_KEY = "onboarding_done";

interface OnboardingApi {
	/** null tant que l'état n'est pas chargé. */
	done: boolean | null;
	/** Marque l'onboarding terminé (→ redirection vers les tabs). */
	markDone: () => Promise<void>;
	/** Relance le funnel sans effacer les données (« Revoir l'introduction »). */
	replay: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingApi>({
	done: null,
	markDone: async () => undefined,
	replay: async () => undefined,
});

/** Détecte le semis E2E (`?e2e=1`) sur web. No-op sur natif. */
function detectE2ESeed(): boolean {
	if (Platform.OS !== "web") return false;
	try {
		return new URLSearchParams(window.location.search).has("e2e");
	} catch {
		return false;
	}
}

export function OnboardingGate({ children }: { children: ReactNode }) {
	const [done, setDone] = useState<boolean | null>(null);
	const segments = useSegments();
	const router = useRouter();

	useEffect(() => {
		let alive = true;
		(async () => {
			if (detectE2ESeed()) {
				await setSetting(ONBOARDING_DONE_KEY, true);
				if (alive) setDone(true);
				return;
			}
			const stored = await getSetting<boolean>(ONBOARDING_DONE_KEY);
			if (alive) setDone(Boolean(stored));
		})();
		return () => {
			alive = false;
		};
	}, []);

	// Guard : redirige selon l'état et la route courante.
	useEffect(() => {
		if (done === null) return;
		const inOnboarding = segments[0] === "onboarding";
		if (!done && !inOnboarding) {
			router.replace("/onboarding");
		} else if (done && inOnboarding) {
			router.replace("/(tabs)");
		}
	}, [done, segments, router]);

	const markDone = useCallback(async () => {
		await setSetting(ONBOARDING_DONE_KEY, true);
		setDone(true);
	}, []);

	const replay = useCallback(async () => {
		await setSetting(ONBOARDING_DONE_KEY, false);
		setDone(false);
	}, []);

	return (
		<OnboardingContext.Provider value={{ done, markDone, replay }}>
			{children}
		</OnboardingContext.Provider>
	);
}

export function useOnboarding(): OnboardingApi {
	return useContext(OnboardingContext);
}
