/**
 * i18n — i18next + react-i18next (§9). Base `fr`, fallback `fr`.
 *
 * Détection : override réglages > langue du device (expo-localization) > fr.
 * Namespaces : common, log, journal. TOUTE chaîne UI passe par t().
 */

import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import commonEn from "./locales/en/common.json";
import exportEn from "./locales/en/export.json";
import journalEn from "./locales/en/journal.json";
import logEn from "./locales/en/log.json";
import onboardingEn from "./locales/en/onboarding.json";
import premiumEn from "./locales/en/premium.json";
import scanEn from "./locales/en/scan.json";
import treatmentsEn from "./locales/en/treatments.json";
import trendsEn from "./locales/en/trends.json";
import urgenceEn from "./locales/en/urgence.json";
import commonFr from "./locales/fr/common.json";
import exportFr from "./locales/fr/export.json";
import journalFr from "./locales/fr/journal.json";
import logFr from "./locales/fr/log.json";
import onboardingFr from "./locales/fr/onboarding.json";
import premiumFr from "./locales/fr/premium.json";
import scanFr from "./locales/fr/scan.json";
import treatmentsFr from "./locales/fr/treatments.json";
import trendsFr from "./locales/fr/trends.json";
import urgenceFr from "./locales/fr/urgence.json";

export const defaultNS = "common";
export const namespaces = [
	"common",
	"log",
	"journal",
	"trends",
	"export",
	"scan",
	"premium",
	"onboarding",
	"treatments",
	"urgence",
] as const;
export const supportedLanguages = ["fr", "en"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const resources = {
	fr: {
		common: commonFr,
		log: logFr,
		journal: journalFr,
		trends: trendsFr,
		export: exportFr,
		scan: scanFr,
		premium: premiumFr,
		onboarding: onboardingFr,
		treatments: treatmentsFr,
		urgence: urgenceFr,
	},
	en: {
		common: commonEn,
		log: logEn,
		journal: journalEn,
		trends: trendsEn,
		export: exportEn,
		scan: scanEn,
		premium: premiumEn,
		onboarding: onboardingEn,
		treatments: treatmentsEn,
		urgence: urgenceEn,
	},
} as const;

/** Langue du device réduite à une langue supportée (défaut fr). */
export function detectDeviceLanguage(): SupportedLanguage {
	try {
		const code = getLocales()[0]?.languageCode;
		return code === "en" ? "en" : "fr";
	} catch {
		return "fr";
	}
}

/** Initialise i18next une seule fois. `override` = préférence réglages. */
export function initI18n(override?: SupportedLanguage) {
	if (i18n.isInitialized) return i18n;
	i18n.use(initReactI18next).init({
		resources,
		lng: override ?? detectDeviceLanguage(),
		fallbackLng: "fr",
		defaultNS,
		ns: namespaces as unknown as string[],
		interpolation: { escapeValue: false },
		returnNull: false,
	});
	return i18n;
}

export default i18n;
