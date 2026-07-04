import { describe, expect, it } from "vitest";
import {
	BACKUP_TABLES,
	BACKUP_VERSION,
	BackupError,
	type BackupTables,
	backupFileName,
	buildBackup,
	parseBackup,
	serializeBackup,
} from "./backup";

function sampleTables(): BackupTables {
	const t = {} as BackupTables;
	for (const name of BACKUP_TABLES) t[name] = [];
	t.symptom_entries = [{ id: "e1", kind: "stool", bristol: 6 }];
	t.settings = [{ key: "theme", value: "dark" }];
	return t;
}

describe("backup — round-trip sérialisation/désérialisation", () => {
	it("serialize → parse restitue les tables et la version", () => {
		const tables = sampleTables();
		const json = serializeBackup(tables, 1_700_000_000_000);
		const parsed = parseBackup(json);
		expect(parsed.version).toBe(BACKUP_VERSION);
		expect(parsed.exported_at).toBe(1_700_000_000_000);
		expect(parsed.tables.symptom_entries).toEqual(tables.symptom_entries);
		expect(parsed.tables.settings).toEqual(tables.settings);
	});

	it("buildBackup normalise toutes les tables (défaut []), toutes présentes", () => {
		const b = buildBackup({} as BackupTables);
		for (const name of BACKUP_TABLES) {
			expect(Array.isArray(b.tables[name])).toBe(true);
		}
	});
});

describe("backup — rejets de validation", () => {
	it("version inconnue → BackupError", () => {
		const json = JSON.stringify({ version: 999, tables: {} });
		expect(() => parseBackup(json)).toThrow(BackupError);
	});
	it("JSON illisible → BackupError", () => {
		expect(() => parseBackup("{pas du json")).toThrow(BackupError);
	});
	it("table corrompue (non-tableau) → BackupError", () => {
		const json = JSON.stringify({ version: BACKUP_VERSION, tables: { settings: 42 } });
		expect(() => parseBackup(json)).toThrow(BackupError);
	});
	it("tables absentes → toléré, normalisé à []", () => {
		const json = JSON.stringify({ version: BACKUP_VERSION, tables: {} });
		expect(parseBackup(json).tables.symptom_entries).toEqual([]);
	});
});

describe("backupFileName", () => {
	it("nom horodaté stable", () => {
		expect(backupFileName(Date.UTC(2024, 0, 2, 3, 4, 5))).toBe(
			"crohnicle-backup-2024-01-02-03-04-05.json",
		);
	});
});
