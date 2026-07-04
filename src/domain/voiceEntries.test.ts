import { describe, expect, it } from "vitest";
import { entryTimestampAt, localHourInTz } from "./dates";
import { coerce0to3, timeOfDayToTimestamp, voiceEntriesToDrafts } from "./voiceEntries";

/**
 * Tests PURS du mapping voix → brouillons (§6.1, §7) : conversion de douleur /3,
 * `timeOfDay` → `occurred_at`, et rejet des entrées vides.
 */

// Un instant fixe, en fuseau fixe, à midi local → base déterministe.
const BASE = entryTimestampAt(Date.parse("2026-03-15T12:00:00Z"), "Europe/Paris");

describe("coerce0to3 (règle douleur /3)", () => {
	it("garde une valeur déjà sur 0-3", () => {
		expect(coerce0to3(0)).toBe(0);
		expect(coerce0to3(2)).toBe(2);
		expect(coerce0to3(3)).toBe(3);
	});

	it("convertit une valeur patient 0-10 par /3 arrondie", () => {
		expect(coerce0to3(6)).toBe(2); // 6/10 → 2
		expect(coerce0to3(4)).toBe(1);
		expect(coerce0to3(8)).toBe(3);
		expect(coerce0to3(10)).toBe(3); // clampé
	});

	it("renvoie null pour absent / NaN", () => {
		expect(coerce0to3(undefined)).toBeNull();
		expect(coerce0to3(null)).toBeNull();
		expect(coerce0to3(Number.NaN)).toBeNull();
	});
});

describe("timeOfDayToTimestamp", () => {
	it("place « morning » vers 8 h locales aujourd'hui", () => {
		const ts = timeOfDayToTimestamp("morning", BASE);
		expect(localHourInTz(ts.epochMs, ts.tz)).toBe(8);
		expect(ts.localDate).toBe(BASE.localDate);
	});

	it("place « yesterday_evening » la veille au soir", () => {
		const ts = timeOfDayToTimestamp("yesterday_evening", BASE);
		expect(localHourInTz(ts.epochMs, ts.tz)).toBe(20);
		expect(ts.localDate < BASE.localDate).toBe(true);
	});

	it("laisse l'horodatage de base si non spécifié", () => {
		expect(timeOfDayToTimestamp("unspecified", BASE)).toEqual(BASE);
		expect(timeOfDayToTimestamp(undefined, BASE)).toEqual(BASE);
	});
});

describe("voiceEntriesToDrafts", () => {
	it("mappe l'exemple canonique (3 selles + douleur + repas)", () => {
		const drafts = voiceEntriesToDrafts(
			[
				{ type: "stool", bristol: 6, count: 3, timeOfDay: "morning" },
				{ type: "symptom", pain: 2 },
				{ type: "meal", name: "raclette", timeOfDay: "yesterday_evening" },
			],
			BASE,
		);
		expect(drafts).toHaveLength(3);
		const stool = drafts[0] as Extract<(typeof drafts)[number], { type: "stool" }>;
		expect(stool).toMatchObject({ type: "stool", bristol: 6, count: 3 });
		expect(localHourInTz(stool.occurredAt.epochMs, stool.occurredAt.tz)).toBe(8);
		expect(drafts[1]).toMatchObject({ type: "symptom", pain: 2, fatigue: null });
		expect(drafts[2]).toMatchObject({ type: "meal", name: "raclette" });
	});

	it("écarte les entrées vides (symptôme sans signal, repas sans nom)", () => {
		const drafts = voiceEntriesToDrafts(
			[{ type: "symptom" }, { type: "meal", name: "   " }, { type: "symptom", fatigue: 3 }],
			BASE,
		);
		expect(drafts).toHaveLength(1);
		expect(drafts[0]).toMatchObject({ type: "symptom", fatigue: 3 });
	});

	it("borne bristol (hors 1-7 → null) et plafonne le compte", () => {
		const drafts = voiceEntriesToDrafts(
			[
				{ type: "stool", bristol: 99, count: 2 },
				{ type: "stool", bristol: 4, count: 999 },
			],
			BASE,
		);
		const first = drafts[0] as Extract<(typeof drafts)[number], { type: "stool" }>;
		const second = drafts[1] as Extract<(typeof drafts)[number], { type: "stool" }>;
		expect(first.bristol).toBeNull();
		expect(first.count).toBe(2);
		expect(second.count).toBe(20);
	});

	it("tolère une liste nulle", () => {
		expect(voiceEntriesToDrafts(null, BASE)).toEqual([]);
	});
});
