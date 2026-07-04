/**
 * Géométrie de proximité (§5.10) — module PUR, zéro I/O, zéro import RN.
 *
 * Distance de Haversine (grand cercle) et tri par distance. Utilisé pour classer
 * les toilettes renvoyées par Overpass sans jamais géolocaliser côté serveur.
 */

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

/** Distance en mètres entre deux points (lat/lon en degrés). */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return EARTH_RADIUS_M * c;
}

export interface GeoPoint {
	lat: number;
	lon: number;
}

/** Ajoute la distance (m) depuis `from` à chaque point puis trie croissant. */
export function sortByDistance<T extends GeoPoint>(
	from: GeoPoint,
	points: T[],
): (T & { distanceM: number })[] {
	return points
		.map((p) => ({ ...p, distanceM: haversineMeters(from.lat, from.lon, p.lat, p.lon) }))
		.sort((a, b) => a.distanceM - b.distanceM);
}

/** Formate une distance en mètres/kilomètres lisible (« 320 m », « 1,2 km »). */
export function formatDistance(meters: number, lang = "fr"): string {
	if (meters < 1000) return `${Math.round(meters)} m`;
	const km = meters / 1000;
	const sep = lang === "en" ? "." : ",";
	return `${km.toFixed(1).replace(".", sep)} km`;
}
