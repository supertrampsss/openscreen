/**
 * Rapport médecin → HTML autonome (§5.8) — module PUR & DÉTERMINISTE.
 *
 * Rend un document A4 imprimable : CSS inline, courbe HBI/SCCAI en SVG inline
 * (même logique que `LineChart` : polyline + bandes pâles + TROUS sur `null`),
 * tableaux hebdo, points à aborder, footer disclaimer.
 *
 * DÉTERMINISME (exigence §5.8) : aucun `Date.now()`, aucune couleur/timestamp
 * aléatoire, formatage numérique figé → même entrée = même sortie byte à byte.
 * La date « généré le » et TOUTES les chaînes traduites arrivent via `labels`
 * (le domaine ne dépend PAS d'i18next). FR/EN = deux jeux de `labels`.
 */

import type { ReportData } from "./exportReport";

/** Toutes les chaînes de rendu (pré-traduites et pré-interpolées par l'appelant). */
export interface ReportLabels {
	/** Code langue du document ('fr' | 'en') pour l'attribut <html lang>. */
	lang: string;
	/** Marque affichée dans l'en-tête + <title>. */
	brand: string;
	reportTitle: string;
	/** « Période : 30 derniers jours » (pré-rendu). */
	periodText: string;
	/** « Généré le 4 juillet 2026 » — date INJECTÉE (jamais Date.now()). */
	generatedOn: string;
	profileHeading: string;
	diagnosisLabel: string;
	/** Valeur lisible du diagnostic (« Maladie de Crohn »…), ou chaîne vide. */
	diagnosisValue: string;
	diagnosisYearLabel: string;
	/** Libellé de l'identité patient (n'apparaît que si `profile.identity`). */
	identityLabel: string;
	scoreHeading: string;
	scoreCaption: string;
	scoreEmpty: string;
	/** Libellés des bandes de sévérité (remission/mild/moderate/severe). */
	bandLabels: Record<string, string>;
	weeklyHeading: string;
	weeklyEmpty: string;
	weekWord: string;
	/** En-tête de la section observance (rendue seulement si `report.observance`). */
	observanceHeading?: string;
	/** Ligne d'observance déjà interpolée (« 7/8 prises sur la période »). */
	observanceText?: string;
	col: { week: string; stools: string; bloodDays: string; worstPain: string; weight: string };
	consultHeading: string;
	/** Lignes des points à aborder, déjà traduites/interpolées. */
	consultLines: string[];
	associationsHeading: string;
	associationsText: string;
	/** Lignes des associations observées (déjà traduites) — liste si non vide. */
	associationLines?: string[];
	/** Valeur affichée en l'absence de donnée (« — »). */
	naValue: string;
	/** Disclaimer exact (footer). */
	disclaimer: string;
}

/** Échappe le texte inséré dans le HTML (défense contre l'identité saisie). */
function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

interface Band {
	from: number;
	to: number;
	color: string;
	key: string;
}

// Bandes de sévérité en fonds PÂLES (§3) — vert rémission, ambre gradué, jamais rouge.
const BAND_COLORS = {
	remission: "rgba(16, 185, 129, 0.14)",
	mild: "rgba(245, 158, 11, 0.08)",
	moderate: "rgba(245, 158, 11, 0.16)",
	severe: "rgba(245, 158, 11, 0.26)",
} as const;

/** Bandes + borne haute de l'axe selon le type de score (aligné sur Tendances). */
function scoreScale(
	kind: ReportData["scoreKind"],
	values: number[],
): { max: number; bands: Band[] } {
	if (kind === "sccai") {
		const max = Math.max(12, ...values);
		return {
			max,
			bands: [
				{ from: 0, to: 5, color: BAND_COLORS.remission, key: "remission" },
				{ from: 5, to: 12, color: BAND_COLORS.moderate, key: "moderate" },
				{ from: 12, to: max, color: BAND_COLORS.severe, key: "severe" },
			],
		};
	}
	const max = Math.max(18, ...values);
	return {
		max,
		bands: [
			{ from: 0, to: 5, color: BAND_COLORS.remission, key: "remission" },
			{ from: 5, to: 8, color: BAND_COLORS.mild, key: "mild" },
			{ from: 8, to: 16, color: BAND_COLORS.moderate, key: "moderate" },
			{ from: 16, to: max, color: BAND_COLORS.severe, key: "severe" },
		],
	};
}

const CHART_W = 720;
const CHART_H = 240;
const PAD_X = 12;
const PAD_Y = 18;

/**
 * Courbe SVG déterministe (mirroir HTML de `LineChart`) : bandes pâles, ligne de
 * base, segments continus rompus sur `null`, points si ≤ 31 échantillons.
 */
function svgChart(series: (number | null)[], max: number, bands: Band[], color: string): string {
	const innerW = CHART_W - PAD_X * 2;
	const innerH = CHART_H - PAD_Y * 2;
	const lo = 0;
	const hi = max <= lo ? lo + 1 : max;
	const n = series.length;
	const xAt = (i: number) => PAD_X + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
	const yAt = (v: number) => PAD_Y + innerH - ((v - lo) / (hi - lo)) * innerH;

	// Segments continus (rompus sur les null) — mêmes règles que LineChart.
	const segments: string[] = [];
	let current = "";
	series.forEach((v, i) => {
		if (v == null) {
			if (current) {
				segments.push(current);
				current = "";
			}
			return;
		}
		current += `${current ? " L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
	});
	if (current) segments.push(current);

	const rects = bands
		.map((b) => {
			const yTop = yAt(Math.min(b.to, hi));
			const yBottom = yAt(Math.max(b.from, lo));
			const h = Math.max(0, yBottom - yTop);
			return `<rect x="${PAD_X}" y="${yTop.toFixed(1)}" width="${innerW}" height="${h.toFixed(1)}" fill="${b.color}" />`;
		})
		.join("");

	const paths = segments
		.map(
			(d) =>
				`<path d="${d}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />`,
		)
		.join("");

	const dots =
		n <= 31
			? series
					.map((v, i) =>
						v == null
							? ""
							: `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="3" fill="${color}" />`,
					)
					.join("")
			: "";

	const baseline = `<line x1="${PAD_X}" y1="${(CHART_H - PAD_Y).toFixed(1)}" x2="${CHART_W - PAD_X}" y2="${(CHART_H - PAD_Y).toFixed(1)}" stroke="#E5E5EA" stroke-width="1" />`;

	return `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" width="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${rects}${baseline}${paths}${dots}</svg>`;
}

/** Légende des bandes (swatch pâle + libellé). */
function bandLegend(bands: Band[], labels: ReportLabels): string {
	return `<div class="legend">${bands
		.map(
			(b) =>
				`<span class="legend-item"><span class="swatch" style="background:${b.color}"></span>${esc(labels.bandLabels[b.key] ?? b.key)}</span>`,
		)
		.join("")}</div>`;
}

/** Tableau hebdomadaire selles/sang/douleur/poids. */
function weeklyTable(report: ReportData, labels: ReportLabels): string {
	if (report.weekly.length === 0) {
		return `<p class="muted">${esc(labels.weeklyEmpty)}</p>`;
	}
	const na = esc(labels.naValue);
	const rows = report.weekly
		.map((w) => {
			const weight = w.weightKg != null ? `${w.weightKg.toFixed(1)} kg` : na;
			const pain = w.worstPain != null ? String(w.worstPain) : na;
			return `<tr><td>${esc(labels.weekWord)} ${w.weekNumber}</td><td>${w.stools}</td><td>${w.bloodDays}</td><td>${pain}</td><td>${weight}</td></tr>`;
		})
		.join("");
	return `<table class="weekly"><thead><tr><th>${esc(labels.col.week)}</th><th>${esc(labels.col.stools)}</th><th>${esc(labels.col.bloodDays)}</th><th>${esc(labels.col.worstPain)}</th><th>${esc(labels.col.weight)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Rend le rapport en un document HTML autonome, imprimable A4. */
export function renderReportHtml(report: ReportData, labels: ReportLabels): string {
	const values = report.scoreSeries.filter((v): v is number => v != null);
	const hasScore = values.length > 0;
	const { max, bands } = scoreScale(report.scoreKind, values);

	const identityRow = report.profile.identity
		? `<div class="field"><span class="field-label">${esc(labels.identityLabel)}</span><span class="field-value">${esc(report.profile.identity)}</span></div>`
		: "";
	const diagnosisRow = labels.diagnosisValue
		? `<div class="field"><span class="field-label">${esc(labels.diagnosisLabel)}</span><span class="field-value">${esc(labels.diagnosisValue)}</span></div>`
		: "";
	const yearRow =
		report.profile.diagnosisYear != null
			? `<div class="field"><span class="field-label">${esc(labels.diagnosisYearLabel)}</span><span class="field-value">${report.profile.diagnosisYear}</span></div>`
			: "";

	const scoreBlock = hasScore
		? `${svgChart(report.scoreSeries, max, bands, "#0A0A0A")}${bandLegend(bands, labels)}`
		: `<p class="muted">${esc(labels.scoreEmpty)}</p>`;

	const consultItems =
		labels.consultLines.length > 0
			? `<ul class="consult">${labels.consultLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
			: "";

	// Observance (§5.9) : section rendue uniquement si des traitements à cadence
	// existent (sinon `report.observance` est null → aucune sortie, snapshot stable).
	const observanceSection =
		report.observance && labels.observanceHeading && labels.observanceText
			? `\n\n<section>\n<h2>${esc(labels.observanceHeading)}</h2>\n<p>${esc(labels.observanceText)}</p>\n</section>`
			: "";

	const associationsBlock =
		labels.associationLines && labels.associationLines.length > 0
			? `<ul class="consult">${labels.associationLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
			: `<p class="muted">${esc(labels.associationsText)}</p>`;

	return `<!doctype html>
<html lang="${esc(labels.lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(labels.brand)} — ${esc(labels.reportTitle)}</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0A0A0A; background: #FFFFFF; font-size: 13px; line-height: 1.45; }
.page { max-width: 760px; margin: 0 auto; padding: 32px 28px; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0A0A0A; padding-bottom: 12px; margin-bottom: 20px; }
.brand { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
.report-title { font-size: 13px; color: #6B6B70; margin-top: 2px; }
.meta { text-align: right; font-size: 12px; color: #6B6B70; }
section { margin-bottom: 22px; }
h2 { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
.caption { font-size: 12px; color: #6B6B70; margin: 0 0 8px; }
.muted { color: #6B6B70; }
.fields { display: flex; flex-wrap: wrap; gap: 8px 28px; }
.field { display: flex; flex-direction: column; }
.field-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1A6; }
.field-value { font-size: 15px; font-weight: 600; }
.chart { border: 1px solid #E5E5EA; border-radius: 12px; padding: 12px; }
.legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; font-size: 11px; color: #6B6B70; }
.legend-item { display: inline-flex; align-items: center; gap: 5px; }
.swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #E5E5EA; display: inline-block; }
table.weekly { width: 100%; border-collapse: collapse; font-size: 12px; }
table.weekly th, table.weekly td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #E5E5EA; }
table.weekly th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #A1A1A6; font-weight: 600; }
table.weekly td:not(:first-child), table.weekly th:not(:first-child) { text-align: right; }
ul.consult { margin: 0; padding-left: 18px; }
ul.consult li { margin-bottom: 6px; }
footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #E5E5EA; font-size: 11px; color: #A1A1A6; }
@media print { .page { padding: 0; } body { font-size: 12px; } }
</style>
</head>
<body>
<div class="page">
<header>
<div>
<div class="brand">${esc(labels.brand)}</div>
<div class="report-title">${esc(labels.reportTitle)}</div>
</div>
<div class="meta">${esc(labels.periodText)}<br />${esc(labels.generatedOn)}</div>
</header>

<section>
<h2>${esc(labels.profileHeading)}</h2>
<div class="fields">${identityRow}${diagnosisRow}${yearRow}</div>
</section>

<section>
<h2>${esc(labels.scoreHeading)}</h2>
<p class="caption">${esc(labels.scoreCaption)}</p>
<div class="chart">${scoreBlock}</div>
</section>

<section>
<h2>${esc(labels.weeklyHeading)}</h2>
${weeklyTable(report, labels)}
</section>

<section>
<h2>${esc(labels.consultHeading)}</h2>
${consultItems}
</section>${observanceSection}

<section>
<h2>${esc(labels.associationsHeading)}</h2>
${associationsBlock}
</section>

<footer>${esc(labels.disclaimer)}</footer>
</div>
</body>
</html>`;
}
