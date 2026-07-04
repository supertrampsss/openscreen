/**
 * Logique PURE des traitements (§5.9) — testable sous Node, zéro import RN.
 *
 *  - recalcul de la prochaine échéance à partir d'une cadence en semaines ;
 *  - taux d'observance sur une période (prises effectuées / attendues) ;
 *  - dates des rappels J-1 / J-0 (9 h) pour une échéance donnée.
 *
 * Les dates locales sont manipulées en 'YYYY-MM-DD' via l'UTC (aucun décalage de
 * fuseau : une local_date figée reste stable, §9 Dates).
 */

/** Cadences proposées à l'UI (semaines) pour injectable / perfusion. */
export const CADENCE_WEEKS_OPTIONS = [1, 2, 4, 6, 8] as const;

/** Ajoute `days` jours à une local_date 'YYYY-MM-DD' (UTC, déterministe). */
export function addDaysToLocalDate(localDate: string, days: number): string {
	const [y, m, d] = localDate.split("-").map(Number);
	const base = Date.UTC(y, m - 1, d);
	const next = new Date(base + days * 86_400_000);
	const yy = next.getUTCFullYear();
	const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(next.getUTCDate()).padStart(2, "0");
	return `${yy}-${mm}-${dd}`;
}

/**
 * Prochaine échéance = date de la prise + cadence×7 jours.
 * Renvoie `null` pour un traitement sans cadence (ponctuel / quotidien).
 */
export function computeNextDue(
	fromLocalDate: string,
	cadenceWeeks: number | null | undefined,
): string | null {
	if (!cadenceWeeks || cadenceWeeks <= 0) return null;
	return addDaysToLocalDate(fromLocalDate, cadenceWeeks * 7);
}

/** Nombre entier de jours entre deux local_dates (b - a), UTC. */
export function daysBetweenLocalDates(a: string, b: string): number {
	const [ay, am, ad] = a.split("-").map(Number);
	const [by, bm, bd] = b.split("-").map(Number);
	return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Une échéance approche-t-elle (0 ≤ jours restants ≤ seuil) ? (carte Home). */
export function isDueSoon(nextDue: string, today: string, withinDays = 2): boolean {
	const delta = daysBetweenLocalDates(today, nextDue);
	return delta >= 0 && delta <= withinDays;
}

/** Une échéance est-elle due aujourd'hui ou passée (bouton « Fait ✓ ») ? */
export function isDueToday(nextDue: string, today: string): boolean {
	return daysBetweenLocalDates(today, nextDue) <= 0;
}

/** Nombre de prises attendues sur une période pour une cadence donnée. */
export function expectedDoses(periodDays: number, cadenceWeeks: number | null | undefined): number {
	if (!cadenceWeeks || cadenceWeeks <= 0) return 0;
	const cycleDays = cadenceWeeks * 7;
	return Math.max(1, Math.round(periodDays / cycleDays));
}

export interface Adherence {
	/** Prises effectuées (events `taken`) sur la période. */
	taken: number;
	/** Prises attendues sur la période (selon la cadence). */
	expected: number;
	/** Ratio borné [0,1] (`taken / expected`). */
	rate: number;
}

/**
 * Taux d'observance d'un traitement à cadence sur `periodDays` jours.
 * `null` si le traitement n'a pas de cadence (observance non pertinente).
 */
export function adherenceForTreatment(
	cadenceWeeks: number | null | undefined,
	takenCount: number,
	periodDays: number,
): Adherence | null {
	const expected = expectedDoses(periodDays, cadenceWeeks);
	if (expected === 0) return null;
	const taken = Math.max(0, takenCount);
	return { taken, expected, rate: Math.min(1, taken / expected) };
}

/** Agrège l'observance de plusieurs traitements (somme des prises/attendus). */
export function aggregateAdherence(
	items: { cadenceWeeks: number | null | undefined; takenCount: number }[],
	periodDays: number,
): { taken: number; expected: number } | null {
	let taken = 0;
	let expected = 0;
	for (const it of items) {
		const a = adherenceForTreatment(it.cadenceWeeks, it.takenCount, periodDays);
		if (a) {
			taken += a.taken;
			expected += a.expected;
		}
	}
	return expected > 0 ? { taken, expected } : null;
}

/**
 * Dates des rappels pour une échéance : la veille (J-1) et le jour même (J-0) à
 * 9 h locales. Ne renvoie que les occurrences STRICTEMENT futures par rapport à
 * `now` (on ne programme jamais dans le passé).
 */
export function treatmentReminderDates(nextDue: string, now: Date): Date[] {
	const [y, m, d] = nextDue.split("-").map(Number);
	const dueDay = new Date(y, m - 1, d, 9, 0, 0, 0);
	const dayBefore = new Date(dueDay);
	dayBefore.setDate(dayBefore.getDate() - 1);
	return [dayBefore, dueDay].filter((dt) => dt.getTime() > now.getTime());
}
