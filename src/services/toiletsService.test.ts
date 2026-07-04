import { describe, expect, it, vi } from "vitest";

// Mock du repo settings (sinon l'import charge `@/db/client` = expo-sqlite,
// indisponible sous Node). Le cache n'est pas l'objet du test.
vi.mock("@/repositories/settingsRepo", () => ({
	get: vi.fn(async () => null),
	set: vi.fn(async () => undefined),
}));

import {
	buildOverpassQuery,
	directionsUrl,
	fetchNearbyToilets,
	parseOverpassResponse,
	type Toilet,
} from "./toiletsService";

describe("buildOverpassQuery", () => {
	it("cible amenity=toilets avec rayon et coordonnées", () => {
		const q = buildOverpassQuery(48.8566, 2.3522, 1500);
		expect(q).toContain('node["amenity"="toilets"]');
		expect(q).toContain("around:1500,48.8566,2.3522");
		expect(q).toContain("[out:json]");
	});
});

describe("parseOverpassResponse", () => {
	it("extrait id/nom/coords/tags et ignore les éléments sans coordonnées", () => {
		const json = {
			elements: [
				{
					type: "node",
					id: 1,
					lat: 48.86,
					lon: 2.35,
					tags: { name: "WC Rivoli", wheelchair: "yes", fee: "no" },
				},
				{ type: "node", id: 2, tags: {} }, // pas de coords → ignoré
				{ type: "way", id: 3, center: { lat: 48.87, lon: 2.36 } },
			],
		};
		const toilets = parseOverpassResponse(json);
		expect(toilets).toHaveLength(2);
		expect(toilets[0]).toMatchObject({
			id: "node/1",
			name: "WC Rivoli",
			wheelchair: true,
			fee: false,
		});
		expect(toilets[1].id).toBe("way/3");
		expect(toilets[1].name).toBeNull();
	});
	it("tolère une réponse vide/malformée", () => {
		expect(parseOverpassResponse(null)).toEqual([]);
		expect(parseOverpassResponse({})).toEqual([]);
		expect(parseOverpassResponse({ elements: "nope" })).toEqual([]);
	});
});

describe("fetchNearbyToilets", () => {
	it("POST la requête et renvoie la liste triée par distance", async () => {
		const from = { lat: 48.8566, lon: 2.3522 };
		const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
			// La requête part bien en POST avec le corps encodé.
			expect(init?.method).toBe("POST");
			expect(String(init?.body)).toContain("data=");
			return {
				ok: true,
				status: 200,
				json: async () => ({
					elements: [
						{ type: "node", id: 10, lat: 48.87, lon: 2.37, tags: {} }, // loin
						{ type: "node", id: 11, lat: 48.857, lon: 2.353, tags: {} }, // proche
					],
				}),
			} as Response;
		}) as unknown as typeof fetch;

		const res = await fetchNearbyToilets(from, { fetchImpl, skipCache: true });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(res.map((t) => t.id)).toEqual(["node/11", "node/10"]);
		expect(res[0].distanceM).toBeLessThan(res[1].distanceM);
	});

	it("lève si la réponse n'est pas ok (jamais d'échec silencieux)", async () => {
		const fetchImpl = vi.fn(
			async () => ({ ok: false, status: 504 }) as Response,
		) as unknown as typeof fetch;
		await expect(
			fetchNearbyToilets({ lat: 0, lon: 0 }, { fetchImpl, skipCache: true }),
		).rejects.toThrow(/504/);
	});
});

describe("directionsUrl", () => {
	const t: Toilet = {
		id: "node/1",
		name: "WC",
		lat: 48.86,
		lon: 2.35,
		wheelchair: false,
		fee: false,
	};
	it("produit un lien adapté à la plateforme", () => {
		expect(directionsUrl(t, "ios")).toContain("maps.apple.com");
		expect(directionsUrl(t, "android")).toContain("geo:48.86,2.35");
		expect(directionsUrl(t, "web")).toContain("google.com/maps");
	});
});
