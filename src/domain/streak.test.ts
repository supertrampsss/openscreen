import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, computeStreak, isoWeekKey } from "./streak";

/** Génère la liste des N jours se terminant à `end` inclus (ordre chrono). */
function daysEndingAt(end: string, n: number): string[] {
	const out: string[] = [];
	for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
	return out;
}

const TODAY = "2024-03-20"; // un mercredi

describe("isoWeekKey", () => {
	it("regroupe les jours d'une même semaine ISO (lundi→dimanche)", () => {
		// 2024-03-18 lundi … 2024-03-24 dimanche : même semaine ISO.
		const week = daysEndingAt("2024-03-24", 7).map(isoWeekKey);
		expect(new Set(week).size).toBe(1);
	});
	it("sépare deux semaines calendaires", () => {
		expect(isoWeekKey("2024-03-24")).not.toBe(isoWeekKey("2024-03-25")); // dim vs lun
	});
});

describe("computeStreak — cas de base", () => {
	it("aucune donnée → série 0", () => {
		expect(computeStreak({ today: TODAY, documentedDates: [] })).toEqual({
			current: 0,
			longest: 0,
			frozen: false,
			graceUsedThisWeek: false,
		});
	});

	it("N jours consécutifs documentés jusqu'à aujourd'hui → série N", () => {
		const docs = daysEndingAt(TODAY, 5);
		const r = computeStreak({ today: TODAY, documentedDates: docs });
		expect(r.current).toBe(5);
		expect(r.longest).toBe(5);
	});

	it("journée en cours non documentée ne casse pas la série d'hier", () => {
		const docs = daysEndingAt(addDays(TODAY, -1), 4); // avant-hier..hier, pas aujourd'hui
		const r = computeStreak({ today: TODAY, documentedDates: docs });
		expect(r.current).toBe(4);
	});
});

describe("computeStreak — grâce (1 par semaine calendaire)", () => {
	it("un trou d'un jour est pardonné par la grâce", () => {
		// hier + aujourd'hui documentés, avant-hier manquant (trou), avant documentés.
		const docs = [
			addDays(TODAY, -5),
			addDays(TODAY, -4),
			addDays(TODAY, -3),
			// -2 manquant (trou)
			addDays(TODAY, -1),
			TODAY,
		];
		const r = computeStreak({ today: TODAY, documentedDates: docs });
		expect(r.current).toBe(5); // le trou est ponté
	});

	it("deux trous la même semaine cassent la série (une seule grâce)", () => {
		// TODAY mercredi ; trous lundi(-2) et mardi(-1) même semaine ISO.
		const docs = [addDays(TODAY, -4), addDays(TODAY, -3), TODAY];
		const r = computeStreak({ today: TODAY, documentedDates: docs });
		// balayage arrière : today(+1), -1 trou (grâce), -2 trou (cassé) → current=1.
		expect(r.current).toBe(1);
	});
});

describe("computeStreak — gel poussée", () => {
	it("un jour de poussée non documenté ne casse jamais la série", () => {
		const docs = [addDays(TODAY, -3), addDays(TODAY, -2), TODAY];
		const r = computeStreak({
			today: TODAY,
			documentedDates: docs,
			frozenDates: [addDays(TODAY, -1)], // trou couvert par la poussée
		});
		expect(r.current).toBe(3);
	});

	it("un jour de poussée documenté prolonge la série (+1)", () => {
		const docs = [addDays(TODAY, -1), TODAY];
		const r = computeStreak({
			today: TODAY,
			documentedDates: docs,
			frozenDates: [addDays(TODAY, -1)],
		});
		expect(r.current).toBe(2);
	});

	it("aujourd'hui en poussée → frozen=true, série protégée", () => {
		const docs = [addDays(TODAY, -2), addDays(TODAY, -1)];
		const r = computeStreak({
			today: TODAY,
			documentedDates: docs,
			frozenDates: [TODAY],
		});
		expect(r.frozen).toBe(true);
		expect(r.current).toBe(2); // hier/avant-hier tiennent, poussée protège aujourd'hui
	});

	it("une longue poussée non documentée ne remet jamais la série à zéro", () => {
		const docs = daysEndingAt(addDays(TODAY, -10), 5); // série ancienne
		const frozen = daysEndingAt(TODAY, 10); // 10 jours de poussée jusqu'à aujourd'hui
		const r = computeStreak({ today: TODAY, documentedDates: docs, frozenDates: frozen });
		expect(r.current).toBe(5); // protégée, pas de reset
		expect(r.frozen).toBe(true);
	});
});

describe("computeStreak — propriétés (fast-check)", () => {
	const arbDate = fc.integer({ min: 0, max: 120 }).map((offset) => addDays("2024-06-15", -offset));
	const arbDates = fc.array(arbDate, { maxLength: 60 });

	it("la série n'est jamais négative et current ≤ longest ≤ jours totaux", () => {
		fc.assert(
			fc.property(arbDates, arbDates, (documentedDates, frozenDates) => {
				const r = computeStreak({ today: "2024-06-15", documentedDates, frozenDates });
				expect(r.current).toBeGreaterThanOrEqual(0);
				expect(r.longest).toBeGreaterThanOrEqual(r.current);
				const totalDays = new Set([...documentedDates, ...frozenDates]).size + 1;
				expect(r.longest).toBeLessThanOrEqual(totalDays);
			}),
		);
	});

	it("geler un jour supplémentaire ne DIMINUE jamais la série (gel ⇒ jamais de reset)", () => {
		fc.assert(
			fc.property(arbDates, arbDate, (documentedDates, extraFrozen) => {
				const base = computeStreak({ today: "2024-06-15", documentedDates, frozenDates: [] });
				const withFreeze = computeStreak({
					today: "2024-06-15",
					documentedDates,
					frozenDates: [extraFrozen],
				});
				expect(withFreeze.current).toBeGreaterThanOrEqual(base.current);
			}),
		);
	});

	it("tout documenté sans trou → current = longest = longueur de l'intervalle", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 40 }), (n) => {
				const docs = daysEndingAt("2024-06-15", n);
				const r = computeStreak({ today: "2024-06-15", documentedDates: docs });
				expect(r.current).toBe(n);
				expect(r.longest).toBe(n);
			}),
		);
	});
});
