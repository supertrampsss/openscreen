/**
 * Moteur de corrélations alimentaires (§5.7) — module PUR & DÉTERMINISTE.
 *
 * Objectif : repérer des ASSOCIATIONS OBSERVÉES (jamais des « causes » — loi 3 +
 * honnêteté scientifique) entre ce que le patient mange et ses symptômes, avec
 * des garde-fous stricts pour ne rien afficher de statistiquement fragile.
 *
 * MÉTHODE
 * - Unité d'analyse = BUCKET de demi-journée (00h–12h / 12h–24h en heure locale
 *   de l'entrée). Un bucket est « documenté » s'il contient au moins un repas ou
 *   un signal (on ne compte QUE les fenêtres réellement observées — pas de bucket
 *   vide fabriqué qui gonflerait artificiellement le lift).
 * - Un bucket est « exposé » à un aliment F (resp. à un attribut trigger) si F a
 *   été consommé dans la fenêtre 4–48 h AVANT le début du bucket (lag repas →
 *   symptôme). < 4 h ou > 48 h ⇒ non compté.
 * - Pour chaque (F, signal S) on remplit un tableau 2×2 (exposé/non × signal/non)
 *   sur l'ensemble des buckets documentés, puis :
 *     • lift = P(S | exposé) / P(S global)  (« combien de fois plus souvent »)
 *     • chi² 2×2 avec correction de Yates, comparé au seuil critique 3.841
 *       (valeur critique à 1 degré de liberté pour p = 0.05 — exact, sans dep).
 *
 * GARDE-FOUS (une association n'apparaît QUE si TOUT est vrai) :
 *   ≥ 14 jours distincts de données · ≥ 5 buckets exposés · ≥ 10 buckets non
 *   exposés · lift > 1.3 · chi² significatif (p < 0.05). Sinon rien.
 *
 * AGRÉGATION PAR ATTRIBUT : les 9 attributs (lactose, gluten, FODMAP haut…) sont
 * analysés de la même façon — souvent plus puissant (plus d'expositions) que par
 * aliment isolé.
 */

import { activeTriggerKeys, type FoodTriggers } from "./foods";

/** Valeur critique du chi² à 1 ddl pour p = 0.05 (khi-deux). */
export const CHI2_CRITICAL_P05 = 3.841458820694124;

const HOUR_MS = 3_600_000;

/** Un repas : quand il a eu lieu + ses aliments (avec leurs triggers). */
export interface CorrelationMeal {
	occurredAt: number;
	tz: string;
	items: { foodId: string; triggers: FoodTriggers }[];
}

/** Un signal déjà seuillé (pain≥2, bristol≥6, blood≥1, urgency≥2…). */
export interface CorrelationSignal {
	occurredAt: number;
	tz: string;
	/** Type de signal (ex. « pain », « bristol », « blood », « urgency »). */
	kind: string;
}

export interface CorrelationOptions {
	/** Noms lisibles des aliments (foodId → nom) pour l'affichage. */
	foodNames?: Record<string, string>;
	/** Fenêtre d'exposition, bornes en heures (défaut 4–48 h). */
	windowMinHours?: number;
	windowMaxHours?: number;
	/** Garde-fous (surchargables pour les tests). */
	minExposedBuckets?: number;
	minUnexposedBuckets?: number;
	minDistinctDays?: number;
	minLift?: number;
	chi2Threshold?: number;
}

/** Une association observée (aliment OU attribut) pour un signal donné. */
export interface Association {
	/** Clé : foodId (byFood) ou attribut trigger (byTrigger). */
	key: string;
	/** Libellé affichable (nom de l'aliment ou clé d'attribut). */
	displayName: string;
	/** Signal concerné. */
	signal: string;
	/** Lift = P(S|exposé) / P(S global). ≥ 0. */
	lift: number;
	/** Nb de buckets exposés (a + b). */
	nExposed: number;
	/** Nb de buckets exposés ET avec signal (a). */
	nExposedWithSignal: number;
	/** Statistique du chi² (Yates). */
	chi2: number;
	/** Significatif (chi² > seuil critique, p < 0.05) ? */
	pSignificant: boolean;
}

export interface AssociationsResult {
	byFood: Association[];
	byTrigger: Association[];
	/** Jours restants avant éligibilité (max(0, 14 − jours documentés)). */
	daysUntilEligible: number;
}

/** Découpe locale d'un instant en bucket de demi-journée. */
interface BucketRef {
	key: string;
	/** Epoch ms du DÉBUT du bucket (minuit ou midi local). */
	start: number;
	/** Date locale 'YYYY-MM-DD' (pour compter les jours distincts). */
	date: string;
}

/**
 * Bucket demi-journée d'un instant dans sa timezone. Le début du bucket est
 * dérivé de l'heure locale de l'instant lui-même (aucune supposition DST hasardeuse).
 */
function localBucket(occurredAt: number, tz: string): BucketRef {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(new Date(occurredAt));
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
	const date = `${get("year")}-${get("month")}-${get("day")}`;
	const hour = Number.parseInt(get("hour"), 10) % 24;
	const min = Number.parseInt(get("minute"), 10);
	const sec = Number.parseInt(get("second"), 10);
	const half = hour < 12 ? 0 : 1;
	const offsetMs = (((hour - half * 12) * 60 + min) * 60 + sec) * 1000;
	return { key: `${date}|${half}`, start: occurredAt - offsetMs, date };
}

interface BucketState {
	start: number;
	date: string;
	signalKinds: Set<string>;
	exposedFoods: Set<string>;
	exposedTriggers: Set<string>;
}

/** Chi² 2×2 avec correction de continuité de Yates (0 si une marge est nulle). */
export function chiSquareYates(a: number, b: number, c: number, d: number): number {
	const n = a + b + c + d;
	const rowsCols = (a + b) * (c + d) * (a + c) * (b + d);
	if (n === 0 || rowsCols === 0) return 0;
	const corrected = Math.max(0, Math.abs(a * d - b * c) - n / 2);
	return (n * corrected * corrected) / rowsCols;
}

/** Calcule les associations observées (byFood + byTrigger) sous garde-fous. */
export function computeAssociations(
	meals: CorrelationMeal[],
	signals: CorrelationSignal[],
	options: CorrelationOptions = {},
): AssociationsResult {
	const windowMin = (options.windowMinHours ?? 4) * HOUR_MS;
	const windowMax = (options.windowMaxHours ?? 48) * HOUR_MS;
	const minExposed = options.minExposedBuckets ?? 5;
	const minUnexposed = options.minUnexposedBuckets ?? 10;
	const minDays = options.minDistinctDays ?? 14;
	const minLift = options.minLift ?? 1.3;
	const chi2Threshold = options.chi2Threshold ?? CHI2_CRITICAL_P05;
	const foodNames = options.foodNames ?? {};

	// --- 1. Buckets documentés (repas OU signal) ---
	const buckets = new Map<string, BucketState>();
	const ensure = (ref: BucketRef): BucketState => {
		let b = buckets.get(ref.key);
		if (!b) {
			b = {
				start: ref.start,
				date: ref.date,
				signalKinds: new Set(),
				exposedFoods: new Set(),
				exposedTriggers: new Set(),
			};
			buckets.set(ref.key, b);
		}
		return b;
	};

	for (const meal of meals) ensure(localBucket(meal.occurredAt, meal.tz));
	const signalKinds = new Set<string>();
	for (const sig of signals) {
		const b = ensure(localBucket(sig.occurredAt, sig.tz));
		b.signalKinds.add(sig.kind);
		signalKinds.add(sig.kind);
	}

	const distinctDays = new Set<string>();
	for (const b of buckets.values()) distinctDays.add(b.date);
	const daysUntilEligible = Math.max(0, minDays - distinctDays.size);

	const empty: AssociationsResult = { byFood: [], byTrigger: [], daysUntilEligible };
	if (distinctDays.size < minDays || buckets.size === 0 || signalKinds.size === 0) {
		return empty;
	}

	// --- 2. Exposition de chaque bucket (fenêtre 4–48 h avant son début) ---
	const foodIds = new Set<string>();
	for (const meal of meals) {
		for (const item of meal.items) foodIds.add(item.foodId);
	}

	for (const bucket of buckets.values()) {
		const lo = bucket.start - windowMax;
		const hi = bucket.start - windowMin;
		for (const meal of meals) {
			if (meal.occurredAt < lo || meal.occurredAt > hi) continue;
			for (const item of meal.items) {
				bucket.exposedFoods.add(item.foodId);
				for (const attr of activeTriggerKeys(item.triggers)) bucket.exposedTriggers.add(attr);
			}
		}
	}

	const bucketList = [...buckets.values()];

	// --- 3. Tables 2×2 & scoring ---
	const scorePair = (
		key: string,
		displayName: string,
		signal: string,
		isExposed: (b: BucketState) => boolean,
	): Association | null => {
		let a = 0;
		let b = 0;
		let c = 0;
		let d = 0;
		for (const bucket of bucketList) {
			const exposed = isExposed(bucket);
			const hasSignal = bucket.signalKinds.has(signal);
			if (exposed && hasSignal) a++;
			else if (exposed) b++;
			else if (hasSignal) c++;
			else d++;
		}
		const nExposed = a + b;
		const nUnexposed = c + d;
		const total = a + b + c + d;
		if (nExposed < minExposed || nUnexposed < minUnexposed) return null;

		const pExposed = nExposed > 0 ? a / nExposed : 0;
		const pGlobal = total > 0 ? (a + c) / total : 0;
		const lift = pGlobal > 0 ? pExposed / pGlobal : 0;
		if (!(lift > minLift)) return null;

		const chi2 = chiSquareYates(a, b, c, d);
		const pSignificant = chi2 > chi2Threshold;
		if (!pSignificant) return null;

		return { key, displayName, signal, lift, nExposed, nExposedWithSignal: a, chi2, pSignificant };
	};

	const byFood: Association[] = [];
	for (const foodId of foodIds) {
		for (const signal of signalKinds) {
			const res = scorePair(foodId, foodNames[foodId] ?? foodId, signal, (b) =>
				b.exposedFoods.has(foodId),
			);
			if (res) byFood.push(res);
		}
	}

	const byTrigger: Association[] = [];
	const triggerAttrs = new Set<string>();
	for (const bucket of bucketList) {
		for (const attr of bucket.exposedTriggers) triggerAttrs.add(attr);
	}
	for (const attr of triggerAttrs) {
		for (const signal of signalKinds) {
			const res = scorePair(attr, attr, signal, (b) => b.exposedTriggers.has(attr));
			if (res) byTrigger.push(res);
		}
	}

	// Tri : plus fort chi² d'abord, puis lift (déterministe, tie-break sur clé).
	const rank = (x: Association, y: Association) =>
		y.chi2 - x.chi2 ||
		y.lift - x.lift ||
		x.key.localeCompare(y.key) ||
		x.signal.localeCompare(y.signal);
	byFood.sort(rank);
	byTrigger.sort(rank);

	return { byFood, byTrigger, daysUntilEligible };
}
