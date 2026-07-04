/**
 * Service corrélations (§5.7) — I/O autour du domaine PUR `computeAssociations`.
 *
 * Rassemble 90 jours de repas (avec items + triggers) et de symptômes commités,
 * mappe vers le domaine (repas → expositions, symptômes seuillés → signaux), puis
 * met en cache le résultat du jour dans `insights_cache` (recalcul 1×/jour max, ou
 * forcé au pull-to-refresh de Tendances).
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { insightsCache } from "@/db/schema";
import {
	type AssociationsResult,
	type CorrelationMeal,
	type CorrelationSignal,
	computeAssociations,
} from "@/domain/correlations";
import { localDateDaysAgo, nowEntryTimestamp } from "@/domain/dates";
import { listCommittedWithItemsSince } from "@/repositories/mealRepo";
import { listCommittedSince as listSymptomsSince } from "@/repositories/symptomRepo";

/** Fenêtre d'analyse (jours). */
const WINDOW_DAYS = 90;

/** Seuils de déclenchement d'un signal (§5.7). */
const SIGNAL_THRESHOLDS = {
	pain: (e: { pain?: number | null }) => (e.pain ?? 0) >= 2,
	bristol: (e: { bristol?: number | null }) => (e.bristol ?? 0) >= 6,
	blood: (e: { blood?: number | null }) => (e.blood ?? 0) >= 1,
	urgency: (e: { urgency?: number | null }) => (e.urgency ?? 0) >= 2,
} as const;

export type SignalKind = keyof typeof SIGNAL_THRESHOLDS;

/** Clé de cache du jour. */
function cacheKey(today: string): string {
	return `associations:${today}`;
}

/** Rassemble les données 90 j et calcule les associations (sans cache). */
export async function recomputeAssociations(): Promise<AssociationsResult> {
	const since = localDateDaysAgo(WINDOW_DAYS - 1);
	const [mealRows, symptomRows] = await Promise.all([
		listCommittedWithItemsSince(since),
		listSymptomsSince(since),
	]);

	const meals: CorrelationMeal[] = mealRows.map((m) => ({
		occurredAt: m.meal.occurredAt,
		tz: m.meal.tz,
		localDate: m.meal.localDate,
		items: m.items.map((it) => ({ foodId: it.foodId, triggers: it.triggers })),
	}));

	const foodNames: Record<string, string> = {};
	for (const m of mealRows) {
		for (const it of m.items) foodNames[it.foodId] = it.displayFr;
	}

	const signals: CorrelationSignal[] = [];
	for (const e of symptomRows) {
		for (const kind of Object.keys(SIGNAL_THRESHOLDS) as SignalKind[]) {
			if (SIGNAL_THRESHOLDS[kind](e)) {
				signals.push({ occurredAt: e.occurredAt, tz: e.tz, localDate: e.localDate, kind });
			}
		}
	}

	return computeAssociations(meals, signals, { foodNames });
}

/**
 * Charge les associations du jour (depuis le cache si présent), sinon recalcule
 * et met en cache. `force` (pull-to-refresh) ignore le cache et le rafraîchit.
 */
export async function loadAssociations(force = false): Promise<AssociationsResult> {
	const today = nowEntryTimestamp().localDate;
	const key = cacheKey(today);

	if (!force) {
		const rows = await db.select().from(insightsCache).where(eq(insightsCache.key, key)).limit(1);
		if (rows[0]?.payload) return rows[0].payload as AssociationsResult;
	}

	const result = await recomputeAssociations();
	const now = Date.now();
	await db
		.insert(insightsCache)
		.values({ key, payload: result, computedAt: now })
		.onConflictDoUpdate({ target: insightsCache.key, set: { payload: result, computedAt: now } });
	return result;
}

/** Une association affichable, fusionnée (attribut prioritaire puis aliment). */
export interface DisplayAssociation {
	kind: "trigger" | "food";
	key: string;
	/** Nom brut (aliment) ou clé d'attribut (à traduire côté UI). */
	displayName: string;
	signal: string;
	lift: number;
	/** Nb d'expositions suivies du signal (co-occurrences). */
	n: number;
	pSignificant: boolean;
}

/**
 * Top associations à afficher (§5.7) : attributs D'ABORD (plus robustes), puis
 * aliments, en évitant les doublons de signal déjà couverts par un attribut.
 */
export function topAssociations(result: AssociationsResult, max = 5): DisplayAssociation[] {
	const triggers: DisplayAssociation[] = result.byTrigger.map((a) => ({
		kind: "trigger",
		key: a.key,
		displayName: a.key,
		signal: a.signal,
		lift: a.lift,
		n: a.nExposedWithSignal,
		pSignificant: a.pSignificant,
	}));
	const foodsList: DisplayAssociation[] = result.byFood.map((a) => ({
		kind: "food",
		key: a.key,
		displayName: a.displayName,
		signal: a.signal,
		lift: a.lift,
		n: a.nExposedWithSignal,
		pSignificant: a.pSignificant,
	}));
	return [...triggers, ...foodsList].slice(0, max);
}
