import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type CorrelationMeal,
	type CorrelationSignal,
	chiSquareYates,
	computeAssociations,
} from "./correlations";
import type { FoodTriggers } from "./foods";

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Minuit UTC de départ (tz = UTC → heure locale = UTC, buckets simples). */
const D0 = Date.UTC(2026, 0, 5, 0, 0, 0);

function triggers(over: Partial<FoodTriggers> = {}): FoodTriggers {
	return {
		fodmap: "medium",
		lactose: false,
		gluten: false,
		fried: false,
		spicy: false,
		insoluble_fiber: false,
		alcohol: false,
		caffeine: false,
		additives: false,
		...over,
	};
}

const MILK = triggers({ fodmap: "high", lactose: true });

function meal(occurredAt: number, foodId: string, tr: FoodTriggers): CorrelationMeal {
	return { occurredAt, tz: "UTC", items: [{ foodId, triggers: tr }] };
}
function signal(occurredAt: number, kind: string): CorrelationSignal {
	return { occurredAt, tz: "UTC", kind };
}

// ---------------------------------------------------------------------------
// chi² Yates — valeurs de référence.
// ---------------------------------------------------------------------------
describe("chiSquareYates", () => {
	it("renvoie 0 si une marge est nulle", () => {
		expect(chiSquareYates(0, 0, 5, 5)).toBe(0);
		expect(chiSquareYates(3, 0, 0, 0)).toBe(0);
	});
	it("valeur connue (a=9,b=1,c=2,d=10) ≈ 8.98", () => {
		// |ad-bc|=88, -N/2=77, 77²·22 / (10·12·11·11) = 130438/14520
		expect(chiSquareYates(9, 1, 2, 10)).toBeCloseTo(8.984, 2);
	});
});

// ---------------------------------------------------------------------------
// Association plantée : lift calculé à la main (a=11,b=1,c=2,d=12 → lift≈1.833).
// ---------------------------------------------------------------------------
/**
 * 12 jours d'observation espacés de 5 j (pas de contamination croisée). Chaque
 * jour : repas de lait le matin (02:00) → bucket matin NON exposé + bucket soir
 * exposé (lag 10 h). 11 soirs ont un signal « pain » (a=11), le 12ᵉ a un signal
 * « other » (bucket soir documenté & exposé mais sans pain → b=1). 12 buckets
 * matin = non exposés sans pain (d=12). 2 jours contrôle = signal pain sans repas
 * (non exposés → c=2). Total distinct = 14 jours.
 */
function strongDataset() {
	const meals: CorrelationMeal[] = [];
	const signals: CorrelationSignal[] = [];
	for (let i = 0; i < 12; i++) {
		const dayStart = D0 + i * 5 * DAY;
		meals.push(meal(dayStart + 2 * HOUR, "milk", MILK)); // bucket matin
		const evening = dayStart + 12 * HOUR + 2 * HOUR; // 14:00, bucket soir
		signals.push(signal(evening, i < 11 ? "pain" : "other"));
	}
	// 2 jours contrôle, loin de tout repas → signaux pain non exposés.
	for (let k = 0; k < 2; k++) {
		const dayStart = D0 + (70 + k * 5) * DAY;
		signals.push(signal(dayStart + 14 * HOUR, "pain"));
	}
	return { meals, signals };
}

describe("computeAssociations — association plantée", () => {
	const { meals, signals } = strongDataset();
	const res = computeAssociations(meals, signals, { foodNames: { milk: "Lait" } });

	it("détecte l'aliment lait ↔ douleur avec le lift attendu", () => {
		const milk = res.byFood.find((a) => a.key === "milk" && a.signal === "pain");
		expect(milk).toBeDefined();
		expect(milk?.displayName).toBe("Lait");
		expect(milk?.nExposed).toBe(12);
		expect(milk?.nExposedWithSignal).toBe(11);
		expect(milk?.lift).toBeCloseTo(1.833, 2);
		expect(milk?.pSignificant).toBe(true);
	});

	it("agrège aussi au niveau des attributs (lactose, fodmap)", () => {
		const lactose = res.byTrigger.find((a) => a.key === "lactose" && a.signal === "pain");
		expect(lactose).toBeDefined();
		expect(lactose?.lift).toBeCloseTo(1.833, 2);
		expect(res.byTrigger.some((a) => a.key === "fodmap")).toBe(true);
	});

	it("aucune association fantôme sur le signal « other » (trop peu)", () => {
		expect(res.byFood.some((a) => a.signal === "other")).toBe(false);
	});

	it("daysUntilEligible = 0 quand ≥14 jours documentés", () => {
		expect(res.daysUntilEligible).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Garde-fou : < 5 buckets exposés ⇒ absent (mais présent si le seuil est abaissé).
// ---------------------------------------------------------------------------
describe("computeAssociations — garde-fou expositions", () => {
	function fourExposures() {
		const meals: CorrelationMeal[] = [];
		const signals: CorrelationSignal[] = [];
		// 4 jours exposés (lait matin + pain soir).
		for (let i = 0; i < 4; i++) {
			const dayStart = D0 + i * 5 * DAY;
			meals.push(meal(dayStart + 2 * HOUR, "milk", MILK));
			signals.push(signal(dayStart + 14 * HOUR, "pain"));
		}
		// 12 jours « filler » : repas de riz sans signal → jours documentés, non exposés.
		for (let j = 0; j < 12; j++) {
			const dayStart = D0 + (30 + j * 5) * DAY;
			meals.push(meal(dayStart + 2 * HOUR, "rice", triggers()));
		}
		return { meals, signals };
	}
	const { meals, signals } = fourExposures();

	it("4 expositions → l'aliment n'apparaît pas (seuil ≥5)", () => {
		const res = computeAssociations(meals, signals);
		expect(res.daysUntilEligible).toBe(0); // 16 jours documentés
		expect(res.byFood.some((a) => a.key === "milk")).toBe(false);
	});

	it("mais apparaît si on abaisse le garde-fou à 4", () => {
		const res = computeAssociations(meals, signals, {
			minExposedBuckets: 4,
			minUnexposedBuckets: 1,
		});
		expect(res.byFood.some((a) => a.key === "milk" && a.signal === "pain")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Fenêtre 4–48 h : repas 2 h avant → non compté ; 50 h avant → non compté.
// ---------------------------------------------------------------------------
describe("computeAssociations — fenêtre d'exposition 4–48 h", () => {
	/** 14 jours : repas de lait avec un lag donné avant le bucket soir + 2 contrôles. */
	function datasetWithLag(lagHours: number) {
		const meals: CorrelationMeal[] = [];
		const signals: CorrelationSignal[] = [];
		for (let i = 0; i < 14; i++) {
			const dayStart = D0 + i * 5 * DAY;
			const eveningStart = dayStart + 12 * HOUR;
			meals.push(meal(eveningStart - lagHours * HOUR, "milk", MILK));
			signals.push(signal(eveningStart + 2 * HOUR, "pain"));
		}
		for (let k = 0; k < 2; k++) {
			const dayStart = D0 + (90 + k * 5) * DAY;
			signals.push(signal(dayStart + 14 * HOUR, "pain"));
		}
		return { meals, signals };
	}

	it("lag 10 h (dans la fenêtre) → association présente", () => {
		const { meals, signals } = datasetWithLag(10);
		const res = computeAssociations(meals, signals);
		expect(res.byFood.some((a) => a.key === "milk" && a.signal === "pain")).toBe(true);
	});

	it("repas 2 h avant (< 4 h) → non compté → absent", () => {
		const { meals, signals } = datasetWithLag(2);
		const res = computeAssociations(meals, signals);
		expect(res.byFood.some((a) => a.key === "milk")).toBe(false);
	});

	it("repas 50 h avant (> 48 h) → non compté → absent", () => {
		const { meals, signals } = datasetWithLag(50);
		const res = computeAssociations(meals, signals);
		expect(res.byFood.some((a) => a.key === "milk")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Éligibilité : < 14 jours de données → aucune association, compte à rebours.
// ---------------------------------------------------------------------------
describe("computeAssociations — éligibilité 14 jours", () => {
	it("compte à rebours honnête tant que < 14 jours", () => {
		const meals = [meal(D0 + 2 * HOUR, "milk", MILK)];
		const signals = [signal(D0 + 14 * HOUR, "pain")];
		const res = computeAssociations(meals, signals);
		expect(res.byFood).toHaveLength(0);
		expect(res.byTrigger).toHaveLength(0);
		expect(res.daysUntilEligible).toBe(13); // 1 jour documenté
	});
});

// ---------------------------------------------------------------------------
// Propriétés (fast-check) : jamais de division par zéro, lift fini ≥ 0.
// ---------------------------------------------------------------------------
describe("computeAssociations — propriétés", () => {
	const foodArb = fc.constantFrom("a", "b", "c");
	const mealArb = fc.record({
		occurredAt: fc.integer({ min: D0, max: D0 + 120 * DAY }),
		tz: fc.constant("UTC"),
		items: fc.array(
			fc.record({ foodId: foodArb, triggers: fc.constant(triggers({ lactose: true })) }),
			{ minLength: 1, maxLength: 3 },
		),
	});
	const signalArb = fc.record({
		occurredAt: fc.integer({ min: D0, max: D0 + 120 * DAY }),
		tz: fc.constant("UTC"),
		kind: fc.constantFrom("pain", "bristol", "blood"),
	});

	it("ne lève jamais, lift toujours fini et ≥ 0, garde-fous respectés", () => {
		fc.assert(
			fc.property(
				fc.array(mealArb, { maxLength: 60 }),
				fc.array(signalArb, { maxLength: 60 }),
				(meals, signals) => {
					const res = computeAssociations(meals, signals);
					expect(res.daysUntilEligible).toBeGreaterThanOrEqual(0);
					for (const a of [...res.byFood, ...res.byTrigger]) {
						expect(Number.isFinite(a.lift)).toBe(true);
						expect(a.lift).toBeGreaterThan(1.3);
						expect(a.nExposed).toBeGreaterThanOrEqual(5);
						expect(a.chi2).toBeGreaterThanOrEqual(0);
						expect(Number.isFinite(a.chi2)).toBe(true);
					}
				},
			),
			{ numRuns: 200 },
		);
	});
});
