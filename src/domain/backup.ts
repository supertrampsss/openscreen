/**
 * Backup / restore — module PUR (zéro import RN), testable sous Node (§9, §5.11).
 *
 * Sérialise / désérialise toutes les tables en JSON versionné. Aucune I/O ici :
 * `backupService` fournit les lignes et écrit le résultat. La séparation garantit
 * un format stable et testable, condition du « zéro perte de données » (§2 loi 2).
 */

export const BACKUP_VERSION = 1 as const;

/** Tables incluses dans un backup, dans l'ordre d'import (FK-safe). */
export const BACKUP_TABLES = [
	"profile",
	"foods",
	"symptom_entries",
	"meals",
	"meal_items",
	"treatments",
	"treatment_events",
	"daily_extras",
	"insights_cache",
	"settings",
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

export type BackupTables = Record<BackupTableName, unknown[]>;

export interface BackupV1 {
	version: typeof BACKUP_VERSION;
	exported_at: number;
	tables: BackupTables;
}

/** Construit l'objet backup versionné à partir des lignes de chaque table. */
export function buildBackup(tables: BackupTables, exportedAt: number = Date.now()): BackupV1 {
	const normalized = {} as BackupTables;
	for (const name of BACKUP_TABLES) {
		normalized[name] = tables[name] ?? [];
	}
	return {
		version: BACKUP_VERSION,
		exported_at: exportedAt,
		tables: normalized,
	};
}

/** Sérialise en JSON indenté (fichier lisible). */
export function serializeBackup(tables: BackupTables, exportedAt?: number): string {
	return JSON.stringify(buildBackup(tables, exportedAt), null, 2);
}

/** Erreur de validation de backup (version inconnue, format invalide). */
export class BackupError extends Error {}

/**
 * Parse + valide un JSON de backup. Lève `BackupError` si la version ne
 * correspond pas ou si la structure est invalide (aucune donnée n'est touchée
 * avant validation complète — §2 loi 2).
 */
export function parseBackup(json: string): BackupV1 {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		throw new BackupError("Fichier illisible : ce n'est pas un backup valide.");
	}

	if (typeof raw !== "object" || raw === null) {
		throw new BackupError("Format de backup non reconnu.");
	}
	const obj = raw as Record<string, unknown>;

	if (obj.version !== BACKUP_VERSION) {
		throw new BackupError(
			`Version de backup incompatible (attendu ${BACKUP_VERSION}, reçu ${String(obj.version)}).`,
		);
	}
	if (typeof obj.tables !== "object" || obj.tables === null) {
		throw new BackupError("Backup sans données de tables.");
	}

	const inputTables = obj.tables as Record<string, unknown>;
	const tables = {} as BackupTables;
	for (const name of BACKUP_TABLES) {
		const value = inputTables[name];
		if (value !== undefined && !Array.isArray(value)) {
			throw new BackupError(`Table « ${name} » corrompue dans le backup.`);
		}
		tables[name] = (value as unknown[] | undefined) ?? [];
	}

	return {
		version: BACKUP_VERSION,
		exported_at: typeof obj.exported_at === "number" ? obj.exported_at : 0,
		tables,
	};
}

/** Nom de fichier de backup horodaté. */
export function backupFileName(exportedAt: number = Date.now()): string {
	const iso = new Date(exportedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-");
	return `crohnicle-backup-${iso}.json`;
}
