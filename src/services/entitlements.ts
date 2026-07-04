/**
 * Entitlements — abstraction d'abonnement (§8, §11-bis).
 *
 * Le paywall et l'accès Premium passent TOUJOURS par `EntitlementsProvider`,
 * jamais par un appel direct à un SDK de facturation. Deux implémentations :
 *
 *  - `MockEntitlementsProvider` (défaut) : `premium=false`, prix placeholders,
 *    `purchase()` simule ~1,2 s puis persiste `premium:true` dans les settings.
 *    Utilisable en dev/démo sans compte store. Un interrupteur caché (§ Réglages :
 *    long-press ×5 sur la version) bascule ce flag pour tester les deux états.
 *  - `RevenueCatEntitlementsProvider` : squelette complet, appels
 *    `react-native-purchases` COMMENTÉS (la dépendance native n'est PAS installée)
 *    et `throw` explicite tant que ce n'est pas configuré (voir docs/RELEASE.md).
 *
 * Sélection par `EXPO_PUBLIC_ENTITLEMENTS=revenuecat|mock` (défaut `mock`).
 *
 * Ce module N'IMPORTE PAS le repository settings au niveau module (import
 * dynamique dans le store par défaut) : il reste ainsi chargeable sous Node
 * (Vitest) sans tirer expo-sqlite.
 */

import { useCallback, useEffect, useState } from "react";

export type EntitlementSource = "mock" | "revenuecat";
export type PurchasePlan = "monthly" | "annual";

export interface EntitlementStatus {
	premium: boolean;
	source: EntitlementSource;
}

export interface Offerings {
	monthly: { price: string };
	annual: { price: string; monthlyEquivalent: string };
}

export interface PurchaseResult {
	ok: boolean;
	premium: boolean;
	/** Achat annulé par l'utilisateur (pas une erreur). */
	cancelled?: boolean;
	/** Message d'erreur technique (jamais affiché brut à l'utilisateur). */
	error?: string;
}

export interface EntitlementsProvider {
	getStatus(): Promise<EntitlementStatus>;
	getOfferings(): Promise<Offerings>;
	purchase(plan: PurchasePlan): Promise<PurchaseResult>;
	restore(): Promise<PurchaseResult>;
	/** Jeton d'entitlement à joindre aux appels du proxy IA (null si non Premium). */
	getEntitlementToken(): Promise<string | null>;
}

/** Store clé/valeur minimal (injectable — settings en prod, mémoire en test). */
export interface EntitlementsStore {
	get<T>(key: string): Promise<T | null>;
	set(key: string, value: unknown): Promise<void>;
}

/** Prix placeholders (§8) — affichés TÔT et fixes, jamais dynamiques. */
export const PLACEHOLDER_OFFERINGS: Offerings = {
	monthly: { price: "4,99 €" },
	annual: { price: "29,99 €", monthlyEquivalent: "2,50 €" },
};

/** Clé de persistance du flag Premium simulé. */
export const MOCK_PREMIUM_KEY = "mock_premium";
/** Jeton mock joint aux appels proxy quand Premium simulé est actif. */
export const MOCK_ENTITLEMENT_TOKEN = "mock-premium-token";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Provider MOCK (défaut). Persiste l'état Premium dans le store injecté.
 * `delayMs` simule la latence d'achat (0 en test pour aller vite).
 */
export class MockEntitlementsProvider implements EntitlementsProvider {
	constructor(
		private readonly store: EntitlementsStore,
		private readonly delayMs = 1200,
	) {}

	private async isPremium(): Promise<boolean> {
		return Boolean(await this.store.get<boolean>(MOCK_PREMIUM_KEY));
	}

	async getStatus(): Promise<EntitlementStatus> {
		return { premium: await this.isPremium(), source: "mock" };
	}

	async getOfferings(): Promise<Offerings> {
		return PLACEHOLDER_OFFERINGS;
	}

	async purchase(_plan: PurchasePlan): Promise<PurchaseResult> {
		if (this.delayMs > 0) await delay(this.delayMs);
		await this.store.set(MOCK_PREMIUM_KEY, true);
		return { ok: true, premium: true };
	}

	async restore(): Promise<PurchaseResult> {
		const premium = await this.isPremium();
		return { ok: true, premium };
	}

	async getEntitlementToken(): Promise<string | null> {
		return (await this.isPremium()) ? MOCK_ENTITLEMENT_TOKEN : null;
	}

	/** Dev/démo : bascule l'état Premium simulé et renvoie le nouvel état. */
	async devTogglePremium(): Promise<boolean> {
		const next = !(await this.isPremium());
		await this.store.set(MOCK_PREMIUM_KEY, next);
		return next;
	}
}

/**
 * Provider RevenueCat — squelette PRÊT, non actif. La dépendance native
 * `react-native-purchases` n'est pas installée (exige un dev build + comptes
 * stores) : chaque méthode lève tant que ce n'est pas configuré. Le branchement
 * réel est décrit dans docs/RELEASE.md.
 */
export class RevenueCatEntitlementsProvider implements EntitlementsProvider {
	/** Identifiant de l'entitlement unique côté RevenueCat (§8). */
	static readonly ENTITLEMENT_ID = "premium";

	private notConfigured(): never {
		throw new Error("RevenueCat non configuré — voir docs/RELEASE.md");
	}

	async getStatus(): Promise<EntitlementStatus> {
		// import Purchases from "react-native-purchases";
		// const info = await Purchases.getCustomerInfo();
		// const active = !!info.entitlements.active[RevenueCatEntitlementsProvider.ENTITLEMENT_ID];
		// return { premium: active, source: "revenuecat" };
		return this.notConfigured();
	}

	async getOfferings(): Promise<Offerings> {
		// import Purchases from "react-native-purchases";
		// const offerings = await Purchases.getOfferings();
		// const current = offerings.current;
		// const monthly = current?.monthly?.product;
		// const annual = current?.annual?.product;
		// return {
		//   monthly: { price: monthly?.priceString ?? "" },
		//   annual: {
		//     price: annual?.priceString ?? "",
		//     monthlyEquivalent: /* prix annuel / 12, formaté via product.currencyCode */ "",
		//   },
		// };
		return this.notConfigured();
	}

	async purchase(_plan: PurchasePlan): Promise<PurchaseResult> {
		// import Purchases, { PurchasesError } from "react-native-purchases";
		// try {
		//   const offerings = await Purchases.getOfferings();
		//   const pkg = _plan === "annual" ? offerings.current?.annual : offerings.current?.monthly;
		//   if (!pkg) return { ok: false, premium: false, error: "no_package" };
		//   const { customerInfo } = await Purchases.purchasePackage(pkg);
		//   const premium = !!customerInfo.entitlements.active[RevenueCatEntitlementsProvider.ENTITLEMENT_ID];
		//   return { ok: true, premium };
		// } catch (e) {
		//   if ((e as PurchasesError).userCancelled) return { ok: false, premium: false, cancelled: true };
		//   return { ok: false, premium: false, error: String(e) };
		// }
		return this.notConfigured();
	}

	async restore(): Promise<PurchaseResult> {
		// import Purchases from "react-native-purchases";
		// const info = await Purchases.restorePurchases();
		// const premium = !!info.entitlements.active[RevenueCatEntitlementsProvider.ENTITLEMENT_ID];
		// return { ok: true, premium };
		return this.notConfigured();
	}

	async getEntitlementToken(): Promise<string | null> {
		// import Purchases from "react-native-purchases";
		// const info = await Purchases.getCustomerInfo();
		// // Le proxy IA vérifie l'entitlement via l'API RevenueCat à partir de l'appUserID.
		// return info.originalAppUserId ?? null;
		return this.notConfigured();
	}
}

/** Nom du provider sélectionné par l'environnement (défaut `mock`). */
export function entitlementsProviderName(): EntitlementSource {
	return process.env.EXPO_PUBLIC_ENTITLEMENTS === "revenuecat" ? "revenuecat" : "mock";
}

/**
 * Construit un provider pour un nom donné, avec un store injecté (utilisé par
 * l'app avec le store settings, et par les tests avec un store mémoire).
 */
export function createEntitlementsProvider(
	name: EntitlementSource,
	store: EntitlementsStore,
): EntitlementsProvider {
	return name === "revenuecat"
		? new RevenueCatEntitlementsProvider()
		: new MockEntitlementsProvider(store);
}

/** Store par défaut : settings (import dynamique → pas de db chargée sous Node). */
const settingsStore: EntitlementsStore = {
	async get<T>(key: string) {
		const m = await import("@/repositories/settingsRepo");
		return m.get<T>(key);
	},
	async set(key: string, value: unknown) {
		const m = await import("@/repositories/settingsRepo");
		await m.set(key, value);
	},
};

let singleton: EntitlementsProvider | null = null;

/** Provider singleton de l'app (mock par défaut, adossé aux settings). */
export function getEntitlementsProvider(): EntitlementsProvider {
	if (!singleton) {
		singleton = createEntitlementsProvider(entitlementsProviderName(), settingsStore);
	}
	return singleton;
}

/**
 * Bascule le flag Premium simulé (interrupteur caché des Réglages).
 * No-op silencieux si le provider actif n'est pas le mock.
 */
export async function devToggleMockPremium(): Promise<boolean> {
	const provider = getEntitlementsProvider();
	if (provider instanceof MockEntitlementsProvider) {
		return provider.devTogglePremium();
	}
	return false;
}

/** Jeton d'entitlement courant (best-effort, jamais throw pour l'appelant). */
export async function currentEntitlementToken(): Promise<string | null> {
	try {
		return await getEntitlementsProvider().getEntitlementToken();
	} catch {
		return null;
	}
}

/** Hook React : statut Premium + rechargement (Réglages, écran Premium). */
export function useEntitlements() {
	const [status, setStatus] = useState<EntitlementStatus>({
		premium: false,
		source: entitlementsProviderName(),
	});

	const reload = useCallback(() => {
		getEntitlementsProvider()
			.getStatus()
			.then(setStatus)
			.catch(() => undefined);
	}, []);

	useEffect(() => {
		reload();
	}, [reload]);

	return { status, reload };
}
