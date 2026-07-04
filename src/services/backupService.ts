/**
 * Service backup/restore (§5.11) — I/O autour du module pur `domain/backup`.
 *
 * Export : lit toutes les tables, écrit un fichier JSON, ouvre la share sheet.
 * Import : DocumentPicker → validation version → remplacement TRANSACTIONNEL
 * (tout ou rien : §2 loi 2, jamais de base à moitié écrasée).
 */

import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getDocumentAsync } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { db, getRawSqlite } from "@/db/client";
import {
	dailyExtras,
	foods,
	insightsCache,
	mealItems,
	meals,
	profile,
	settings,
	symptomEntries,
	treatmentEvents,
	treatments,
} from "@/db/schema";
import { type RestoreDriver, restoreAllTables } from "@/db/transactions";
import {
	BACKUP_TABLES,
	type BackupTableName,
	type BackupTables,
	backupFileName,
	parseBackup,
	serializeBackup,
} from "@/domain/backup";

/** Table drizzle par nom logique (ordre d'import = ordre FK-safe). */
const TABLE_MAP: Record<BackupTableName, SQLiteTable> = {
	profile,
	foods,
	symptom_entries: symptomEntries,
	meals,
	meal_items: mealItems,
	treatments,
	treatment_events: treatmentEvents,
	daily_extras: dailyExtras,
	insights_cache: insightsCache,
	settings,
};

/** Lit toutes les tables en mémoire. */
async function readAllTables(): Promise<BackupTables> {
	const tables = {} as BackupTables;
	for (const name of BACKUP_TABLES) {
		tables[name] = await db.select().from(TABLE_MAP[name]);
	}
	return tables;
}

export interface ExportResult {
	uri: string;
	fileName: string;
	shared: boolean;
}

/** Exporte : écrit le fichier dans le cache puis ouvre la share sheet. */
export async function exportBackup(): Promise<ExportResult> {
	const tables = await readAllTables();
	const exportedAt = Date.now();
	const json = serializeBackup(tables, exportedAt);
	const fileName = backupFileName(exportedAt);

	const file = new File(Paths.cache, fileName);
	if (file.exists) {
		file.delete();
	}
	file.create();
	file.write(json);

	let shared = false;
	if (await isAvailableAsync()) {
		await shareAsync(file.uri, {
			mimeType: "application/json",
			dialogTitle: "Exporter votre sauvegarde Crohnicle",
			UTI: "public.json",
		});
		shared = true;
	}

	return { uri: file.uri, fileName, shared };
}

export interface ImportResult {
	imported: boolean;
	rowCount: number;
}

/**
 * Importe : sélection du fichier, validation, remplacement transactionnel.
 * L'appelant DOIT avoir confirmé l'écrasement avant d'appeler cette fonction.
 */
export async function importBackup(): Promise<ImportResult> {
	const picked = await getDocumentAsync({
		type: "application/json",
		copyToCacheDirectory: true,
	});
	if (picked.canceled || picked.assets.length === 0) {
		return { imported: false, rowCount: 0 };
	}

	const asset = picked.assets[0];
	const json = await new File(asset.uri).text();
	const backup = parseBackup(json); // lève BackupError avant toute écriture.

	// Transaction SYNChrone pilotée sur le handle brut (BEGIN/COMMIT/ROLLBACK) :
	// les écritures drizzle `.run()` sont synchrones et partagent cette connexion.
	// Tout-ou-rien réel — jamais de `db.transaction(async …)`. Cf. db/transactions.
	const sqlite = getRawSqlite();
	const driver: RestoreDriver = {
		begin: () => sqlite.execSync("BEGIN"),
		commit: () => sqlite.execSync("COMMIT"),
		rollback: () => sqlite.execSync("ROLLBACK"),
		deleteAll: (name) => {
			db.delete(TABLE_MAP[name]).run();
		},
		insertRows: (name, rows) => {
			db.insert(TABLE_MAP[name])
				.values(rows as never)
				.run();
		},
	};
	const rowCount = restoreAllTables(driver, backup);

	return { imported: true, rowCount };
}
