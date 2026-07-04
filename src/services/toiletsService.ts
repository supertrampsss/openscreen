/**
 * Toilettes à proximité (§5.10) via Overpass API (OpenStreetMap).
 *
 * PRIVACY (§2 loi 4) : la localisation ne quitte l'appareil QUE vers Overpass,
 * en requête anonyme lat/lon — aucun compte, aucun tracking, aucun stockage tiers.
 * Le dernier résultat est mis en cache localement (settings) pour l'afficher hors
 * ligne. Le `fetch` est injectable pour les tests unitaires.
 *
 * La logique pure (construction de requête, parsing, tri) est testée ; la couche
 * réseau reste mince et tolérante aux pannes (jamais d'échec silencieux à l'UI).
 */

import { type GeoPoint, sortByDistance } from "@/domain/geo";
import { get as getSetting, set as setSetting } from "@/repositories/settingsRepo";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_RADIUS_M = 1500;
const TIMEOUT_MS = 8000;
const CACHE_KEY = "toilets_cache";

export interface Toilet {
	id: string;
	name: string | null;
	lat: number;
	lon: number;
	wheelchair: boolean;
	fee: boolean;
}

export interface ToiletWithDistance extends Toilet {
	distanceM: number;
}

/** Construit la requête Overpass QL (nodes amenity=toilets dans un rayon). */
export function buildOverpassQuery(lat: number, lon: number, radiusM: number): string {
	return `[out:json][timeout:${Math.round(TIMEOUT_MS / 1000)}];(node["amenity"="toilets"](around:${radiusM},${lat},${lon}););out body;`;
}

interface OverpassElement {
	type?: string;
	id?: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
}

/** Parse une réponse Overpass en toilettes exploitables (pur, tolérant). */
export function parseOverpassResponse(json: unknown): Toilet[] {
	const elements = (json as { elements?: OverpassElement[] })?.elements;
	if (!Array.isArray(elements)) return [];
	const out: Toilet[] = [];
	for (const el of elements) {
		const lat = el.lat ?? el.center?.lat;
		const lon = el.lon ?? el.center?.lon;
		if (typeof lat !== "number" || typeof lon !== "number") continue;
		const tags = el.tags ?? {};
		out.push({
			id: `${el.type ?? "node"}/${el.id ?? `${lat},${lon}`}`,
			name: tags.name ?? null,
			lat,
			lon,
			wheelchair: tags.wheelchair === "yes",
			fee: tags.fee === "yes",
		});
	}
	return out;
}

export interface CachedToilets {
	from: GeoPoint;
	fetchedAt: number;
	toilets: ToiletWithDistance[];
}

/** Lit le dernier résultat mis en cache (ou null). */
export async function getCachedToilets(): Promise<CachedToilets | null> {
	return (await getSetting<CachedToilets>(CACHE_KEY)) ?? null;
}

export interface FetchOptions {
	radiusM?: number;
	/** Injection de `fetch` pour les tests (défaut : global). */
	fetchImpl?: typeof fetch;
	/** Désactive la mise en cache (tests). */
	skipCache?: boolean;
}

/**
 * Requête Overpass anonyme autour de (lat, lon), triée par distance. Met le
 * résultat en cache local. Lève en cas d'échec réseau/timeout (l'UI gère).
 */
export async function fetchNearbyToilets(
	from: GeoPoint,
	opts: FetchOptions = {},
): Promise<ToiletWithDistance[]> {
	const radiusM = opts.radiusM ?? DEFAULT_RADIUS_M;
	const doFetch = opts.fetchImpl ?? fetch;
	const query = buildOverpassQuery(from.lat, from.lon, radiusM);

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	let json: unknown;
	try {
		const res = await doFetch(OVERPASS_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: `data=${encodeURIComponent(query)}`,
			signal: controller.signal,
		});
		if (!res.ok) throw new Error(`overpass ${res.status}`);
		json = await res.json();
	} finally {
		clearTimeout(timer);
	}

	const toilets = sortByDistance(from, parseOverpassResponse(json));
	if (!opts.skipCache) {
		await setSetting(CACHE_KEY, {
			from,
			fetchedAt: Date.now(),
			toilets,
		} satisfies CachedToilets).catch(() => undefined);
	}
	return toilets;
}

/** URL geo:/maps pour ouvrir l'itinéraire vers une toilette. */
export function directionsUrl(t: Toilet, platformOS: string): string {
	if (platformOS === "ios") {
		return `https://maps.apple.com/?daddr=${t.lat},${t.lon}`;
	}
	if (platformOS === "android") {
		return `geo:${t.lat},${t.lon}?q=${t.lat},${t.lon}(${encodeURIComponent(t.name ?? "Toilettes")})`;
	}
	return `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lon}`;
}
