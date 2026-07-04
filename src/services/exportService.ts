/**
 * Service export médecin (§5.8) — I/O autour des modules PURS `exportReport` /
 * `exportHtml`. Rassemble les données (repositories), construit les `labels`
 * traduits (i18next), puis génère le PDF (natif) ou ouvre le HTML (web fallback).
 *
 * Le domaine reste pur : ce service est la SEULE couche qui touche i18next,
 * expo-print, expo-sharing et le DOM web.
 */

import * as Print from "expo-print";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { Platform } from "react-native";
import { APP_NAME } from "@/constants/branding";
import type { ConsultPoint } from "@/domain/consultPoints";
import { localDateDaysAgo, nowEntryTimestamp } from "@/domain/dates";
import { type ReportLabels, renderReportHtml } from "@/domain/exportHtml";
import {
	buildReport,
	type ReportData,
	type ReportEntry,
	type ReportPeriodDays,
} from "@/domain/exportReport";
import type { ScoreKind } from "@/domain/scoreSeries";
import i18n from "@/i18n";
import { listSince as listExtrasSince } from "@/repositories/dailyExtrasRepo";
import { getProfile } from "@/repositories/profileRepo";
import * as settingsRepo from "@/repositories/settingsRepo";
import { listCommittedSince } from "@/repositories/symptomRepo";
import { loadAssociations, topAssociations } from "@/services/correlationService";
import { documentedLocalDates } from "@/services/streakService";

/** Clé settings de l'identité optionnelle affichée sur le PDF (§5.8). */
const KEY_IDENTITY = "report_identity";

/** Périodes proposées (mois → jours). */
export const PERIOD_MONTHS = [1, 3, 6] as const;
export type PeriodMonths = (typeof PERIOD_MONTHS)[number];

export function periodDaysFor(months: PeriodMonths): ReportPeriodDays {
	return (months * 30) as ReportPeriodDays;
}

/** Objectif « corrélations » = 14 jours documentés (aligné sur Tendances §5.7). */
const CORRELATION_TARGET_DAYS = 14;

/** Lit l'identité enregistrée (ou chaîne vide). */
export async function getIdentity(): Promise<string> {
	return (await settingsRepo.get<string>(KEY_IDENTITY)) ?? "";
}

/** Enregistre l'identité (jamais obligatoire). */
export async function setIdentity(value: string): Promise<void> {
	await settingsRepo.set(KEY_IDENTITY, value.trim());
}

/** `t` liée au namespace export, dans la langue courante. */
function tx() {
	return i18n.getFixedT(i18n.language, "export");
}

/** Formate une local_date 'YYYY-MM-DD' en date lisible localisée (UTC figé). */
function formatDate(localDate: string): string {
	const [y, m, d] = localDate.split("-").map(Number);
	const locale = i18n.language === "en" ? "en-US" : "fr-FR";
	return new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Rend un point à consulter en une ligne traduite + interpolée (§5.8). */
export function consultLine(point: ConsultPoint, scoreKind: ScoreKind): string {
	const t = tx();
	switch (point.kind) {
		case "visibleBlood":
			return t("points.visibleBlood", {
				count: Number(point.data.days),
				days: point.data.days,
				total: point.data.total,
			});
		case "scoreAboveBaseline":
			return t("points.scoreAboveBaseline", {
				score: scoreKind === "sccai" ? "SCCAI" : "HBI",
				since: formatDate(String(point.data.since)),
			});
		case "highFatigue":
			return t("points.highFatigue", { count: Number(point.data.days), days: point.data.days });
		case "nocturnalStools":
			return t("points.nocturnalStools", { count: Number(point.data.count) });
		default:
			return t("points.allClear");
	}
}

/** Construit l'ensemble des `labels` traduits pour le rendu HTML. */
function reportLabels(report: ReportData): ReportLabels {
	const t = tx();
	const months = Math.round(report.period.days / 30);
	const diagnosis = report.profile.diagnosis;
	const diagnosisValue = diagnosis ? t(`report.diagnosis.${diagnosis}`) : "";
	return {
		lang: i18n.language === "en" ? "en" : "fr",
		brand: APP_NAME,
		reportTitle: t("report.title"),
		periodText: t("report.periodMonths", { count: months }),
		generatedOn: t("report.generatedOn", { date: formatDate(report.period.to) }),
		profileHeading: t("report.profileHeading"),
		diagnosisLabel: t("report.diagnosisLabel"),
		diagnosisValue,
		diagnosisYearLabel: t("report.diagnosisYearLabel"),
		identityLabel: t("report.identityLabel"),
		scoreHeading:
			report.scoreKind === "sccai" ? t("report.scoreHeadingSccai") : t("report.scoreHeadingHbi"),
		scoreCaption: t("report.scoreCaption"),
		scoreEmpty: t("report.scoreEmpty"),
		bandLabels: {
			remission: t("report.bands.remission"),
			mild: t("report.bands.mild"),
			moderate: t("report.bands.moderate"),
			severe: t("report.bands.severe"),
		},
		weeklyHeading: t("report.weeklyHeading"),
		weeklyEmpty: t("report.weeklyEmpty"),
		weekWord: t("report.weekWord"),
		col: {
			week: t("report.col.week"),
			stools: t("report.col.stools"),
			bloodDays: t("report.col.bloodDays"),
			worstPain: t("report.col.worstPain"),
			weight: t("report.col.weight"),
		},
		consultHeading: t("report.consultHeading"),
		consultLines: report.consultPoints.map((p) => consultLine(p, report.scoreKind)),
		associationsHeading: t("report.associationsHeading"),
		associationsText: report.associations.ready
			? t("report.associationsReady")
			: t("report.associationsCountdown", { count: report.associations.countdown }),
		associationLines: report.associations.items.map((a) =>
			t("report.associationLine", {
				count: a.n,
				name: a.displayName,
				signal: t(`report.associationSignals.${a.signal}`, { defaultValue: a.signal }),
			}),
		),
		naValue: t("report.na"),
		disclaimer: t("report.disclaimer"),
	};
}

export interface ReportBundle {
	report: ReportData;
	/** Points à consulter déjà rendus (pour l'aperçu natif). */
	consultLines: string[];
}

/** Rassemble les données de la période et construit le rapport (PUR ensuite). */
export async function loadReport(periodDays: ReportPeriodDays): Promise<ReportBundle> {
	const today = nowEntryTimestamp().localDate;
	const fromDate = localDateDaysAgo(periodDays - 1);

	const [committed, extras, profile, identity, docDates, associations] = await Promise.all([
		listCommittedSince(fromDate),
		listExtrasSince(fromDate),
		getProfile(),
		getIdentity(),
		documentedLocalDates(),
		loadAssociations(),
	]);

	const extrasByDate = new Map(
		extras.map((e) => [e.localDate, { complications: e.complications, weightKg: e.weightKg }]),
	);

	// Top associations éligibles → alimentent le PDF (nom/attribut déjà traduit).
	const tLog = i18n.getFixedT(i18n.language, "log");
	const reportAssociations = topAssociations(associations, 3).map((a) => ({
		displayName: a.kind === "trigger" ? tLog(`triggers.${a.key}`) : a.displayName,
		signal: a.signal,
		n: a.n,
	}));

	const report = buildReport({
		periodDays,
		fromDate,
		toDate: today,
		profile: { diagnosis: profile?.diagnosis, diagnosisYear: profile?.diagnosisYear },
		identity,
		entries: committed as ReportEntry[],
		extrasByDate,
		topAssociations: reportAssociations,
		correlationsReady: reportAssociations.length > 0,
		correlationsCountdown:
			associations.daysUntilEligible || Math.max(0, CORRELATION_TARGET_DAYS - docDates.length),
	});

	return {
		report,
		consultLines: report.consultPoints.map((p) => consultLine(p, report.scoreKind)),
	};
}

/** Rend le HTML autonome à partir d'un rapport déjà construit. */
export function renderHtml(report: ReportData): string {
	return renderReportHtml(report, reportLabels(report));
}

export interface GenerateResult {
	shared: boolean;
}

/**
 * Génère le PDF et déclenche le partage.
 * - Natif : `Print.printToFileAsync` → `Sharing.shareAsync`.
 * - Web : `printAsync` peu fiable → ouvre le HTML dans un nouvel onglet (blob
 *   URL), l'utilisateur imprime/enregistre en PDF depuis le navigateur.
 * JAMAIS silencieux : lève en cas d'échec (l'appelant affiche snackbar + retry).
 */
export async function generatePdf(report: ReportData): Promise<GenerateResult> {
	const html = renderHtml(report);

	if (Platform.OS === "web") {
		const blob = new Blob([html], { type: "text/html" });
		const url = URL.createObjectURL(blob);
		const win = window.open(url, "_blank");
		if (!win) {
			URL.revokeObjectURL(url);
			throw new Error("export-web-popup-blocked");
		}
		return { shared: true };
	}

	const { uri } = await Print.printToFileAsync({ html });
	let shared = false;
	if (await isAvailableAsync()) {
		await shareAsync(uri, {
			mimeType: "application/pdf",
			dialogTitle: tx()("title"),
			UTI: "com.adobe.pdf",
		});
		shared = true;
	}
	return { shared };
}
