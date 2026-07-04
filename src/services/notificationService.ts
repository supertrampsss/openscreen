/**
 * Notifications locales (§7) — TOUT opt-in, granulaire, max 2/j par construction.
 *
 *  - Rappel du soir (quotidien, heure configurable, défaut 20h30) si la journée
 *    est vide ; copy adapté à l'obstacle onboarding ; ANNULÉ le jour même dès
 *    qu'un log est commité (abonnement à `logHooks`).
 *  - Bilan hebdo (dimanche 19h).
 *  - `scheduleTreatmentReminder(weeks)` : préparé pour la Phase 7 (non exposé UI).
 *
 * Web : no-op propre (l'export statique ne supporte pas les notifications).
 * La logique de calcul/copy est PURE (`@/domain/notifications`) et testée.
 */

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { nowEntryTimestamp } from "@/domain/dates";
import {
	coercePrefs,
	DEFAULT_NOTIFICATION_PREFS,
	eveningReminderCopyKey,
	type NotificationPrefs,
	nextDailyOccurrences,
} from "@/domain/notifications";
import { treatmentReminderDates } from "@/domain/treatments";
import i18n from "@/i18n";
import { listCommittedSince as listMealsSince } from "@/repositories/mealRepo";
import { getProfile } from "@/repositories/profileRepo";
import { get as getSetting, set as setSetting } from "@/repositories/settingsRepo";
import { listCommittedSince } from "@/repositories/symptomRepo";
import { listActive as listActiveTreatments } from "@/repositories/treatmentRepo";
import { onLogCommitted } from "./logHooks";

const PREFS_KEY = "notification_prefs";
const SUPPORTED = Platform.OS !== "web";
/** Dimanche (0=dimanche pour Date, 1=dimanche pour expo WeeklyTrigger). */
const WEEKLY_HOUR = 19;

type NotificationsModule = typeof import("expo-notifications");
let cached: NotificationsModule | null = null;
let initialised = false;

/** Charge expo-notifications dynamiquement (natif uniquement ; null sur web). */
async function lib(): Promise<NotificationsModule | null> {
	if (!SUPPORTED) return null;
	if (!cached) cached = await import("expo-notifications");
	return cached;
}

const tn = (key: string, opts?: Record<string, unknown>) =>
	i18n.t(key, { ns: "common", ...opts }) as string;

/** Lit les préférences de notification (fusionnées avec les défauts). */
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
	const raw = await getSetting<Partial<NotificationPrefs>>(PREFS_KEY);
	return coercePrefs(raw);
}

/** Écrit un patch de préférences puis re-planifie. */
export async function setNotificationPrefs(
	patch: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
	const next = coercePrefs({ ...(await getNotificationPrefs()), ...patch });
	await setSetting(PREFS_KEY, next);
	await reschedule();
	return next;
}

/** Demande la permission système. Renvoie true si accordée (false sur web). */
export async function requestNotificationPermission(): Promise<boolean> {
	const N = await lib();
	if (!N) return false;
	const current = await N.getPermissionsAsync();
	if (current.granted) return true;
	if (!current.canAskAgain) return false;
	const res = await N.requestPermissionsAsync();
	return res.granted;
}

/** Un log a-t-il déjà été commité aujourd'hui ? (annulation du jour, §7). */
async function hasLoggedToday(): Promise<boolean> {
	const today = nowEntryTimestamp().localDate;
	const [entries, meals] = await Promise.all([listCommittedSince(today), listMealsSince(today)]);
	return entries.some((e) => e.localDate === today) || meals.some((m) => m.localDate === today);
}

/**
 * (Re)planifie les notifications à partir des préférences courantes. Annule tout
 * l'existant d'abord (idempotent). No-op si non supporté / master off / non
 * autorisé.
 */
export async function reschedule(): Promise<void> {
	const N = await lib();
	if (!N) return;
	await N.cancelAllScheduledNotificationsAsync();

	const prefs = await getNotificationPrefs();
	if (!prefs.master) return;
	const perm = await N.getPermissionsAsync();
	if (!perm.granted) return;

	const now = new Date();

	if (prefs.eveningReminder) {
		// 7 one-shots d'avance (et non un trigger DAILY répétitif) : on garde la
		// possibilité de sauter l'occurrence du jour quand un log existe déjà, et
		// les rappels continuent même si l'app n'est pas rouverte pendant une
		// semaine. Re-remplis à chaque reschedule (ouverture / commit de log).
		const skipToday = await hasLoggedToday();
		const occurrences = nextDailyOccurrences(
			now,
			prefs.reminderHour,
			prefs.reminderMinute,
			7,
			skipToday,
		);
		const copyKey = eveningReminderCopyKey((await getProfile())?.obstacles);
		for (const when of occurrences) {
			await N.scheduleNotificationAsync({
				content: {
					title: tn(`notifCopy.evening.${copyKey}.title`),
					body: tn(`notifCopy.evening.${copyKey}.body`),
				},
				trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when },
			});
		}
	}

	if (prefs.weeklyDigest) {
		await N.scheduleNotificationAsync({
			content: { title: tn("notifCopy.weekly.title"), body: tn("notifCopy.weekly.body") },
			trigger: {
				type: N.SchedulableTriggerInputTypes.WEEKLY,
				weekday: 1, // 1 = dimanche pour expo-notifications.
				hour: WEEKLY_HOUR,
				minute: 0,
			},
		});
	}

	// Rappels de traitement à cycle long (§5.9) : J-1 et J-0 à 9 h pour chaque
	// traitement actif ayant une échéance. Re-programmés à chaque prise (le screen
	// appelle reschedule via markTaken).
	if (prefs.treatmentReminders) {
		const active = await listActiveTreatments().catch(() => []);
		for (const t of active) {
			if (!t.nextDue) continue;
			for (const when of treatmentReminderDates(t.nextDue, now)) {
				await N.scheduleNotificationAsync({
					content: {
						title: tn("notifCopy.treatment.title"),
						body: tn("notifCopy.treatment.bodyNamed", { name: t.name }),
					},
					trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when },
				});
			}
		}
	}
}

/**
 * Re-programme tous les rappels (dont ceux de traitement) — appelée par l'écran
 * Traitements après création/édition/prise. Alias sûr de `reschedule`.
 */
export async function syncTreatmentReminders(): Promise<void> {
	await reschedule();
}

/**
 * Rappel de traitement à cycle long (§5.9, Phase 7) — API présente mais NON
 * exposée en UI pour l'instant. Programme un rappel unique dans `weeks` semaines.
 */
export async function scheduleTreatmentReminder(weeks: number): Promise<void> {
	const N = await lib();
	if (!N || weeks <= 0) return;
	const when = new Date();
	when.setDate(when.getDate() + weeks * 7);
	when.setHours(10, 0, 0, 0);
	await N.scheduleNotificationAsync({
		content: { title: tn("notifCopy.treatment.title"), body: tn("notifCopy.treatment.body") },
		trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when },
	});
}

/**
 * Initialise le service (appelé une fois au démarrage, après migrations).
 * Configure le handler, le canal Android, s'abonne aux commits de logs pour
 * annuler le rappel du jour, puis planifie. No-op sur web.
 */
export async function initNotifications(): Promise<void> {
	if (!SUPPORTED || initialised) return;
	initialised = true;
	const N = await lib();
	if (!N) return;

	N.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowBanner: true,
			shouldShowList: true,
			shouldPlaySound: false,
			shouldSetBadge: false,
		}),
	});

	if (Platform.OS === "android") {
		await N.setNotificationChannelAsync("reminders", {
			name: "Rappels",
			importance: N.AndroidImportance.DEFAULT,
		}).catch(() => undefined);
	}

	// Un log commité aujourd'hui → on re-planifie (le rappel du soir passe à demain).
	onLogCommitted(() => {
		reschedule().catch(() => undefined);
	});

	await reschedule().catch(() => undefined);
}

/**
 * Active les rappels depuis l'onboarding : demande la permission puis fixe le
 * master en conséquence. Renvoie true si activé.
 */
export async function enableNotificationsFromOnboarding(): Promise<boolean> {
	const granted = await requestNotificationPermission();
	await setNotificationPrefs({ master: granted });
	return granted;
}

/** Hook Réglages : prefs + mise à jour + demande de permission. */
export function useNotificationPrefs() {
	const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
	const [loading, setLoading] = useState(true);

	const reload = useCallback(() => {
		getNotificationPrefs().then((p) => {
			setPrefs(p);
			setLoading(false);
		});
	}, []);

	useEffect(() => {
		reload();
	}, [reload]);

	const update = useCallback(async (patch: Partial<NotificationPrefs>) => {
		// Activer le master exige la permission système.
		if (patch.master === true) {
			const granted = await requestNotificationPermission();
			if (!granted && Platform.OS !== "web") {
				const next = await setNotificationPrefs({ ...patch, master: false });
				setPrefs(next);
				return false;
			}
		}
		const next = await setNotificationPrefs(patch);
		setPrefs(next);
		return true;
	}, []);

	return { prefs, loading, update, supported: SUPPORTED };
}
