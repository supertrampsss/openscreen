/**
 * Client SQLite — ouverture WAL + instance drizzle (§9, §2 loi 2).
 *
 * WAL = écritures concurrentes fiables, moins de corruption sur kill mid-saisie.
 *
 * WEB (§10, maillon risqué) : le driver expo-sqlite exécute les requêtes SYNChrones
 * via un worker WebAssembly. Le TOUT PREMIER appel sync (y compris `openDatabaseSync`
 * lui-même) court-circuite l'init du worker (busy-wait borné → « Sync operation
 * timeout ») et fait planter l'app dès l'import. Parades :
 *   1. `db` est construit PARESSEUSEMENT (Proxy) — aucun appel sync à l'import.
 *   2. Sur web, `warmupDb()` ouvre la connexion via l'API ASYNC : cela initialise
 *      worker + WASM + OPFS. On réutilise ENSUITE ce MÊME handle pour les appels
 *      sync (worker chaud → plus de timeout). Une SEULE connexion OPFS existe donc
 *      (deux connexions concurrentes au même fichier OPFS corrompent les lectures).
 * Sur natif, `openDatabaseSync` + PRAGMAs restent synchrones (aucun worker).
 */

import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseAsync, openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import * as schema from "./schema";

export const DATABASE_NAME = "crohnicle.db";

const isWeb = Platform.OS === "web";

let sqliteHandle: SQLiteDatabase | null = null;

/**
 * Retourne la connexion sync. Sur natif, l'ouvre paresseusement. Sur web, la
 * connexion DOIT avoir été ouverte par `warmupDb` (sinon on lèverait un timeout) —
 * on lève une erreur explicite si ce n'est pas le cas (bug de séquencement).
 */
function getSqlite(): SQLiteDatabase {
	if (!sqliteHandle) {
		if (isWeb) {
			throw new Error("SQLite web utilisé avant warmupDb() — préchauffage requis.");
		}
		sqliteHandle = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
		sqliteHandle.execSync("PRAGMA journal_mode = WAL;");
		sqliteHandle.execSync("PRAGMA foreign_keys = ON;");
	}
	return sqliteHandle;
}

function makeDb() {
	return drizzle(getSqlite(), { schema });
}

export type DB = ReturnType<typeof makeDb>;

let dbInstance: DB | null = null;

function getDb(): DB {
	if (!dbInstance) dbInstance = makeDb();
	return dbInstance;
}

/**
 * Instance drizzle PARESSEUSE : la vraie connexion n'est créée qu'au premier
 * accès (post-warmup sur web). Le Proxy relaie proprement méthodes et propriétés.
 */
export const db: DB = new Proxy({} as DB, {
	get(_target, prop) {
		const real = getDb() as unknown as Record<string | symbol, unknown>;
		const value = real[prop];
		return typeof value === "function" ? value.bind(real) : value;
	},
});

let warming: Promise<void> | null = null;

/**
 * Préchauffe la couche SQLite. No-op sur natif. Sur web : ouvre la connexion via
 * l'API ASYNC (init worker + WASM + OPFS) et applique les PRAGMAs ; ce handle est
 * réutilisé pour tous les appels sync ultérieurs. À appeler AVANT tout accès à `db`.
 */
export function warmupDb(): Promise<void> {
	if (!isWeb) return Promise.resolve();
	if (!warming) {
		warming = (async () => {
			const handle = await openDatabaseAsync(DATABASE_NAME, { enableChangeListener: true });
			await handle.execAsync("PRAGMA journal_mode = WAL;");
			await handle.execAsync("PRAGMA foreign_keys = ON;");
			sqliteHandle = handle;
		})();
	}
	return warming;
}
