/**
 * Dates — module PUR (zéro import React Native), testable sous Node/Vitest.
 *
 * C'est la SEULE source de `local_date` : figée à la saisie dans la timezone
 * du device, elle garantit qu'un voyage ne réordonne jamais l'historique (§9).
 */

export interface EntryTimestamp {
	/** Epoch millisecondes. */
	epochMs: number;
	/** Timezone IANA (ex. « Europe/Paris »). */
	tz: string;
	/** Date locale figée 'YYYY-MM-DD'. */
	localDate: string;
}

/** Timezone IANA courante via Intl (fallback UTC). */
export function currentTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

/**
 * Calcule la date locale 'YYYY-MM-DD' d'un instant dans une timezone donnée.
 * Utilise Intl (en-CA → format ISO) pour éviter toute dérive de fuseau.
 */
export function localDateInTz(epochMs: number, tz: string): string {
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	// en-CA rend déjà 'YYYY-MM-DD'.
	return fmt.format(new Date(epochMs));
}

/** Horodatage complet pour une nouvelle entrée (maintenant). */
export function nowEntryTimestamp(nowMs: number = Date.now()): EntryTimestamp {
	const tz = currentTimeZone();
	return {
		epochMs: nowMs,
		tz,
		localDate: localDateInTz(nowMs, tz),
	};
}

/** Décale un timestamp de N minutes et recalcule la date locale. */
export function shiftMinutes(base: EntryTimestamp, minutes: number): EntryTimestamp {
	const epochMs = base.epochMs + minutes * 60_000;
	return {
		epochMs,
		tz: base.tz,
		localDate: localDateInTz(epochMs, base.tz),
	};
}

/** Construit un EntryTimestamp à partir d'un instant arbitraire. */
export function entryTimestampAt(epochMs: number, tz: string = currentTimeZone()): EntryTimestamp {
	return { epochMs, tz, localDate: localDateInTz(epochMs, tz) };
}

/**
 * Décale une date locale 'YYYY-MM-DD' de N jours civils (même technique que
 * `streak.addDays`) : on opère sur la CHAÎNE via midi UTC, jamais sur des
 * millisecondes réelles. Indispensable pour rester juste les jours de DST — un
 * jour de 23 h (printemps) ou 25 h (automne) reste UN jour civil. Passer par
 * `shiftMinutes` (ms réelles) ferait sauter « hier » le matin d'un jour à 23 h.
 */
export function addLocalDays(localDate: string, n: number): string {
	const [y, m, d] = localDate.split("-").map(Number);
	const shifted = new Date(Date.UTC(y, m - 1, d, 12) + n * 86_400_000);
	const pad = (x: number) => String(x).padStart(2, "0");
	return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** local_date de N jours avant une date de référence (dans sa tz). */
export function localDateDaysAgo(days: number, ref: EntryTimestamp = nowEntryTimestamp()): string {
	// DST-safe : arithmétique sur la date civile, pas sur les ms (cf. addLocalDays).
	return addLocalDays(ref.localDate, -days);
}

/**
 * Renvoie les 7 dates locales de la semaine glissante se terminant aujourd'hui
 * (index 0 = il y a 6 jours … index 6 = aujourd'hui).
 */
export function last7LocalDates(ref: EntryTimestamp = nowEntryTimestamp()): string[] {
	const out: string[] = [];
	for (let i = 6; i >= 0; i--) {
		// DST-safe : on décale la date civile, jamais l'epoch (cf. addLocalDays).
		out.push(addLocalDays(ref.localDate, -i));
	}
	return out;
}

/** Groupe des éléments par leur `local_date`, ordre décroissant (récent d'abord). */
export function groupByLocalDate<T extends { localDate: string }>(items: T[]): [string, T[]][] {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const bucket = map.get(item.localDate);
		if (bucket) {
			bucket.push(item);
		} else {
			map.set(item.localDate, [item]);
		}
	}
	return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
}

/** Heure locale (0-23) d'un instant dans une timezone (pour les défauts horaires). */
export function localHourInTz(epochMs: number, tz: string): number {
	const h = new Intl.DateTimeFormat("en-GB", {
		timeZone: tz,
		hour: "2-digit",
		hour12: false,
	}).format(new Date(epochMs));
	// en-GB rend '00'..'23' (parfois '24' à minuit selon l'implémentation → % 24).
	return Number.parseInt(h, 10) % 24;
}

/** Heure locale 'HH:MM' d'un instant dans une timezone. */
export function formatClock(epochMs: number, tz: string): string {
	return new Intl.DateTimeFormat("fr-FR", {
		timeZone: tz,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(epochMs));
}

const DAY_LABELS_FR = ["D", "L", "M", "M", "J", "V", "S"];

/** Métadonnées d'affichage d'une local_date (lettre du jour + numéro). */
export function describeLocalDate(localDate: string): { label: string; dayNumber: number } {
	const [y, m, d] = localDate.split("-").map(Number);
	// Midi UTC pour éviter les basculements de fuseau sur l'étiquette.
	const date = new Date(Date.UTC(y, m - 1, d, 12));
	return {
		label: DAY_LABELS_FR[date.getUTCDay()],
		dayNumber: d,
	};
}
