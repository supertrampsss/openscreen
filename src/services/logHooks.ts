/**
 * Petit registre d'événements « un log a été commité » (§7). PUR (zéro import
 * RN/DB) : les repositories l'appellent après `commitDraft`, et le service de
 * notifications s'y abonne pour annuler le rappel du soir du jour même. Ce
 * découplage évite que les repos tirent le module natif expo-notifications.
 */

type CommitListener = () => void;

const listeners = new Set<CommitListener>();

/** Abonne un écouteur. Renvoie une fonction de désabonnement. */
export function onLogCommitted(listener: CommitListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Émis par les repos après le commit d'un brouillon (selle, symptôme, repas). */
export function emitLogCommitted(): void {
	for (const listener of listeners) {
		try {
			listener();
		} catch {
			// Un écouteur défaillant ne doit jamais casser une écriture.
		}
	}
}
