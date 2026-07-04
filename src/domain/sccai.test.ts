import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	isNightStool,
	localHourInTz,
	type SccaiInputs,
	sccai,
	sccaiBand,
	sccaiDayStoolScore,
	sccaiInputsFromEntries,
	sccaiNightStoolScore,
} from "./sccai";

const base: SccaiInputs = {
	dayStools: 0,
	nightStools: 0,
	urgency: 0,
	blood: 0,
	wellbeing: 0,
	extraIntestinalCount: 0,
};

describe("sccai — barèmes selles", () => {
	it("diurnes : 0-3→0, 4-6→1, 7-9→2, >9→3", () => {
		expect([0, 3, 4, 6, 7, 9, 10, 20].map(sccaiDayStoolScore)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
	});
	it("nocturnes : 0→0, 1-3→1, 4-6→2, >6→2", () => {
		expect([0, 1, 3, 4, 6, 9].map(sccaiNightStoolScore)).toEqual([0, 1, 1, 2, 2, 2]);
	});
});

describe("sccai — table de vérité", () => {
	const cases: [SccaiInputs, number, string][] = [
		[base, 0, "remission"],
		[{ ...base, dayStools: 3, urgency: 0, blood: 0, wellbeing: 1 }, 1, "remission"],
		[{ ...base, dayStools: 4, urgency: 1, blood: 1, wellbeing: 1 }, 4, "remission"],
		[{ ...base, dayStools: 4, urgency: 1, blood: 1, wellbeing: 2 }, 5, "moderate"],
		[
			{ dayStools: 7, nightStools: 2, urgency: 2, blood: 2, wellbeing: 2, extraIntestinalCount: 1 },
			10,
			"moderate",
		],
		[
			{
				dayStools: 10,
				nightStools: 4,
				urgency: 3,
				blood: 3,
				wellbeing: 4,
				extraIntestinalCount: 0,
			},
			15,
			"severe",
		],
	];
	for (const [input, score, band] of cases) {
		it(`score ${score} → ${band}`, () => {
			expect(sccai(input)).toEqual({ score, band });
		});
	}
});

describe("sccai — null si donnée subjective manquante", () => {
	it("dayStools/urgency/blood/wellbeing manquant → null", () => {
		expect(sccai({ ...base, dayStools: null })).toBeNull();
		expect(sccai({ ...base, urgency: null })).toBeNull();
		expect(sccai({ ...base, blood: null })).toBeNull();
		expect(sccai({ ...base, wellbeing: null })).toBeNull();
	});
	it("nightStools null toléré → compté 0", () => {
		expect(sccai({ ...base, nightStools: null })).toEqual({ score: 0, band: "remission" });
	});
});

describe("sccai — bandes aux bornes exactes", () => {
	it("4 → remission, 5 → moderate", () => {
		expect(sccaiBand(4)).toBe("remission");
		expect(sccaiBand(5)).toBe("moderate");
	});
	it("11 → moderate, 12 → severe", () => {
		expect(sccaiBand(11)).toBe("moderate");
		expect(sccaiBand(12)).toBe("severe");
	});
});

describe("sccai — propriétés (fast-check)", () => {
	const arbInputs = fc.record({
		dayStools: fc.nat({ max: 20 }),
		nightStools: fc.nat({ max: 8 }),
		urgency: fc.integer({ min: 0, max: 3 }),
		blood: fc.integer({ min: 0, max: 3 }),
		wellbeing: fc.integer({ min: 0, max: 4 }),
		extraIntestinalCount: fc.nat({ max: 6 }),
	});

	it("score ≥ 0 et band cohérente", () => {
		fc.assert(
			fc.property(arbInputs, (input) => {
				const r = sccai(input);
				expect(r).not.toBeNull();
				if (!r) return;
				expect(r.score).toBeGreaterThanOrEqual(0);
				expect(r.band).toBe(sccaiBand(r.score));
			}),
		);
	});

	it("monotonie non décroissante en chaque composant", () => {
		fc.assert(
			fc.property(arbInputs, (input) => {
				const s0 = sccai(input)?.score ?? 0;
				expect(
					sccai({ ...input, dayStools: input.dayStools + 1 })?.score ?? 0,
				).toBeGreaterThanOrEqual(s0);
				expect(
					sccai({ ...input, nightStools: input.nightStools + 1 })?.score ?? 0,
				).toBeGreaterThanOrEqual(s0);
				expect(
					sccai({ ...input, urgency: Math.min(3, input.urgency + 1) })?.score ?? 0,
				).toBeGreaterThanOrEqual(s0);
				expect(
					sccai({ ...input, extraIntestinalCount: input.extraIntestinalCount + 1 })?.score,
				).toBe(s0 + 1);
			}),
		);
	});
});

describe("sccai — classification jour/nuit selon tz de l'entrée", () => {
	it("localHourInTz respecte le fuseau", () => {
		// 2024-01-01T00:30:00Z = 01:30 à Paris (UTC+1), 19:30 la veille à New York.
		const t = Date.UTC(2024, 0, 1, 0, 30);
		expect(localHourInTz(t, "Europe/Paris")).toBe(1);
		expect(localHourInTz(t, "America/New_York")).toBe(19);
	});
	it("isNightStool : [23h,6h[ est nocturne", () => {
		const at23 = Date.UTC(2024, 0, 1, 22, 0); // 23h Paris
		const at5 = Date.UTC(2024, 0, 1, 4, 0); // 5h Paris
		const at12 = Date.UTC(2024, 0, 1, 11, 0); // 12h Paris
		expect(isNightStool(at23, "Europe/Paris")).toBe(true);
		expect(isNightStool(at5, "Europe/Paris")).toBe(true);
		expect(isNightStool(at12, "Europe/Paris")).toBe(false);
	});

	it("sccaiInputsFromEntries agrège worst-of-day + mapping sang 0-2", () => {
		const tz = "Europe/Paris";
		const inputs = sccaiInputsFromEntries(
			[
				{ kind: "stool", occurredAt: Date.UTC(2024, 0, 1, 11), bristol: 6, blood: 1 },
				{ kind: "stool", occurredAt: Date.UTC(2024, 0, 1, 14), bristol: 7, blood: 2 },
				{ kind: "stool", occurredAt: Date.UTC(2024, 0, 1, 3), bristol: 6 }, // 4h → nuit
				{
					kind: "symptom",
					occurredAt: Date.UTC(2024, 0, 1, 20),
					tz,
					urgency: 2,
					wellbeing: 3,
					extraIntestinal: ["arthralgia", "uveitis"],
				},
			].map((e) => ({ tz, ...e })),
			{ complications: ["uveitis", "aphthous_ulcers"] },
		);
		expect(inputs.dayStools).toBe(2);
		expect(inputs.nightStools).toBe(1);
		expect(inputs.urgency).toBe(2);
		expect(inputs.blood).toBe(2); // max(1,2) plafonné à 2, jamais 3
		expect(inputs.wellbeing).toBe(3);
		expect(inputs.extraIntestinalCount).toBe(3); // arthralgia, uveitis, aphthous_ulcers
	});
});
