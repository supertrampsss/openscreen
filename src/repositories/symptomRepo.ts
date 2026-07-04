/**
 * Repository des entrées symptômes/selles (§9).
 *
 * L'autosave (§2 loi 2) passe par `upsertDraft` : chaque tap dans un sheet
 * réécrit le brouillon de façon transactionnelle (INSERT ... ON CONFLICT UPDATE).
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { newId } from "@/db/id";
import { type NewSymptomEntry, type SymptomEntry, symptomEntries } from "@/db/schema";

export type SymptomKind = "stool" | "symptom";

/** Champ minimal requis pour créer/mettre à jour un brouillon. */
export interface DraftInput extends Partial<NewSymptomEntry> {
	id: string;
	occurredAt: number;
	tz: string;
	localDate: string;
	kind: SymptomKind;
}

/** Génère un id neuf pour un brouillon. */
export function newEntryId(): string {
	return newId();
}

/**
 * Autosave : upsert transactionnel du brouillon.
 * Renvoie l'entrée telle qu'enregistrée.
 */
export async function upsertDraft(entry: DraftInput): Promise<SymptomEntry> {
	const now = Date.now();
	const values: NewSymptomEntry = {
		isDraft: 1,
		createdAt: now,
		updatedAt: now,
		...entry,
	};

	// Upsert atomique en UNE instruction (INSERT ... ON CONFLICT) : pas besoin de
	// transaction explicite — et surtout, `db.transaction(async …)` est un piège
	// sur le driver expo-sqlite SYNChrone (le `commit` part avant l'exécution du
	// builder, laissant l'INSERT hors transaction et désynchronisant le worker WASM
	// web → corruption de lecture). Cf. src/db/client.ts.
	const rows = await db
		.insert(symptomEntries)
		.values(values)
		.onConflictDoUpdate({
			target: symptomEntries.id,
			set: {
				occurredAt: values.occurredAt,
				tz: values.tz,
				localDate: values.localDate,
				kind: values.kind,
				bristol: values.bristol ?? null,
				urgency: values.urgency ?? null,
				blood: values.blood ?? null,
				pain: values.pain ?? null,
				painZone: values.painZone ?? null,
				fatigue: values.fatigue ?? null,
				wellbeing: values.wellbeing ?? null,
				extraIntestinal: values.extraIntestinal ?? null,
				notes: values.notes ?? null,
				updatedAt: now,
			},
		})
		.returning();
	return rows[0];
}

/** Valide un brouillon : is_draft = 0. */
export async function commitDraft(id: string): Promise<void> {
	await db
		.update(symptomEntries)
		.set({ isDraft: 0, updatedAt: Date.now() })
		.where(eq(symptomEntries.id, id));
}

/** Entrées d'un jour (non supprimées), plus récentes d'abord. */
export function listDay(localDate: string): Promise<SymptomEntry[]> {
	return db
		.select()
		.from(symptomEntries)
		.where(and(eq(symptomEntries.localDate, localDate), isNull(symptomEntries.deletedAt)))
		.orderBy(desc(symptomEntries.occurredAt));
}

/** N entrées récentes (non supprimées) tous jours confondus. */
export function listRecent(n = 20): Promise<SymptomEntry[]> {
	return db
		.select()
		.from(symptomEntries)
		.where(isNull(symptomEntries.deletedAt))
		.orderBy(desc(symptomEntries.occurredAt))
		.limit(n);
}

/** Toutes les entrées non supprimées (pour le journal / groupement). */
export function listAll(limit = 500): Promise<SymptomEntry[]> {
	return db
		.select()
		.from(symptomEntries)
		.where(isNull(symptomEntries.deletedAt))
		.orderBy(desc(symptomEntries.occurredAt))
		.limit(limit);
}

/** Soft delete (§2 loi 2). */
export async function softDelete(id: string): Promise<void> {
	await db
		.update(symptomEntries)
		.set({ deletedAt: Date.now(), updatedAt: Date.now() })
		.where(eq(symptomEntries.id, id));
}

/** Annule un soft delete (undo snackbar). */
export async function restore(id: string): Promise<void> {
	await db
		.update(symptomEntries)
		.set({ deletedAt: null, updatedAt: Date.now() })
		.where(eq(symptomEntries.id, id));
}

/**
 * Dernières valeurs enregistrées pour un `kind` — alimente les défauts
 * intelligents (§2 loi 1 : ex. Bristol par défaut = dernier utilisé).
 */
export async function getLastUsedValues(kind: SymptomKind): Promise<SymptomEntry | null> {
	const rows = await db
		.select()
		.from(symptomEntries)
		.where(
			and(
				eq(symptomEntries.kind, kind),
				eq(symptomEntries.isDraft, 0),
				isNull(symptomEntries.deletedAt),
			),
		)
		.orderBy(desc(symptomEntries.occurredAt))
		.limit(1);
	return rows[0] ?? null;
}

/** Brouillons non commités (pour le badge « brouillon » dans Récemment loggé). */
export function listDrafts(): Promise<SymptomEntry[]> {
	return db
		.select()
		.from(symptomEntries)
		.where(and(eq(symptomEntries.isDraft, 1), isNull(symptomEntries.deletedAt)))
		.orderBy(desc(symptomEntries.occurredAt));
}
