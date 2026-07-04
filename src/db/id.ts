import { v7 as uuidv7 } from "uuid";

/**
 * Identifiant d'entrée : uuid v7 (§9).
 * Le préfixe temporel rend l'id triable chronologiquement — pratique pour
 * l'ordre d'insertion et le débogage.
 */
export function newId(): string {
	return uuidv7();
}
