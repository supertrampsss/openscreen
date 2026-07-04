/**
 * Client SQLite — ouverture WAL + instance drizzle (§9, §2 loi 2).
 *
 * WAL = écritures concurrentes fiables, moins de corruption sur kill mid-saisie.
 */

import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";
import * as schema from "./schema";

export const DATABASE_NAME = "crohnicle.db";

/** Connexion native. `enableChangeListener` alimente useLiveQuery. */
export const sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

// Journalisation WAL dès l'ouverture.
sqlite.execSync("PRAGMA journal_mode = WAL;");
sqlite.execSync("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });

export type DB = typeof db;
