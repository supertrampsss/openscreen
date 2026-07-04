import { describe, expect, it } from "vitest";
import {
	addLocalDays,
	describeLocalDate,
	entryTimestampAt,
	formatClock,
	groupByLocalDate,
	last7LocalDates,
	localDateDaysAgo,
	localDateInTz,
	shiftMinutes,
} from "./dates";

describe("localDateInTz — stable et fuseau-correct", () => {
	it("un même instant tombe sur des dates locales différentes selon le fuseau", () => {
		const t = Date.UTC(2024, 0, 1, 0, 30); // 00:30 UTC
		expect(localDateInTz(t, "Europe/Paris")).toBe("2024-01-01"); // 01:30 → 1er
		expect(localDateInTz(t, "America/New_York")).toBe("2023-12-31"); // 19:30 → 31 déc
		expect(localDateInTz(t, "Asia/Tokyo")).toBe("2024-01-01"); // 09:30 → 1er
	});
	it("déterministe (même entrée → même sortie)", () => {
		const t = Date.UTC(2024, 5, 15, 10, 0);
		expect(localDateInTz(t, "Europe/Paris")).toBe(localDateInTz(t, "Europe/Paris"));
	});
});

describe("shiftMinutes — décale et recalcule local_date", () => {
	it("recule sous minuit → jour précédent (dans le tz de la base)", () => {
		const base = entryTimestampAt(Date.UTC(2024, 0, 1, 0, 30), "Europe/Paris"); // 01:30 Paris, 1er
		const shifted = shiftMinutes(base, -120); // -2h → 23:30 Paris le 31 déc
		expect(shifted.localDate).toBe("2023-12-31");
		expect(shifted.epochMs).toBe(base.epochMs - 120 * 60_000);
		expect(shifted.tz).toBe("Europe/Paris");
	});
	it("avance au-delà de minuit → jour suivant", () => {
		const base = entryTimestampAt(Date.UTC(2024, 0, 1, 22, 30), "Europe/Paris"); // 23:30 Paris
		expect(shiftMinutes(base, 60).localDate).toBe("2024-01-02"); // 00:30 Paris
	});
});

describe("localDateDaysAgo & last7LocalDates — DST-safe (jour civil, pas ms)", () => {
	// Europe/Paris — printemps 2026 : bascule le dimanche 29 mars 02:00→03:00
	// (jour de 23 h). Le matin du 30 mars 00:30 (déjà en heure d'été, UTC+2),
	// un décalage en ms réelles faisait sauter « hier » (29 mars).
	it("printemps (jour de 23 h) : 'hier' = 2026-03-29, pas 03-28", () => {
		// 2026-03-30 00:30 Paris (UTC+2) = 2026-03-29 22:30 UTC.
		const ref = entryTimestampAt(Date.UTC(2026, 2, 29, 22, 30), "Europe/Paris");
		expect(ref.localDate).toBe("2026-03-30");
		expect(localDateDaysAgo(1, ref)).toBe("2026-03-29");
		expect(localDateDaysAgo(2, ref)).toBe("2026-03-28");
		const week = last7LocalDates(ref);
		expect(week).toEqual([
			"2026-03-24",
			"2026-03-25",
			"2026-03-26",
			"2026-03-27",
			"2026-03-28",
			"2026-03-29", // « hier » — l'ancien calcul en ms le perdait
			"2026-03-30",
		]);
	});

	// Europe/Paris — automne 2026 : bascule le dimanche 25 octobre 03:00→02:00
	// (jour de 25 h). Le soir du 25 (UTC+1), un décalage en ms réelles renvoyait
	// « aujourd'hui » (25 oct) au lieu d'« hier » (24 oct).
	it("automne (jour de 25 h) : 'hier' = 2026-10-24, pas un doublon du 25", () => {
		// 2026-10-25 23:30 Paris (UTC+1, après la bascule) = 2026-10-25 22:30 UTC.
		const ref = entryTimestampAt(Date.UTC(2026, 9, 25, 22, 30), "Europe/Paris");
		expect(ref.localDate).toBe("2026-10-25");
		expect(localDateDaysAgo(1, ref)).toBe("2026-10-24");
		const week = last7LocalDates(ref);
		expect(week).toEqual([
			"2026-10-19",
			"2026-10-20",
			"2026-10-21",
			"2026-10-22",
			"2026-10-23",
			"2026-10-24",
			"2026-10-25",
		]);
		// 7 dates distinctes, strictement croissantes (ni saut, ni doublon).
		expect(new Set(week).size).toBe(7);
	});

	it("addLocalDays traverse un mois et une bascule sans dériver", () => {
		expect(addLocalDays("2026-03-29", 1)).toBe("2026-03-30");
		expect(addLocalDays("2026-10-25", -1)).toBe("2026-10-24");
		expect(addLocalDays("2026-01-31", 1)).toBe("2026-02-01");
	});
});

describe("groupByLocalDate — groupe et trie du plus récent au plus ancien", () => {
	it("regroupe par local_date, ordre décroissant", () => {
		const items = [
			{ localDate: "2024-01-01", id: "a" },
			{ localDate: "2024-01-03", id: "b" },
			{ localDate: "2024-01-01", id: "c" },
			{ localDate: "2024-01-02", id: "d" },
		];
		const grouped = groupByLocalDate(items);
		expect(grouped.map(([d]) => d)).toEqual(["2024-01-03", "2024-01-02", "2024-01-01"]);
		expect(grouped[2][1].map((x) => x.id)).toEqual(["a", "c"]);
	});
	it("liste vide → tableau vide", () => {
		expect(groupByLocalDate([])).toEqual([]);
	});
});

describe("last7LocalDates & describeLocalDate", () => {
	it("renvoie 7 dates croissantes se terminant à la référence", () => {
		const ref = entryTimestampAt(Date.UTC(2024, 0, 10, 12, 0), "Europe/Paris");
		const week = last7LocalDates(ref);
		expect(week).toHaveLength(7);
		expect(week[6]).toBe("2024-01-10");
		expect(week[0]).toBe("2024-01-04");
	});
	it("describeLocalDate extrait le numéro du jour", () => {
		expect(describeLocalDate("2024-01-10").dayNumber).toBe(10);
	});
});

describe("formatClock", () => {
	it("formate l'heure locale sur 24h", () => {
		const t = Date.UTC(2024, 0, 1, 13, 5); // 14:05 Paris
		expect(formatClock(t, "Europe/Paris")).toBe("14:05");
	});
});
