/**
 * Mode poussée (§5.6, §7) — état partagé Home / Journal / sheets / Réglages.
 *
 * Persisté dans `settings` sous la clé `flare_mode` = { active, since }.
 * Quand actif : bandeau ambre sur Home+Journal, sheets allégés, série GELÉE
 * (les jours de poussée ne cassent jamais le streak — cf. domain/streak).
 */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { nowEntryTimestamp } from "@/domain/dates";
import { get as getSetting, set as setSetting } from "@/repositories/settingsRepo";

export const FLARE_MODE_KEY = "flare_mode";

export interface FlareMode {
	active: boolean;
	/** local_date de début de la poussée en cours (null si inactive). */
	since: string | null;
}

const INACTIVE: FlareMode = { active: false, since: null };

/** Lit l'état de poussée persisté. */
export async function getFlareMode(): Promise<FlareMode> {
	const raw = await getSetting<Partial<FlareMode>>(FLARE_MODE_KEY);
	if (!raw || typeof raw.active !== "boolean") return INACTIVE;
	return { active: raw.active, since: typeof raw.since === "string" ? raw.since : null };
}

/** Active/désactive la poussée. À l'activation, fige `since` = aujourd'hui. */
export async function persistFlareMode(active: boolean): Promise<FlareMode> {
	const next: FlareMode = active
		? { active: true, since: nowEntryTimestamp().localDate }
		: INACTIVE;
	await setSetting(FLARE_MODE_KEY, next);
	return next;
}

interface FlareApi {
	flare: FlareMode;
	/** Bascule la poussée et renvoie le nouvel état. */
	setActive: (active: boolean) => Promise<void>;
	/** Recharge depuis la base (ex. après import de backup). */
	reload: () => void;
}

const FlareContext = createContext<FlareApi>({
	flare: INACTIVE,
	setActive: async () => undefined,
	reload: () => undefined,
});

export function FlareProvider({ children }: { children: ReactNode }) {
	const [flare, setFlare] = useState<FlareMode>(INACTIVE);

	const reload = useCallback(() => {
		getFlareMode().then(setFlare);
	}, []);

	useEffect(() => {
		reload();
	}, [reload]);

	const setActive = useCallback(async (active: boolean) => {
		const next = await persistFlareMode(active);
		setFlare(next);
	}, []);

	return (
		<FlareContext.Provider value={{ flare, setActive, reload }}>{children}</FlareContext.Provider>
	);
}

export function useFlare(): FlareApi {
	return useContext(FlareContext);
}
