import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { adherenceForTreatment, computeNextDue } from "@/domain/treatments";

/**
 * Tests d'intégration des traitements (§5.9) sur better-sqlite3 (même moteur que
 * expo-sqlite), en rejouant les migrations commitées. On valide que le SCHÉMA
 * migré (colonnes `next_due`, `tz`) + la logique pure de `treatmentRepo`
 * (recalcul d'échéance à la prise, observance) produisent le comportement attendu.
 *
 * Le repo lui-même s'exécute sur le driver expo (indisponible sous Node) : on
 * reproduit ici ses instructions SQL exactes, la logique métier venant du domaine
 * pur partagé avec le repo.
 */

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

function applyMigrations(db: Database.Database): void {
	const files = readdirSync(drizzleDir)
		.filter((f) => f.endsWith(".sql"))
		.sort();
	for (const file of files) {
		for (const stmt of readFileSync(join(drizzleDir, file), "utf8").split(
			"--> statement-breakpoint",
		)) {
			const t = stmt.trim();
			if (t) db.exec(t);
		}
	}
}

describe("treatments — schéma migré + logique de prise/observance", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = new Database(":memory:");
		db.pragma("foreign_keys = ON");
		applyMigrations(db);
	});

	function createTreatment(cadence: number | null, nextDue: string | null): string {
		const id = `t-${cadence}`;
		db.prepare(
			`INSERT INTO treatments (id, name, kind, cadence_weeks, next_due, is_active, created_at, updated_at)
			 VALUES (?, 'Adalimumab', 'biologic_injection', ?, ?, 1, 0, 0)`,
		).run(id, cadence, nextDue);
		return id;
	}

	/** Reproduit `treatmentRepo.markTaken` : event `taken` + recalcul next_due. */
	function markTaken(id: string, localDate: string, cadence: number | null): string | null {
		db.prepare(
			`INSERT INTO treatment_events (id, treatment_id, occurred_at, tz, local_date, kind, created_at)
			 VALUES (?, ?, ?, 'Europe/Paris', ?, 'taken', 0)`,
		).run(`e-${localDate}`, id, 0, localDate);
		const nextDue = computeNextDue(localDate, cadence);
		db.prepare("UPDATE treatments SET next_due = ? WHERE id = ?").run(nextDue, id);
		return nextDue;
	}

	it("markTaken recalcule next_due = jour de la prise + cadence×7", () => {
		const id = createTreatment(2, "2026-06-01");
		const nextDue = markTaken(id, "2026-06-03", 2);
		expect(nextDue).toBe("2026-06-17");
		const row = db.prepare("SELECT next_due FROM treatments WHERE id = ?").get(id) as {
			next_due: string;
		};
		expect(row.next_due).toBe("2026-06-17");
		// L'event porte bien tz + local_date (colonnes ajoutées par la migration 0001).
		const ev = db
			.prepare("SELECT tz, local_date, kind FROM treatment_events WHERE treatment_id = ?")
			.get(id);
		expect(ev).toEqual({ tz: "Europe/Paris", local_date: "2026-06-03", kind: "taken" });
	});

	it("un traitement sans cadence remet next_due à null après prise", () => {
		const id = createTreatment(null, null);
		const nextDue = markTaken(id, "2026-06-03", null);
		expect(nextDue).toBeNull();
	});

	it("adherence = prises taken sur la période / attendus (borné à 1)", () => {
		const id = createTreatment(2, "2026-06-01");
		// 3 prises taken (+ 1 side_effect qui ne doit PAS compter).
		for (const d of ["2026-04-10", "2026-04-24", "2026-05-08"]) markTaken(id, d, 2);
		db.prepare(
			`INSERT INTO treatment_events (id, treatment_id, occurred_at, tz, local_date, kind, created_at)
			 VALUES ('se1', ?, 0, 'Europe/Paris', '2026-05-01', 'side_effect', 0)`,
		).run(id);

		const taken = (
			db
				.prepare(
					"SELECT COUNT(*) AS n FROM treatment_events WHERE treatment_id = ? AND kind = 'taken'",
				)
				.get(id) as { n: number }
		).n;
		expect(taken).toBe(3);

		const adherence = adherenceForTreatment(2, taken, 90);
		// 90 j / (2 sem = 14 j) ≈ 6 attendus → 3/6 = 0.5.
		expect(adherence).toEqual({ taken: 3, expected: 6, rate: 0.5 });
	});
});
