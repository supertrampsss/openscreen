import { describe, expect, it } from "vitest";
import {
	addDaysToLocalDate,
	adherenceForTreatment,
	aggregateAdherence,
	computeNextDue,
	daysBetweenLocalDates,
	expectedDoses,
	isDueSoon,
	isDueToday,
	treatmentReminderDates,
} from "./treatments";

describe("addDaysToLocalDate", () => {
	it("ajoute des jours en franchissant les mois/années (UTC)", () => {
		expect(addDaysToLocalDate("2026-01-30", 5)).toBe("2026-02-04");
		expect(addDaysToLocalDate("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDaysToLocalDate("2026-03-01", -1)).toBe("2026-02-28");
	});
	it("gère l'année bissextile", () => {
		expect(addDaysToLocalDate("2024-02-28", 1)).toBe("2024-02-29");
	});
});

describe("computeNextDue", () => {
	it("décale de cadence×7 jours", () => {
		expect(computeNextDue("2026-06-01", 2)).toBe("2026-06-15");
		expect(computeNextDue("2026-06-01", 8)).toBe("2026-07-27");
	});
	it("renvoie null sans cadence", () => {
		expect(computeNextDue("2026-06-01", null)).toBeNull();
		expect(computeNextDue("2026-06-01", 0)).toBeNull();
	});
});

describe("daysBetween / due helpers", () => {
	it("compte les jours entre deux dates", () => {
		expect(daysBetweenLocalDates("2026-06-01", "2026-06-15")).toBe(14);
		expect(daysBetweenLocalDates("2026-06-15", "2026-06-13")).toBe(-2);
	});
	it("isDueSoon vrai à J-2, faux à J-3 ou déjà passé au-delà", () => {
		expect(isDueSoon("2026-06-15", "2026-06-13")).toBe(true);
		expect(isDueSoon("2026-06-15", "2026-06-15")).toBe(true);
		expect(isDueSoon("2026-06-15", "2026-06-12")).toBe(false);
		expect(isDueSoon("2026-06-15", "2026-06-16")).toBe(false);
	});
	it("isDueToday vrai le jour même et après", () => {
		expect(isDueToday("2026-06-15", "2026-06-15")).toBe(true);
		expect(isDueToday("2026-06-15", "2026-06-16")).toBe(true);
		expect(isDueToday("2026-06-15", "2026-06-14")).toBe(false);
	});
});

describe("observance", () => {
	it("attendus = round(periode / cycle), borné à ≥1", () => {
		expect(expectedDoses(90, 2)).toBe(6); // 90/14 ≈ 6.4
		expect(expectedDoses(90, 8)).toBe(2); // 90/56 ≈ 1.6
		expect(expectedDoses(10, 8)).toBe(1); // borne minimale
		expect(expectedDoses(90, null)).toBe(0);
	});
	it("adherenceForTreatment borne le ratio à 1 et gère l'absence de cadence", () => {
		expect(adherenceForTreatment(2, 6, 90)).toEqual({ taken: 6, expected: 6, rate: 1 });
		expect(adherenceForTreatment(2, 3, 90)).toEqual({ taken: 3, expected: 6, rate: 0.5 });
		expect(adherenceForTreatment(2, 99, 90)?.rate).toBe(1);
		expect(adherenceForTreatment(null, 3, 90)).toBeNull();
	});
	it("aggregateAdherence somme prises et attendus des traitements à cadence", () => {
		expect(
			aggregateAdherence(
				[
					{ cadenceWeeks: 2, takenCount: 5 },
					{ cadenceWeeks: 8, takenCount: 2 },
					{ cadenceWeeks: null, takenCount: 10 },
				],
				90,
			),
		).toEqual({ taken: 7, expected: 8 });
	});
	it("aggregateAdherence null si aucun traitement à cadence", () => {
		expect(aggregateAdherence([{ cadenceWeeks: null, takenCount: 3 }], 90)).toBeNull();
	});
});

describe("treatmentReminderDates", () => {
	it("renvoie J-1 et J-0 à 9 h, uniquement dans le futur", () => {
		const now = new Date(2026, 5, 1, 12, 0, 0); // 1 juin midi
		const dates = treatmentReminderDates("2026-06-15", now);
		expect(dates).toHaveLength(2);
		expect(dates[0].getHours()).toBe(9);
		expect(dates[0].getDate()).toBe(14);
		expect(dates[1].getDate()).toBe(15);
	});
	it("omet les occurrences passées", () => {
		const now = new Date(2026, 5, 14, 12, 0, 0); // J-1 déjà passé (9 h < midi)
		const dates = treatmentReminderDates("2026-06-15", now);
		expect(dates).toHaveLength(1);
		expect(dates[0].getDate()).toBe(15);
	});
});
