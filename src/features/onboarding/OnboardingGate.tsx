/**
 * Gate d'onboarding (§4) — redirige vers le funnel tant que `onboarding_done`
 * n'est pas vrai, et vers les tabs une fois terminé. Motif « protected route »
 * documenté d'expo-router (useSegments + router.replace).
 *
 * Semis E2E : sur web, `?e2e=1` pré-écrit `onboarding_done=true` AVANT le gate,
 * pour que les smokes existants n'aient pas à traverser le funnel. Le smoke
 * d'onboarding, lui, ouvre « / » sans ce paramètre. `?e2e=1&premium=1` pré-écrit
 * en plus le flag Premium simulé (pour tester les fonctions Premium, ex. voix).
 */

import { useRouter, useSegments } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { get as getSetting, set as setSetting } from "@/repositories/settingsRepo";
import { AI_CONSENT_KEY } from "@/services/aiConsent";
import { MOCK_PREMIUM_KEY } from "@/services/entitlements";

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

/**
 * Le semis E2E n'est ACTIF que dans un build explicitement E2E
 * (`EXPO_PUBLIC_E2E=1`, figé au build via `build:web:e2e`). Un build prod normal
 * a la constante à false → les paramètres `?e2e=1`/`?premium=1` sont ignorés et
 * ne peuvent PAS débloquer Premium ni sauter l'onboarding (sécurité M2).
 */
const E2E_ENABLED = process.env.EXPO_PUBLIC_E2E === "1";

/** Détecte le semis E2E (`?e2e=1`) — seulement dans un build E2E, sur web. */
function detectE2ESeed(): boolean {
	if (!E2E_ENABLED || Platform.OS !== "web") return false;
	try {
		return new URLSearchParams(window.location.search).has("e2e");
	} catch {
		return false;
	}
}

/** Semis E2E Premium (`?premium=1`) — seulement dans un build E2E, sur web. */
function detectE2EPremium(): boolean {
	if (!E2E_ENABLED || Platform.OS !== "web") return false;
	try {
		return new URLSearchParams(window.location.search).has("premium");
	} catch {
		return false;
	}
}

/**
 * `?noaiconsent=1` : NE PAS pré-accorder le consentement IA (pour la spec qui
 * vérifie l'apparition du dialogue au 1er envoi IA). Sans ce paramètre, le semis
 * l'accorde pour ne pas casser les smokes scan/voix/insight existants.
 */
function detectE2ESkipAiConsent(): boolean {
	if (!E2E_ENABLED || Platform.OS !== "web") return false;
	try {
		return new URLSearchParams(window.location.search).has("noaiconsent");
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
				// Pré-accorde le consentement IA pour ne pas casser les smokes scan/voix/
				// insight (le dialogue de consentement s'afficherait sinon au 1er envoi IA).
				// `?noaiconsent=1` le laisse à false pour tester justement ce dialogue.
				if (!detectE2ESkipAiConsent()) await setSetting(AI_CONSENT_KEY, true);
				if (detectE2EPremium()) await setSetting(MOCK_PREMIUM_KEY, true);
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
