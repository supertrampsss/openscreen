import { describe, expect, it } from "vitest";
import { formatDistance, haversineMeters, sortByDistance } from "./geo";

describe("haversineMeters", () => {
	it("distance nulle pour le même point", () => {
		expect(haversineMeters(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
	});
	it("Paris → Notre-Dame ≈ 1 km (ordre de grandeur)", () => {
		// Louvre → Notre-Dame de Paris, ~1 km à vol d'oiseau.
		const d = haversineMeters(48.8606, 2.3376, 48.853, 2.3499);
		expect(d).toBeGreaterThan(800);
		expect(d).toBeLessThan(1600);
	});
	it("un degré de latitude ≈ 111 km", () => {
		const d = haversineMeters(0, 0, 1, 0);
		expect(d).toBeGreaterThan(110_000);
		expect(d).toBeLessThan(112_000);
	});
});

describe("sortByDistance", () => {
	it("trie du plus proche au plus lointain et annote la distance", () => {
		const from = { lat: 48.8566, lon: 2.3522 };
		const points = [
			{ id: "far", lat: 48.87, lon: 2.37 },
			{ id: "near", lat: 48.857, lon: 2.353 },
			{ id: "mid", lat: 48.862, lon: 2.36 },
		];
		const sorted = sortByDistance(from, points);
		expect(sorted.map((p) => p.id)).toEqual(["near", "mid", "far"]);
		expect(sorted[0].distanceM).toBeGreaterThanOrEqual(0);
		expect(sorted[0].distanceM).toBeLessThan(sorted[1].distanceM);
	});
});

describe("formatDistance", () => {
	it("mètres sous 1 km, km au-delà, séparateur localisé", () => {
		expect(formatDistance(320)).toBe("320 m");
		expect(formatDistance(1240, "fr")).toBe("1,2 km");
		expect(formatDistance(1240, "en")).toBe("1.2 km");
	});
});
