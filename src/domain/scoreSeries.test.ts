import { describe, expect, it } from "vitest";
import {
	dailyScoreSeries,
	groupEntriesByDate,
	type ScoreDayEntry,
	scoreKindForDiagnosis,
} from "./scoreSeries";

const entry = (localDate: string, over: Partial<ScoreDayEntry> = {}): ScoreDayEntry => ({
	localDate,
	occurredAt: 1_700_000_000_000,
	tz: "Europe/Paris",
	...over,
});

describe("scoreKindForDiagnosis", () => {
	it("RCH → SCCAI, tout le reste → HBI par défaut", () => {
		expect(scoreKindForDiagnosis("uc")).toBe("sccai");
		expect(scoreKindForDiagnosis("crohn")).toBe("hbi");
		expect(scoreKindForDiagnosis("ibd_u")).toBe("hbi");
		expect(scoreKindForDiagnosis("undiagnosed")).toBe("hbi");
		expect(scoreKindForDiagnosis(null)).toBe("hbi");
	});
});

describe("dailyScoreSeries", () => {
	const dates = ["2024-01-01", "2024-01-02", "2024-01-03"];

	it("jour sans entrée → null (trou), pas de zéro", () => {
		const byDate = groupEntriesByDate([
			entry("2024-01-01", { wellbeing: 1, pain: 1, bristol: 6 }),
			// 2024-01-02 : rien
			entry("2024-01-03", { wellbeing: 2, pain: 0, bristol: 7 }),
		]);
		const series = dailyScoreSeries(dates, byDate, new Map(), "hbi");
		expect(series[1]).toBeNull();
		expect(series[0]).not.toBeNull();
		expect(series[2]).not.toBeNull();
	});

	it("HBI : jour avec donnée subjective incomplète → null", () => {
		const byDate = groupEntriesByDate([entry("2024-01-01", { bristol: 6 })]); // pas de wellbeing/pain
		const series = dailyScoreSeries(["2024-01-01"], byDate, new Map(), "hbi");
		expect(series[0]).toBeNull();
	});

	it("HBI : score = wellbeing + pain + selles liquides + complications", () => {
		const byDate = groupEntriesByDate([
			entry("2024-01-01", { wellbeing: 2, pain: 1, bristol: 6 }),
			entry("2024-01-01", { bristol: 7 }),
		]);
		const extras = new Map([["2024-01-01", { complications: ["arthralgia"] }]]);
		const series = dailyScoreSeries(["2024-01-01"], byDate, extras, "hbi");
		expect(series[0]).toBe(2 + 1 + 2 + 1); // 2 selles liquides (6 et 7), 1 complication
	});
});
