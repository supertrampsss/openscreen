/**
 * Service streak (§7) — assemble les jours documentés (DB) et les jours de
 * poussée (flare_mode) puis délègue le calcul au domaine PUR `domain/streak`.
 *
 * Un jour documenté = ≥1 entrée COMMITÉE (is_draft=0, non supprimée) ce local_date,
 * tous types confondus (symptômes/selles ET repas).
 */

import { and, eq, isNull } from "drizzle-orm";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/db/client";
import { meals, symptomEntries } from "@/db/schema";
import { nowEntryTimestamp } from "@/domain/dates";
import { addDays, computeStreak, type StreakResult } from "@/domain/streak";
import { type FlareMode, useFlare } from "@/features/flare/FlareContext";

/** local_dates distincts ayant au moins une entrée commitée (selles/symptômes + repas). */
export async function documentedLocalDates(): Promise<string[]> {
	const [symptomDays, mealDays] = await Promise.all([
		db
			.selectDistinct({ d: symptomEntries.localDate })
			.from(symptomEntries)
			.where(and(eq(symptomEntries.isDraft, 0), isNull(symptomEntries.deletedAt))),
		db
			.selectDistinct({ d: meals.localDate })
			.from(meals)
			.where(and(eq(meals.isDraft, 0), isNull(meals.deletedAt))),
	]);
	const set = new Set<string>();
	for (const r of symptomDays) set.add(r.d);
	for (const r of mealDays) set.add(r.d);
	return [...set];
}

/** Jours gelés déduits du mode poussée : de `since` à aujourd'hui inclus. */
export function flareFrozenDates(flare: FlareMode, today: string): string[] {
	if (!flare.active || !flare.since || flare.since > today) return [];
	const out: string[] = [];
	for (let d = flare.since; d <= today; d = addDays(d, 1)) out.push(d);
	return out;
}

/** Charge et calcule la série complète pour un état de poussée donné. */
export async function loadStreak(flare: FlareMode, today: string): Promise<StreakResult> {
	const documentedDates = await documentedLocalDates();
	const frozenDates = flareFrozenDates(flare, today);
	return computeStreak({ today, documentedDates, frozenDates });
}

/**
 * Hook `useStreak` : recalcule au montage, quand la poussée change, et à la
 * demande (`reload`, ex. après un nouveau log). `null` tant que non chargé.
 */
export function useStreak(): { streak: StreakResult | null; reload: () => void } {
	const { flare } = useFlare();
	const [streak, setStreak] = useState<StreakResult | null>(null);

	const reload = useCallback(() => {
		const today = nowEntryTimestamp().localDate;
		loadStreak(flare, today).then(setStreak);
	}, [flare]);

	useEffect(() => {
		reload();
	}, [reload]);

	return { streak, reload };
}
