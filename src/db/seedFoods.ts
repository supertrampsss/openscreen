/**
 * Seed d'aliments français (§5.5) — insertion idempotente & versionnée.
 *
 * SOURCE & LIMITE (honnêteté, §5.4) : la liste `foods.seed.json` (~380 aliments
 * courants en France) et ses drapeaux déclencheurs sont dérivés de connaissances
 * FODMAP publiques (classification Monash University) et du bon sens nutritionnel.
 * C'est un point de départ INDICATIF, PAS un avis médical : en cas de doute, la
 * valeur la plus neutre a été retenue (FODMAP « medium » = incertitude assumée).
 * Chaque patient corrige/complète via ses propres aliments custom.
 *
 * IDEMPOTENCE : `INSERT ... ON CONFLICT(name_normalized) DO NOTHING` — rejouer le
 * seed ne crée jamais de doublon et n'écrase JAMAIS un aliment custom de même nom.
 * VERSIONNAGE : la clé settings `foods_seed_version` permet d'ENRICHIR le seed
 * plus tard (nouveaux aliments) sans réinsérer ceux déjà présents ni toucher aux
 * customs. On ré-exécute l'insert (no-op sur l'existant) quand la version monte.
 */

import seedData from "@/data/foods.seed.json";
import { db } from "@/db/client";
import { newId } from "@/db/id";
import { foods } from "@/db/schema";
import { type FoodTriggers, normalizeFoodName } from "@/domain/foods";
import * as settingsRepo from "@/repositories/settingsRepo";

/** Clé settings du numéro de version du seed appliqué. */
export const FOODS_SEED_VERSION_KEY = "foods_seed_version";

/**
 * Version courante du seed. À INCRÉMENTER quand on enrichit `foods.seed.json`
 * (ajout d'aliments) pour déclencher une ré-insertion idempotente au démarrage.
 */
export const FOODS_SEED_VERSION = 1;

/** Forme d'un item du fichier seed. */
export interface FoodSeedItem {
	name_normalized: string;
	display_fr: string;
	triggers: FoodTriggers;
}

/** Le seed typé (JSON importé). */
export const foodSeed = seedData as FoodSeedItem[];

/**
 * Applique le seed si nécessaire (version stockée < version courante).
 * Insertion idempotente aliment par aliment ; les customs sont préservés.
 * Renvoie le nombre d'aliments effectivement insérés (0 si déjà à jour).
 */
export async function seedFoods(): Promise<number> {
	const stored = (await settingsRepo.get<number>(FOODS_SEED_VERSION_KEY)) ?? 0;
	if (stored >= FOODS_SEED_VERSION) return 0;

	let inserted = 0;
	for (const item of foodSeed) {
		const rows = await db
			.insert(foods)
			.values({
				id: newId(),
				// Re-normalise par sécurité (garantit l'invariant même si le JSON dérive).
				nameNormalized: normalizeFoodName(item.name_normalized),
				displayFr: item.display_fr,
				triggers: item.triggers as unknown as Record<string, unknown>,
				isCustom: 0,
			})
			.onConflictDoNothing({ target: foods.nameNormalized })
			.returning({ id: foods.id });
		inserted += rows.length;
	}

	await settingsRepo.set(FOODS_SEED_VERSION_KEY, FOODS_SEED_VERSION);
	return inserted;
}
