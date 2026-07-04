import { describe, expect, it } from "vitest";
import {
	buildReport,
	type ReportDayExtra,
	type ReportEntry,
	type ReportInput,
} from "./exportReport";

/** Instant epoch (ms) pour une date locale UTC à une heure donnée. */
function at(date: string, hour: number): number {
	return Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
}

function stool(date: string, hour: number, extra: Partial<ReportEntry> = {}): ReportEntry {
	return {
		localDate: date,
		occurredAt: at(date, hour),
		tz: "UTC",
		kind: "stool",
		bristol: 6,
		...extra,
	};
}

function symptom(date: string, extra: Partial<ReportEntry> = {}): ReportEntry {
	return {
		localDate: date,
		occurredAt: at(date, 20),
		tz: "UTC",
		kind: "symptom",
		wellbeing: 1,
		pain: 1,
		...extra,
	};
}

function baseInput(
	entries: ReportEntry[],
	extras: Map<string, ReportDayExtra> = new Map(),
): ReportInput {
	return {
		periodDays: 30,
		fromDate: "2026-06-01",
		toDate: "2026-06-30",
		profile: { diagnosis: "crohn", diagnosisYear: 2019 },
		entries,
		extrasByDate: extras,
	};
}

describe("buildReport — structure & période", () => {
	it("HBI par défaut, période reportée, associations non prêtes", () => {
		const report = buildReport(baseInput([symptom("2026-06-10")]));
		expect(report.scoreKind).toBe("hbi");
		expect(report.period).toEqual({ days: 30, from: "2026-06-01", to: "2026-06-30" });
		expect(report.scoreDates).toHaveLength(30);
		expect(report.associations.ready).toBe(false);
		expect(report.observance).toBeNull();
	});

	it("top associations fournies → items reportés et ready true", () => {
		const report = buildReport({
			...baseInput([symptom("2026-06-10")]),
			topAssociations: [{ displayName: "Lactose", signal: "bristol", n: 11 }],
		});
		expect(report.associations.ready).toBe(true);
		expect(report.associations.items).toHaveLength(1);
		expect(report.associations.items[0]).toEqual({
			displayName: "Lactose",
			signal: "bristol",
			n: 11,
		});
	});

	it("SCCAI pour la RCH", () => {
		const report = buildReport({
			...baseInput([symptom("2026-06-10")]),
			profile: { diagnosis: "uc", diagnosisYear: null },
		});
		expect(report.scoreKind).toBe("sccai");
	});

	it("observance agrégée sur les traitements à cadence (§5.9)", () => {
		const report = buildReport({
			...baseInput([symptom("2026-06-10")]),
			// période 30 j : cadence 2 sem → ~2 attendus ; sans cadence → ignoré.
			treatments: [
				{ cadenceWeeks: 2, takenCount: 1 },
				{ cadenceWeeks: null, takenCount: 5 },
			],
		});
		expect(report.observance).toEqual({ taken: 1, expected: 2 });
	});
});

describe("buildReport — identité optionnelle", () => {
	it("omet l'identité si absente", () => {
		const report = buildReport(baseInput([symptom("2026-06-10")]));
		expect(report.profile.identity).toBeNull();
	});
	it("conserve l'identité fournie (trim)", () => {
		const report = buildReport({
			...baseInput([symptom("2026-06-10")]),
			identity: "  Jean Test  ",
		});
		expect(report.profile.identity).toBe("Jean Test");
	});
	it("ignore une identité vide", () => {
		const report = buildReport({ ...baseInput([symptom("2026-06-10")]), identity: "   " });
		expect(report.profile.identity).toBeNull();
	});
});

describe("buildReport — tableaux hebdomadaires", () => {
	it("agrège selles/sang/douleur par semaine ISO, seulement les semaines documentées", () => {
		const entries: ReportEntry[] = [
			stool("2026-06-01", 8),
			stool("2026-06-01", 12),
			symptom("2026-06-01", { pain: 2, blood: 2 }),
			stool("2026-06-08", 9),
			symptom("2026-06-08", { pain: 1 }),
		];
		const report = buildReport(baseInput(entries));
		// Deux semaines documentées (W23, W24).
		expect(report.weekly).toHaveLength(2);
		const w1 = report.weekly[0];
		expect(w1.stools).toBe(2);
		expect(w1.bloodDays).toBe(1);
		expect(w1.worstPain).toBe(2);
		expect(w1.weekNumber).toBeGreaterThan(0);
	});

	it("reporte le dernier poids noté de la semaine", () => {
		const extras = new Map<string, ReportDayExtra>([["2026-06-03", { weightKg: 62.5 }]]);
		const report = buildReport(baseInput([symptom("2026-06-03")], extras));
		expect(report.weekly[0].weightKg).toBe(62.5);
	});
});

describe("buildReport — points à consulter", () => {
	it("compte les selles nocturnes (23h-6h) → point nocturne", () => {
		const entries: ReportEntry[] = [
			stool("2026-06-05", 2),
			stool("2026-06-06", 3),
			stool("2026-06-07", 23),
			symptom("2026-06-05"),
		];
		const report = buildReport(baseInput(entries));
		const nocturnal = report.consultPoints.find((p) => p.kind === "nocturnalStools");
		expect(nocturnal?.data.count).toBe(3);
	});

	it("sang visible ≥ 3 jours → point sang avec N sur M", () => {
		const entries: ReportEntry[] = [
			symptom("2026-06-05", { blood: 2 }),
			symptom("2026-06-06", { blood: 2 }),
			symptom("2026-06-07", { blood: 2 }),
		];
		const report = buildReport(baseInput(entries));
		const blood = report.consultPoints.find((p) => p.kind === "visibleBlood");
		expect(blood?.data.days).toBe(3);
		expect(blood?.data.total).toBe(3);
	});

	it("rien de notable → repli allClear", () => {
		const report = buildReport(baseInput([symptom("2026-06-10")]));
		expect(report.consultPoints).toEqual([{ kind: "allClear", data: {} }]);
	});
});
