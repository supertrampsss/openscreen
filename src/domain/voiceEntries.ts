/**
 * Voice entries — module PUR (zéro import React Native / expo), testable Node.
 *
 * Convertit les entrées structurées renvoyées par `/parse-voice` (§6.1, §7) en
 * brouillons prêts à committer, communs au pipeline « brouillon → confirmation »
 * (§5.4). Deux responsabilités testées :
 *   1. mapping de l'échelle de douleur/fatigue vers notre 0-3 (règle /3 arrondie) ;
 *   2. `timeOfDay` → `occurred_at` figé via `dates.ts` (jamais de dérive de fuseau).
 *
 * RÈGLE (loi 3) : ces valeurs pré-remplissent un brouillon que l'utilisateur
 * confirme — jamais un diagnostic, jamais committé sans son geste.
 */

import { type EntryTimestamp, localHourInTz, shiftMinutes } from "./dates";

/** Moment de la journée renvoyé par le modèle (schéma figé §6.1). */
export type VoiceTimeOfDay =
	| "morning"
	| "midday"
	| "afternoon"
	| "evening"
	| "night"
	| "yesterday_evening"
	| "unspecified";

/** Une entrée brute telle que renvoyée par le Worker (partielle par type). */
export interface RawVoiceEntry {
	type: "stool" | "symptom" | "meal";
	timeOfDay?: string;
	bristol?: number;
	count?: number;
	pain?: number;
	fatigue?: number;
	name?: string;
	notes?: string;
}

export interface StoolVoiceDraft {
	type: "stool";
	occurredAt: EntryTimestamp;
	bristol: number | null;
	/** Nombre de selles décrites par cette entrée (« 3 selles » → 3). */
	count: number;
	notes: string | null;
}

export interface SymptomVoiceDraft {
	type: "symptom";
	occurredAt: EntryTimestamp;
	pain: number | null;
	fatigue: number | null;
	notes: string | null;
}

export interface MealVoiceDraft {
	type: "meal";
	occurredAt: EntryTimestamp;
	name: string;
	notes: string | null;
}

export type VoiceDraft = StoolVoiceDraft | SymptomVoiceDraft | MealVoiceDraft;

/** Heures locales approximatives par moment de la journée. */
const TIME_OF_DAY_HOUR: Record<Exclude<VoiceTimeOfDay, "unspecified">, number> = {
	morning: 8,
	midday: 12,
	afternoon: 15,
	evening: 20,
	night: 23,
	yesterday_evening: 20,
};

/**
 * `timeOfDay` → horodatage figé. On décale `base` (maintenant) vers l'heure
 * locale cible, et d'un jour en arrière pour « hier soir ». `dates.ts` recalcule
 * la `local_date` — les voyages ne réordonnent jamais l'historique (§9).
 */
export function timeOfDayToTimestamp(
	timeOfDay: string | undefined,
	base: EntryTimestamp,
): EntryTimestamp {
	if (!timeOfDay || timeOfDay === "unspecified") return base;
	const key = timeOfDay as Exclude<VoiceTimeOfDay, "unspecified">;
	const targetHour = TIME_OF_DAY_HOUR[key];
	if (targetHour == null) return base;
	const currentHour = localHourInTz(base.epochMs, base.tz);
	let ts = shiftMinutes(base, (targetHour - currentHour) * 60);
	if (timeOfDay === "yesterday_evening") ts = shiftMinutes(ts, -24 * 60);
	return ts;
}

/**
 * Convertit une valeur de douleur/fatigue vers notre échelle 0-3.
 *
 * Le modèle est instruit de sortir déjà sur 0-3 (few-shot §6.1), mais on reste
 * DÉFENSIF : s'il glisse sur l'échelle patient 0-10 (valeur > 3), on applique la
 * règle documentée « /3 arrondie » (0-1→0, 2-4→1, 5-7→2, 8-10→3). Clampé 0-3.
 */
export function coerce0to3(value: number | undefined | null): number | null {
	if (value == null || Number.isNaN(value)) return null;
	const scaled = value > 3 ? Math.round(value / 3) : Math.round(value);
	return Math.max(0, Math.min(3, scaled));
}

/** Bristol borné 1-7 (null si absent/hors bornes). */
function clampBristol(value: number | undefined): number | null {
	if (value == null || Number.isNaN(value)) return null;
	const v = Math.round(value);
	return v >= 1 && v <= 7 ? v : null;
}

/** Compte de selles ≥ 1 (défaut 1, plafonné à 20 anti-aberration). */
function clampCount(value: number | undefined): number {
	if (value == null || Number.isNaN(value) || value < 1) return 1;
	return Math.min(20, Math.round(value));
}

function cleanNotes(notes: string | undefined): string | null {
	const n = notes?.trim();
	return n ? n : null;
}

/**
 * Mappe les entrées brutes vers des brouillons committables, dans l'ordre.
 * Écarte les entrées vides (symptôme sans signal, repas sans nom) — jamais de
 * brouillon fantôme.
 */
export function voiceEntriesToDrafts(
	entries: RawVoiceEntry[] | null | undefined,
	base: EntryTimestamp,
): VoiceDraft[] {
	if (!entries) return [];
	const drafts: VoiceDraft[] = [];
	for (const entry of entries) {
		const occurredAt = timeOfDayToTimestamp(entry.timeOfDay, base);
		const notes = cleanNotes(entry.notes);
		if (entry.type === "stool") {
			const bristol = clampBristol(entry.bristol);
			// Une entrée selle porte au moins un bristol OU un compte explicite.
			if (bristol == null && entry.count == null && !notes) continue;
			drafts.push({ type: "stool", occurredAt, bristol, count: clampCount(entry.count), notes });
		} else if (entry.type === "symptom") {
			const pain = coerce0to3(entry.pain);
			const fatigue = coerce0to3(entry.fatigue);
			if (pain == null && fatigue == null && !notes) continue;
			drafts.push({ type: "symptom", occurredAt, pain, fatigue, notes });
		} else if (entry.type === "meal") {
			const name = (entry.name ?? "").trim();
			if (!name) continue;
			drafts.push({ type: "meal", occurredAt, name, notes });
		}
	}
	return drafts;
}
