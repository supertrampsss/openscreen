/**
 * Repository des repas (§9). Structure alignée sur symptomRepo pour le PR 4
 * (repas manuel) et le PR 5 (scan photo) : autosave brouillon, soft delete.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { newId } from "@/db/id";
import { type Meal, meals, type NewMeal } from "@/db/schema";

export interface MealDraftInput extends Partial<NewMeal> {
	id: string;
	occurredAt: number;
	tz: string;
	localDate: string;
}

export function newMealId(): string {
	return newId();
}

/** Autosave transactionnel du brouillon repas. */
export async function upsertDraft(entry: MealDraftInput): Promise<Meal> {
	const now = Date.now();
	const values: NewMeal = {
		isDraft: 1,
		source: "manual",
		createdAt: now,
		updatedAt: now,
		...entry,
	};
	const rows = await db.transaction(async (tx) => {
		return tx
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
	});
	return rows[0];
}

export async function commitDraft(id: string): Promise<void> {
	await db.update(meals).set({ isDraft: 0, updatedAt: Date.now() }).where(eq(meals.id, id));
}

export function listDay(localDate: string): Promise<Meal[]> {
	return db
		.select()
		.from(meals)
		.where(and(eq(meals.localDate, localDate), isNull(meals.deletedAt)))
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
