/**
 * Logique PURE des notifications (§7) — testable sous Node, zéro import RN.
 *
 * Deux notifications locales, opt-in, granulaires, max 2/j par construction :
 *  - rappel du soir (quotidien) si la journée est vide, copy adapté à l'obstacle
 *    déclaré à l'onboarding ;
 *  - bilan hebdo (dimanche soir).
 *
 * Ces fonctions calculent les prochaines occurrences et le copy ; le service
 * (impur) fait les appels expo-notifications à partir de leurs résultats.
 */

export interface NotificationPrefs {
	/** Interrupteur maître : rien n'est programmé si false. */
	master: boolean;
	/** Rappel doux du soir si journée vide. */
	eveningReminder: boolean;
	/** Bilan hebdo du dimanche. */
	weeklyDigest: boolean;
	/** Rappels de traitement à cycle long (J-1 / J-0 des biothérapies, §5.9). */
	treatmentReminders: boolean;
	/** Heure du rappel du soir (0-23). */
	reminderHour: number;
	/** Minute du rappel du soir (0-59). */
	reminderMinute: number;
}

/** Défauts (§7 : rappel du soir 20h30, bilan hebdo actifs mais MASTER off tant
 * que l'utilisateur n'a pas opté). */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
	master: false,
	eveningReminder: true,
	weeklyDigest: true,
	treatmentReminders: true,
	reminderHour: 20,
	reminderMinute: 30,
};

/** Fusionne des prefs partielles (persistées) avec les défauts. */
export function coercePrefs(raw: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
	if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
	return {
		master: typeof raw.master === "boolean" ? raw.master : DEFAULT_NOTIFICATION_PREFS.master,
		eveningReminder:
			typeof raw.eveningReminder === "boolean"
				? raw.eveningReminder
				: DEFAULT_NOTIFICATION_PREFS.eveningReminder,
		weeklyDigest:
			typeof raw.weeklyDigest === "boolean"
				? raw.weeklyDigest
				: DEFAULT_NOTIFICATION_PREFS.weeklyDigest,
		treatmentReminders:
			typeof raw.treatmentReminders === "boolean"
				? raw.treatmentReminders
				: DEFAULT_NOTIFICATION_PREFS.treatmentReminders,
		reminderHour: clampInt(raw.reminderHour, 0, 23, DEFAULT_NOTIFICATION_PREFS.reminderHour),
		reminderMinute: clampInt(raw.reminderMinute, 0, 59, DEFAULT_NOTIFICATION_PREFS.reminderMinute),
	};
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Suffixe de copy du rappel du soir selon les obstacles déclarés (§4.10, §7).
 * Priorité au plus sensible : « ça m'angoisse » → ton le plus doux ; sinon
 * « j'oublie » ; sinon « trop long » ; sinon « le médecin ne regarde pas » ;
 * défaut neutre.
 */
export function eveningReminderCopyKey(obstacles: readonly string[] | null | undefined): string {
	const set = new Set(obstacles ?? []);
	if (set.has("anxious")) return "anxious";
	if (set.has("forget")) return "forget";
	if (set.has("too_long")) return "too_long";
	if (set.has("doctor")) return "doctor";
	return "default";
}

/**
 * Prochaine occurrence quotidienne à `hour:minute` à partir de `now` (heure
 * locale de la Date). Aujourd'hui si l'heure est encore à venir, sinon demain.
 */
export function nextDailyOccurrence(now: Date, hour: number, minute: number): Date {
	const next = new Date(now);
	next.setHours(hour, minute, 0, 0);
	if (next.getTime() <= now.getTime()) {
		next.setDate(next.getDate() + 1);
	}
	return next;
}

/**
 * Les `count` prochaines occurrences quotidiennes à `hour:minute`, en one-shots.
 * Un trigger répétitif DAILY ne permettrait pas d'annuler la seule occurrence du
 * jour quand un log existe déjà — on planifie donc N one-shots d'avance : même si
 * l'app n'est pas rouverte après le premier rappel, les suivants partent quand
 * même (re-remplis à chaque reschedule : ouverture d'app ou commit de log).
 * `skipToday` exclut l'occurrence du jour (déjà loggé) sans réduire le total.
 */
export function nextDailyOccurrences(
	now: Date,
	hour: number,
	minute: number,
	count: number,
	skipToday: boolean,
): Date[] {
	const out: Date[] = [];
	let cursor = nextDailyOccurrence(now, hour, minute);
	if (
		skipToday &&
		cursor.getFullYear() === now.getFullYear() &&
		cursor.getMonth() === now.getMonth() &&
		cursor.getDate() === now.getDate()
	) {
		cursor = new Date(cursor);
		cursor.setDate(cursor.getDate() + 1);
	}
	for (let i = 0; i < count; i++) {
		out.push(new Date(cursor));
		cursor = new Date(cursor);
		cursor.setDate(cursor.getDate() + 1);
	}
	return out;
}

/**
 * Prochaine occurrence hebdomadaire à un jour (0=dimanche … 6=samedi) et une
 * heure donnés, à partir de `now`. Si c'est aujourd'hui et l'heure est passée,
 * on renvoie la semaine suivante.
 */
export function nextWeeklyOccurrence(
	now: Date,
	weekday: number,
	hour: number,
	minute: number,
): Date {
	const next = new Date(now);
	next.setHours(hour, minute, 0, 0);
	let deltaDays = (weekday - now.getDay() + 7) % 7;
	if (deltaDays === 0 && next.getTime() <= now.getTime()) {
		deltaDays = 7;
	}
	next.setDate(next.getDate() + deltaDays);
	return next;
}

/**
 * Faut-il faire sonner le rappel du soir aujourd'hui ? Non si les rappels sont
 * coupés, non si la journée a déjà au moins un log (§7 : annulation du jour).
 */
export function eveningReminderShouldFire(
	prefs: NotificationPrefs,
	hasLoggedToday: boolean,
): boolean {
	if (!prefs.master || !prefs.eveningReminder) return false;
	return !hasLoggedToday;
}

/** `HH:MM` (24 h) pour l'affichage de l'heure choisie. */
export function formatReminderTime(hour: number, minute: number): string {
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
