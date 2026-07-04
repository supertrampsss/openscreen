import { describe, expect, it } from "vitest";
import {
	coercePrefs,
	DEFAULT_NOTIFICATION_PREFS,
	eveningReminderCopyKey,
	eveningReminderShouldFire,
	formatReminderTime,
	nextDailyOccurrence,
	nextDailyOccurrences,
	nextWeeklyOccurrence,
} from "./notifications";

describe("coercePrefs", () => {
	it("renvoie les défauts pour null/undefined", () => {
		expect(coercePrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
		expect(coercePrefs(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFS);
	});

	it("fusionne et borne les valeurs", () => {
		const p = coercePrefs({ master: true, reminderHour: 99, reminderMinute: -5 });
		expect(p.master).toBe(true);
		expect(p.reminderHour).toBe(23);
		expect(p.reminderMinute).toBe(0);
		expect(p.weeklyDigest).toBe(DEFAULT_NOTIFICATION_PREFS.weeklyDigest);
	});
});

describe("eveningReminderCopyKey (mapping obstacle → copy)", () => {
	it("priorise le ton le plus doux (anxious)", () => {
		expect(eveningReminderCopyKey(["forget", "anxious"])).toBe("anxious");
	});
	it("forget avant too_long", () => {
		expect(eveningReminderCopyKey(["too_long", "forget"])).toBe("forget");
	});
	it("too_long puis doctor", () => {
		expect(eveningReminderCopyKey(["too_long"])).toBe("too_long");
		expect(eveningReminderCopyKey(["doctor"])).toBe("doctor");
	});
	it("défaut si aucun obstacle connu", () => {
		expect(eveningReminderCopyKey([])).toBe("default");
		expect(eveningReminderCopyKey(null)).toBe("default");
		expect(eveningReminderCopyKey(["unknown"])).toBe("default");
	});
});

describe("nextDailyOccurrence", () => {
	it("aujourd'hui si l'heure est encore à venir", () => {
		const now = new Date(2026, 0, 10, 12, 0, 0);
		const next = nextDailyOccurrence(now, 20, 30);
		expect(next.getDate()).toBe(10);
		expect(next.getHours()).toBe(20);
		expect(next.getMinutes()).toBe(30);
	});
	it("demain si l'heure est passée", () => {
		const now = new Date(2026, 0, 10, 21, 0, 0);
		const next = nextDailyOccurrence(now, 20, 30);
		expect(next.getDate()).toBe(11);
	});
	it("demain si on est pile à l'heure", () => {
		const now = new Date(2026, 0, 10, 20, 30, 0);
		expect(nextDailyOccurrence(now, 20, 30).getDate()).toBe(11);
	});
});

describe("nextWeeklyOccurrence (dimanche 19h)", () => {
	it("prochain dimanche depuis un mercredi", () => {
		// 2026-01-07 est un mercredi.
		const now = new Date(2026, 0, 7, 12, 0, 0);
		const next = nextWeeklyOccurrence(now, 0, 19, 0);
		expect(next.getDay()).toBe(0);
		expect(next.getDate()).toBe(11); // dimanche 11 janvier
		expect(next.getHours()).toBe(19);
	});
	it("dimanche suivant si dimanche déjà passé l'heure", () => {
		// 2026-01-11 est un dimanche.
		const now = new Date(2026, 0, 11, 20, 0, 0);
		const next = nextWeeklyOccurrence(now, 0, 19, 0);
		expect(next.getDate()).toBe(18);
	});
	it("dimanche même si l'heure est encore à venir", () => {
		const now = new Date(2026, 0, 11, 10, 0, 0);
		const next = nextWeeklyOccurrence(now, 0, 19, 0);
		expect(next.getDate()).toBe(11);
	});
});

describe("eveningReminderShouldFire (annulation du jour)", () => {
	const on = { ...DEFAULT_NOTIFICATION_PREFS, master: true, eveningReminder: true };
	it("sonne si journée vide", () => {
		expect(eveningReminderShouldFire(on, false)).toBe(true);
	});
	it("ne sonne pas si un log existe déjà", () => {
		expect(eveningReminderShouldFire(on, false)).toBe(true);
		expect(eveningReminderShouldFire(on, true)).toBe(false);
	});
	it("ne sonne jamais si master ou evening off", () => {
		expect(eveningReminderShouldFire({ ...on, master: false }, false)).toBe(false);
		expect(eveningReminderShouldFire({ ...on, eveningReminder: false }, false)).toBe(false);
	});
});

describe("nextDailyOccurrences (7 one-shots d'avance — le rappel survit sans réouverture)", () => {
	// 2026-01-10 est un samedi ; heure du rappel : 20h30.
	it("7 occurrences consécutives quand l'heure du jour est à venir", () => {
		const now = new Date(2026, 0, 10, 10, 0, 0);
		const occ = nextDailyOccurrences(now, 20, 30, 7, false);
		expect(occ).toHaveLength(7);
		expect(occ[0].getDate()).toBe(10); // aujourd'hui 20h30 inclus
		expect(occ[6].getDate()).toBe(16);
		for (const d of occ) {
			expect(d.getHours()).toBe(20);
			expect(d.getMinutes()).toBe(30);
		}
	});
	it("skipToday exclut l'occurrence du jour sans réduire le total", () => {
		const now = new Date(2026, 0, 10, 10, 0, 0);
		const occ = nextDailyOccurrences(now, 20, 30, 7, true);
		expect(occ).toHaveLength(7);
		expect(occ[0].getDate()).toBe(11); // demain
		expect(occ[6].getDate()).toBe(17);
	});
	it("heure déjà passée : démarre demain, skipToday sans effet supplémentaire", () => {
		const now = new Date(2026, 0, 10, 22, 0, 0);
		const plain = nextDailyOccurrences(now, 20, 30, 7, false);
		const skipped = nextDailyOccurrences(now, 20, 30, 7, true);
		expect(plain[0].getDate()).toBe(11);
		expect(skipped[0].getDate()).toBe(11); // la 1re occurrence n'est plus « aujourd'hui »
	});
	it("franchit les fins de mois", () => {
		const now = new Date(2026, 0, 29, 10, 0, 0);
		const occ = nextDailyOccurrences(now, 20, 30, 7, false);
		expect(occ[0].getDate()).toBe(29);
		expect(occ[3].getMonth()).toBe(1); // 1er février
		expect(occ[3].getDate()).toBe(1);
	});
});

describe("formatReminderTime", () => {
	it("formate en HH:MM", () => {
		expect(formatReminderTime(20, 30)).toBe("20:30");
		expect(formatReminderTime(9, 5)).toBe("09:05");
	});
});
