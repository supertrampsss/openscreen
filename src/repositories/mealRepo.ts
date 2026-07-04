/**
 * Repository des repas (§9). Structure alignée sur symptomRepo pour le PR 4
 * (repas manuel) et le PR 5 (scan photo) : autosave brouillon, soft delete.
 */

import { and, desc, eq, gte, inArray, isNull, like } from "drizzle-orm";
import { db } from "@/db/client";
import { newId } from "@/db/id";
import { type Food, foods, type Meal, mealItems, meals, type NewMeal } from "@/db/schema";
import {
	coerceTriggers,
	type FoodTriggers,
	neutralTriggers,
	normalizeFoodName,
} from "@/domain/foods";
import { emitLogCommitted } from "@/services/logHooks";

export interface MealDraftInput extends Partial<NewMeal> {
	id: string;
	occurredAt: number;
	tz: string;
	localDate: string;
}

export function newMealId(): string {
	return newId();
}

/**
 * Autosave du brouillon repas.
 *
 * Upsert atomique en UNE instruction (INSERT ... ON CONFLICT), comme
 * `symptomRepo.upsertDraft` : PAS de `db.transaction(async …)`. Le driver
 * expo-sqlite est SYNChrone — un callback `async` rend la main (et provoque le
 * `commit`) avant que le builder awaité ne s'exécute, laissant l'INSERT hors
 * transaction et désynchronisant le worker WASM web. Cf. src/db/client.ts.
 */
export async function upsertDraft(entry: MealDraftInput): Promise<Meal> {
	const now = Date.now();
	const values: NewMeal = {
		isDraft: 1,
		source: "manual",
		createdAt: now,
		updatedAt: now,
		...entry,
	};
	const rows = await db
		.insert(meals)
		.values(values)
		.onConflictDoUpdate({
			target: meals.id,
			set: {
				occurredAt: values.occurredAt,
				tz: values.tz,
				localDate: values.localDate,
				name: values.name ?? null,
				source: values.source ?? "manual",
				photoUri: values.photoUri ?? null,
				aiConfidence: values.aiConfidence ?? null,
				aiRaw: values.aiRaw ?? null,
				updatedAt: now,
			},
		})
		.returning();
	return rows[0];
}

/** Valide un brouillon. Loi 2 : 0 ligne mise à jour = erreur, jamais un succès silencieux. */
export async function commitDraft(id: string): Promise<void> {
	const rows = await db
		.update(meals)
		.set({ isDraft: 0, updatedAt: Date.now() })
		.where(eq(meals.id, id))
		.returning({ id: meals.id });
	if (rows.length === 0) {
		throw new Error(`commitDraft: no draft row for id ${id}`);
	}
	// Signale le log (§7 : annule le rappel du soir du jour même).
	emitLogCommitted();
}

export function listDay(localDate: string): Promise<Meal[]> {
	return db
		.select()
		.from(meals)
		.where(and(eq(meals.localDate, localDate), isNull(meals.deletedAt)))
		.orderBy(desc(meals.occurredAt));
}

/** Repas COMMITÉS (is_draft=0, non supprimés) depuis un local_date inclus. */
export function listCommittedSince(localDate: string): Promise<Meal[]> {
	return db
		.select()
		.from(meals)
		.where(and(gte(meals.localDate, localDate), eq(meals.isDraft, 0), isNull(meals.deletedAt)))
		.orderBy(desc(meals.occurredAt));
}

export function listRecent(n = 20): Promise<Meal[]> {
	return db
		.select()
		.from(meals)
		.where(isNull(meals.deletedAt))
		.orderBy(desc(meals.occurredAt))
		.limit(n);
}

export async function softDelete(id: string): Promise<void> {
	await db
		.update(meals)
		.set({ deletedAt: Date.now(), updatedAt: Date.now() })
		.where(eq(meals.id, id));
}

export async function restore(id: string): Promise<void> {
	await db.update(meals).set({ deletedAt: null, updatedAt: Date.now() }).where(eq(meals.id, id));
}

// ---------------------------------------------------------------------------
// Aliments (foods) + items du repas (meal_items).
// ---------------------------------------------------------------------------

export type Portion = "small" | "medium" | "large";

/** Vue d'un item de repas prête pour l'UI (aliment + portion + triggers). */
export interface MealItemView {
	foodId: string;
	displayFr: string;
	portion: Portion;
	triggers: FoodTriggers;
}

/** Un repas commité avec ses items résolus. */
export interface MealWithItems {
	meal: Meal;
	items: MealItemView[];
}

/**
 * Recherche d'aliments par `name_normalized LIKE %q%` (§5.5). La requête est
 * normalisée comme la colonne (minuscules, sans accents) → insensible aux accents.
 * Le seed (is_custom=0) remonte avant les customs, puis ordre alphabétique.
 */
export async function searchFoods(query: string, limit = 12): Promise<Food[]> {
	const q = normalizeFoodName(query);
	if (!q) return [];
	return db
		.select()
		.from(foods)
		.where(like(foods.nameNormalized, `%${q}%`))
		.orderBy(foods.isCustom, foods.nameNormalized)
		.limit(limit);
}

/**
 * Crée (ou récupère) un aliment custom par nom (§5.5). Idempotent sur
 * `name_normalized` : si l'aliment existe déjà (seed ou custom), on le renvoie
 * SANS le dupliquer ni écraser ses triggers.
 */
export async function getOrCreateCustomFood(
	displayFr: string,
	triggers: FoodTriggers = neutralTriggers(),
): Promise<Food> {
	const nameNormalized = normalizeFoodName(displayFr);
	const existing = await db
		.select()
		.from(foods)
		.where(eq(foods.nameNormalized, nameNormalized))
		.limit(1);
	if (existing[0]) return existing[0];

	const rows = await db
		.insert(foods)
		.values({
			id: newId(),
			nameNormalized,
			displayFr: displayFr.trim(),
			triggers: triggers as unknown as Record<string, unknown>,
			isCustom: 1,
		})
		.onConflictDoNothing({ target: foods.nameNormalized })
		.returning();
	if (rows[0]) return rows[0];
	// Course rare : inséré entre-temps → relire.
	const again = await db
		.select()
		.from(foods)
		.where(eq(foods.nameNormalized, nameNormalized))
		.limit(1);
	return again[0];
}

/**
 * Remplace TOUS les items d'un repas par la sélection courante (autosave §5.2).
 * Delete + insert : simple et déterministe (peu d'items par repas). L'ordre de la
 * sélection est préservé via l'ordre d'insertion (id uuid v7 triable).
 */
export async function replaceItems(
	mealId: string,
	items: { foodId: string; portion: Portion }[],
): Promise<void> {
	await db.delete(mealItems).where(eq(mealItems.mealId, mealId));
	for (const item of items) {
		await db
			.insert(mealItems)
			.values({ id: newId(), mealId, foodId: item.foodId, portion: item.portion });
	}
}

/** Items résolus (aliment + triggers) d'un repas, dans l'ordre d'ajout. */
export async function getItems(mealId: string): Promise<MealItemView[]> {
	const rows = await db
		.select({
			foodId: mealItems.foodId,
			portion: mealItems.portion,
			displayFr: foods.displayFr,
			triggers: foods.triggers,
		})
		.from(mealItems)
		.innerJoin(foods, eq(mealItems.foodId, foods.id))
		.where(eq(mealItems.mealId, mealId))
		.orderBy(mealItems.id);
	return rows.map((r) => ({
		foodId: r.foodId,
		displayFr: r.displayFr,
		portion: r.portion as Portion,
		triggers: coerceTriggers(r.triggers),
	}));
}

/** Charge les items de plusieurs repas d'un coup (Map mealId → items). */
async function itemsForMeals(mealIds: string[]): Promise<Map<string, MealItemView[]>> {
	const out = new Map<string, MealItemView[]>();
	if (mealIds.length === 0) return out;
	const rows = await db
		.select({
			mealId: mealItems.mealId,
			foodId: mealItems.foodId,
			portion: mealItems.portion,
			displayFr: foods.displayFr,
			triggers: foods.triggers,
		})
		.from(mealItems)
		.innerJoin(foods, eq(mealItems.foodId, foods.id))
		.where(inArray(mealItems.mealId, mealIds))
		.orderBy(mealItems.id);
	for (const r of rows) {
		const view: MealItemView = {
			foodId: r.foodId,
			displayFr: r.displayFr,
			portion: r.portion as Portion,
			triggers: coerceTriggers(r.triggers),
		};
		const bucket = out.get(r.mealId);
		if (bucket) bucket.push(view);
		else out.set(r.mealId, [view]);
	}
	return out;
}

/** N repas COMMITÉS récents (non supprimés) avec leurs items résolus. */
export async function listRecentCommittedWithItems(n = 8): Promise<MealWithItems[]> {
	const rows = await db
		.select()
		.from(meals)
		.where(and(eq(meals.isDraft, 0), isNull(meals.deletedAt)))
		.orderBy(desc(meals.occurredAt))
		.limit(n);
	const itemsByMeal = await itemsForMeals(rows.map((m) => m.id));
	return rows.map((meal) => ({ meal, items: itemsByMeal.get(meal.id) ?? [] }));
}

/**
 * Brouillons photo « actifs » : source photo, non commités, non supprimés (§5.4).
 * Ce sont les scans en cours / en échec / abandonnés — ils restent visibles dans
 * « Récemment loggé » avec un shimmer, une carte d'erreur ou un bouton
 * « Ré-analyser » tant que l'utilisateur n'a pas confirmé (le brouillon survit à
 * un kill de l'app).
 */
export async function listActivePhotoDrafts(n = 10): Promise<MealWithItems[]> {
	const rows = await db
		.select()
		.from(meals)
		.where(and(eq(meals.source, "photo"), eq(meals.isDraft, 1), isNull(meals.deletedAt)))
		.orderBy(desc(meals.occurredAt))
		.limit(n);
	const itemsByMeal = await itemsForMeals(rows.map((m) => m.id));
	return rows.map((meal) => ({ meal, items: itemsByMeal.get(meal.id) ?? [] }));
}

/** Repas COMMITÉS depuis un local_date inclus, avec items (journal, corrélations). */
export async function listCommittedWithItemsSince(localDate: string): Promise<MealWithItems[]> {
	const rows = await listCommittedSince(localDate);
	const itemsByMeal = await itemsForMeals(rows.map((m) => m.id));
	return rows.map((meal) => ({ meal, items: itemsByMeal.get(meal.id) ?? [] }));
}
