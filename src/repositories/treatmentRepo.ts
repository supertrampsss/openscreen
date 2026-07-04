/**
 * Repository des traitements (§5.9).
 *
 * CRUD + prises (`markTaken` recalcule la prochaine échéance depuis la cadence),
 * effets secondaires (event `side_effect`), observance sur une période. La logique
 * de dates/observance est PURE (`@/domain/treatments`).
 */

import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { newId } from "@/db/id";
import {
	type NewTreatment,
	type Treatment,
	type TreatmentEvent,
	type TreatmentKind,
	treatmentEvents,
	treatments,
} from "@/db/schema";
import { localDateDaysAgo, nowEntryTimestamp } from "@/domain/dates";
import { type Adherence, adherenceForTreatment, computeNextDue } from "@/domain/treatments";

export function newTreatmentId(): string {
	return newId();
}

export interface TreatmentInput {
	name: string;
	kind: TreatmentKind;
	/** Cadence en semaines (null = ponctuel / quotidien : pas de rappel de cycle). */
	cadenceWeeks: number | null;
}

/** Traitements actifs (non supprimés), échéance la plus proche d'abord. */
export async function listActive(): Promise<Treatment[]> {
	const rows = await db
		.select()
		.from(treatments)
		.where(and(eq(treatments.isActive, 1), isNull(treatments.deletedAt)));
	return rows.sort((a, b) => {
		// nextDue défini d'abord (croissant), puis les ponctuels, puis par création.
		if (a.nextDue && b.nextDue) return a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : 0;
		if (a.nextDue) return -1;
		if (b.nextDue) return 1;
		return a.createdAt - b.createdAt;
	});
}

export async function get(id: string): Promise<Treatment | undefined> {
	const rows = await db.select().from(treatments).where(eq(treatments.id, id)).limit(1);
	return rows[0];
}

/**
 * Crée un traitement. Si une cadence est fournie sans échéance explicite, la
 * première échéance est fixée à aujourd'hui + cadence (le rappel de cycle démarre).
 */
export async function create(input: TreatmentInput): Promise<Treatment> {
	const now = Date.now();
	const today = nowEntryTimestamp().localDate;
	const values: NewTreatment = {
		id: newTreatmentId(),
		name: input.name.trim(),
		kind: input.kind,
		cadenceWeeks: input.cadenceWeeks,
		nextDue: computeNextDue(today, input.cadenceWeeks),
		isActive: 1,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(treatments).values(values);
	return (await get(values.id))!;
}

/** Met à jour nom/kind/cadence ; recalcule l'échéance si la cadence change. */
export async function update(id: string, input: TreatmentInput): Promise<Treatment | undefined> {
	const current = await get(id);
	if (!current) return undefined;
	const today = nowEntryTimestamp().localDate;
	// Si la cadence change, on repart d'une échéance à aujourd'hui + nouvelle cadence.
	const nextDue =
		input.cadenceWeeks !== current.cadenceWeeks
			? computeNextDue(today, input.cadenceWeeks)
			: current.nextDue;
	await db
		.update(treatments)
		.set({
			name: input.name.trim(),
			kind: input.kind,
			cadenceWeeks: input.cadenceWeeks,
			nextDue,
			updatedAt: Date.now(),
		})
		.where(eq(treatments.id, id));
	return get(id);
}

/** Soft-delete (§2 loi 2) : conserve l'historique, retire de la liste active. */
export async function softDelete(id: string): Promise<void> {
	await db
		.update(treatments)
		.set({ isActive: 0, deletedAt: Date.now(), updatedAt: Date.now() })
		.where(eq(treatments.id, id));
}

export interface MarkTakenResult {
	eventId: string;
	treatment: Treatment;
	/** Échéance AVANT la prise (pour l'undo). */
	previousNextDue: string | null;
}

/**
 * Enregistre une prise (event `taken`) et recalcule l'échéance = jour de la prise
 * + cadence×7. Renvoie de quoi annuler (undo snackbar).
 */
export async function markTaken(treatmentId: string): Promise<MarkTakenResult> {
	const t = await get(treatmentId);
	if (!t) throw new Error("treatment introuvable");
	const ts = nowEntryTimestamp();
	const eventId = newId();
	await db.insert(treatmentEvents).values({
		id: eventId,
		treatmentId,
		occurredAt: ts.epochMs,
		tz: ts.tz,
		localDate: ts.localDate,
		kind: "taken",
	});
	const previousNextDue = t.nextDue;
	const nextDue = computeNextDue(ts.localDate, t.cadenceWeeks);
	await db
		.update(treatments)
		.set({ nextDue, updatedAt: Date.now() })
		.where(eq(treatments.id, treatmentId));
	return { eventId, treatment: (await get(treatmentId))!, previousNextDue };
}

/** Annule une prise : supprime l'event et restaure l'échéance précédente. */
export async function undoTaken(
	treatmentId: string,
	eventId: string,
	previousNextDue: string | null,
): Promise<void> {
	await db.delete(treatmentEvents).where(eq(treatmentEvents.id, eventId));
	await db
		.update(treatments)
		.set({ nextDue: previousNextDue, updatedAt: Date.now() })
		.where(eq(treatments.id, treatmentId));
}

/** Enregistre un effet secondaire (chips + note) en un event `side_effect`. */
export async function addSideEffect(
	treatmentId: string,
	symptoms: string[],
	note?: string,
): Promise<void> {
	const ts = nowEntryTimestamp();
	const parts = [...symptoms];
	if (note?.trim()) parts.push(note.trim());
	await db.insert(treatmentEvents).values({
		id: newId(),
		treatmentId,
		occurredAt: ts.epochMs,
		tz: ts.tz,
		localDate: ts.localDate,
		kind: "side_effect",
		notes: parts.join(" · ") || null,
	});
}

/** Historique d'un traitement (récents d'abord). */
export function listEvents(treatmentId: string, limit = 50): Promise<TreatmentEvent[]> {
	return db
		.select()
		.from(treatmentEvents)
		.where(eq(treatmentEvents.treatmentId, treatmentId))
		.orderBy(desc(treatmentEvents.occurredAt))
		.limit(limit);
}

/** Nombre de prises (`taken`) depuis une local_date incluse. */
async function takenCountSince(treatmentId: string, fromLocalDate: string): Promise<number> {
	const rows = await db
		.select({ localDate: treatmentEvents.localDate })
		.from(treatmentEvents)
		.where(
			and(
				eq(treatmentEvents.treatmentId, treatmentId),
				eq(treatmentEvents.kind, "taken"),
				gte(treatmentEvents.localDate, fromLocalDate),
			),
		);
	return rows.length;
}

/** Observance d'un traitement sur `periodDays` jours (null sans cadence). */
export async function adherenceRate(
	treatmentId: string,
	periodDays: number,
): Promise<Adherence | null> {
	const t = await get(treatmentId);
	if (!t) return null;
	const from = localDateDaysAgo(periodDays - 1);
	const taken = await takenCountSince(treatmentId, from);
	return adherenceForTreatment(t.cadenceWeeks, taken, periodDays);
}

/** Prise du jour déjà enregistrée ? (pour masquer le bouton « Fait ✓ »). */
export async function hasTakenToday(treatmentId: string): Promise<boolean> {
	const today = nowEntryTimestamp().localDate;
	const rows = await db
		.select({ id: treatmentEvents.id })
		.from(treatmentEvents)
		.where(
			and(
				eq(treatmentEvents.treatmentId, treatmentId),
				eq(treatmentEvents.kind, "taken"),
				eq(treatmentEvents.localDate, today),
			),
		)
		.limit(1);
	return rows.length > 0;
}

/**
 * Entrées d'observance des traitements actifs sur `periodDays` jours, pour le
 * rapport médecin (§5.8) : cadence + nombre de prises effectuées.
 */
export async function adherenceInputs(
	periodDays: number,
): Promise<{ cadenceWeeks: number | null; takenCount: number }[]> {
	const from = localDateDaysAgo(periodDays - 1);
	const active = await listActive();
	return Promise.all(
		active.map(async (t) => ({
			cadenceWeeks: t.cadenceWeeks ?? null,
			takenCount: await takenCountSince(t.id, from),
		})),
	);
}

export async function countAll(): Promise<number> {
	const rows = await db.select({ id: treatments.id }).from(treatments);
	return rows.length;
}
