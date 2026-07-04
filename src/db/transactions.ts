/**
 * Restauration transactionnelle multi-tables (§2 loi 2 — zéro perte de données).
 *
 * La logique « purge FK-safe → réinsertion tout-ou-rien » est factorisée derrière
 * un pilote abstrait (`RestoreDriver`) : le driver SQLite concret est injecté.
 *   - Production : drizzle/expo-sqlite (cf. `services/backupService`), transaction
 *     pilotée par des BEGIN/COMMIT/ROLLBACK SYNChrones sur le handle brut.
 *   - Test : better-sqlite3 (cf. `transactions.test.ts`), même moteur SQLite.
 *
 * Le bug historique (corrigé) : `db.transaction(async …)` sur le driver expo-sqlite
 * SYNChrone committe dès que le callback rend la main — c.-à-d. AVANT l'exécution
 * des écritures awaitées. Résultat : aucune transaction réelle, base laissée à
 * moitié écrite si l'import échoue en cours de route. Ce module rend la garantie
 * tout-ou-rien explicite et testable.
 */

import { BACKUP_TABLES, type BackupTableName, type BackupV1 } from "@/domain/backup";

/**
 * Pilote de restauration abstrait. `begin`/`commit`/`rollback` encadrent la
 * transaction ; `deleteAll`/`insertRows` effectuent les écritures. Toutes les
 * opérations DOIVENT être synchrones (pas de Promise) — sinon la transaction
 * committe avant leur exécution (le bug d'origine).
 */
export interface RestoreDriver {
	begin(): void;
	commit(): void;
	rollback(): void;
	deleteAll(table: BackupTableName): void;
	insertRows(table: BackupTableName, rows: unknown[]): void;
}

/**
 * Restaure toutes les tables d'un backup de façon ATOMIQUE :
 * BEGIN → purge en ordre FK-INVERSE → réinsertion en ordre FK-NORMAL → COMMIT.
 * Toute erreur (backup partiel/corrompu, violation de contrainte) déclenche un
 * ROLLBACK complet : la base n'est JAMAIS laissée à moitié écrite. Renvoie le
 * nombre de lignes réinsérées.
 */
export function restoreAllTables(driver: RestoreDriver, backup: BackupV1): number {
	driver.begin();
	try {
		// Purge enfants → parents (ordre inverse) pour respecter les FK.
		for (const name of [...BACKUP_TABLES].reverse()) {
			driver.deleteAll(name);
		}
		// Réinsertion parents → enfants (ordre normal).
		let rowCount = 0;
		for (const name of BACKUP_TABLES) {
			const rows = backup.tables[name];
			if (rows.length === 0) continue;
			driver.insertRows(name, rows);
			rowCount += rows.length;
		}
		driver.commit();
		return rowCount;
	} catch (error) {
		driver.rollback();
		throw error;
	}
}
