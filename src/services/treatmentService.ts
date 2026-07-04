/**
 * Service traitements (§5.9) — orchestration impure autour de `treatmentRepo`.
 *
 * Propose de pré-remplir les traitements depuis les réponses d'onboarding
 * (multi-select « Traitement actuel » + cadence biothérapie) au premier passage
 * sur l'écran, tant que la table est vide.
 */

import type { TreatmentKind } from "@/db/schema";
import {
	ONBOARDING_TREATMENTS_KEY,
	TREATMENT_REMINDER_WEEKS_KEY,
} from "@/features/onboarding/keys";
import { get as getSetting } from "@/repositories/settingsRepo";
import { countAll, create } from "@/repositories/treatmentRepo";

/** Valeur d'onboarding → famille de traitement (`null` = ignoré, ex. « aucun »). */
const ONBOARDING_KIND_MAP: Record<string, TreatmentKind | null> = {
	biologic_injectable: "biologic_injection",
	biologic_infusion: "infusion",
	immunosuppressant: "immunosuppressant",
	corticosteroids: "corticosteroid",
	aminosalicylates: "five_asa",
	none: null,
};

/** Les biothérapies portent la cadence saisie à l'onboarding. */
function isInjectable(kind: TreatmentKind): boolean {
	return kind === "biologic_injection" || kind === "infusion";
}

export interface OnboardingSeedProposal {
	kind: TreatmentKind;
	/** Cadence proposée (semaines) — biothérapies seulement. */
	cadenceWeeks: number | null;
}

/**
 * Propositions de traitements à créer depuis l'onboarding, si (et seulement si)
 * la table `treatments` est encore vide. Renvoie `[]` sinon (rien à proposer).
 */
export async function onboardingSeedProposal(): Promise<OnboardingSeedProposal[]> {
	if ((await countAll()) > 0) return [];
	const picked = (await getSetting<string[]>(ONBOARDING_TREATMENTS_KEY)) ?? [];
	const weeks = await getSetting<number>(TREATMENT_REMINDER_WEEKS_KEY);
	const out: OnboardingSeedProposal[] = [];
	for (const value of picked) {
		const kind = ONBOARDING_KIND_MAP[value];
		if (!kind) continue;
		out.push({
			kind,
			cadenceWeeks: isInjectable(kind) && typeof weeks === "number" ? weeks : null,
		});
	}
	return out;
}

/** Crée les traitements proposés (nom = libellé de la famille, déjà traduit). */
export async function createFromProposals(
	proposals: { name: string; kind: TreatmentKind; cadenceWeeks: number | null }[],
): Promise<void> {
	for (const p of proposals) {
		await create({ name: p.name, kind: p.kind, cadenceWeeks: p.cadenceWeeks });
	}
}
