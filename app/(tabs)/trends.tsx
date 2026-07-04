import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, type ChartBand, ChipTrigger, LineChart } from "@/components/ui";
import { localDateDaysAgo, nowEntryTimestamp } from "@/domain/dates";
import {
	dailyScoreSeries,
	groupEntriesByDate,
	type ScoreDayEntry,
	type ScoreKind,
	scoreKindForDiagnosis,
} from "@/domain/scoreSeries";
import { datesInclusive } from "@/domain/streak";
import { type WeeklyDigest, weeklyDigest } from "@/domain/weeklyDigest";
import {
	getDay as getExtrasDay,
	listSince as listExtrasSince,
	setComplications,
} from "@/repositories/dailyExtrasRepo";
import { listCommittedSince as listMealsSince } from "@/repositories/mealRepo";
import { getProfile } from "@/repositories/profileRepo";
import { listCommittedSince } from "@/repositories/symptomRepo";
import { documentedLocalDates } from "@/services/streakService";
import { useTheme } from "@/theme";

const COMPLICATION_KEYS = [
	"arthralgia",
	"uveitis",
	"erythema_nodosum",
	"aphthae",
	"fissure",
	"fistula",
	"abscess",
] as const;

// Bandes de sévérité en fonds PÂLES (§3) — vert rémission, ambre gradué, JAMAIS rouge.
const BAND_COLORS = {
	remission: "rgba(16, 185, 129, 0.12)",
	mild: "rgba(245, 158, 11, 0.07)",
	moderate: "rgba(245, 158, 11, 0.14)",
	severe: "rgba(245, 158, 11, 0.24)",
} as const;

interface TrendsData {
	scoreKind: ScoreKind;
	undiagnosed: boolean;
	scoreSeries: (number | null)[];
	stoolsPerDay: (number | null)[];
	painPerDay: (number | null)[];
	fatiguePerDay: (number | null)[];
	digest: WeeklyDigest;
	countdown: number;
	todayComplications: string[];
}

const EMPTY: TrendsData = {
	scoreKind: "hbi",
	undiagnosed: true,
	scoreSeries: [],
	stoolsPerDay: [],
	painPerDay: [],
	fatiguePerDay: [],
	digest: {
		documentedDays: 0,
		totalStools: 0,
		avgStools: null,
		bloodDays: 0,
		notable: { kind: "empty" },
	},
	countdown: 14,
	todayComplications: [],
};

export default function TrendsScreen() {
	const { t } = useTranslation("trends");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();

	const [period, setPeriod] = useState<30 | 90>(30);
	const [data, setData] = useState<TrendsData>(EMPTY);

	const today = nowEntryTimestamp().localDate;
	const chartWidth = width - theme.spacing.lg * 2 - theme.spacing.xl * 2;

	const reload = useCallback(
		(days: number) => {
			const since = localDateDaysAgo(days - 1);
			Promise.all([
				listCommittedSince(since),
				listMealsSince(since),
				listExtrasSince(since),
				getProfile(),
				documentedLocalDates(),
				getExtrasDay(today),
			]).then(([committed, _meals, extras, profile, docDates, todayExtra]) => {
				const dates = datesInclusive(since, today);
				const entriesByDate = groupEntriesByDate(committed);
				const extrasByDate = new Map(extras.map((e) => [e.localDate, e]));
				const scoreKind = scoreKindForDiagnosis(profile?.diagnosis);

				// Agrégats par jour (null = jour non documenté, jamais un zéro fabriqué).
				const stoolsPerDay = dates.map((d) =>
					entriesByDate.has(d)
						? (entriesByDate.get(d) ?? []).filter((e) => e.kind === "stool").length
						: null,
				);
				const worst = (d: string, field: "pain" | "fatigue"): number | null => {
					const es = entriesByDate.get(d);
					if (!es) return null;
					const vals = es.map((e) => e[field]).filter((v): v is number => v != null);
					return vals.length ? Math.max(...vals) : null;
				};
				const painPerDay = dates.map((d) => worst(d, "pain"));
				const fatiguePerDay = dates.map((d) => worst(d, "fatigue"));
				const bloodByDate = new Map<string, number>();
				for (const d of dates) {
					const es = entriesByDate.get(d) ?? [];
					bloodByDate.set(d, Math.max(0, ...es.map((e) => e.blood ?? 0)));
				}

				// Bilan hebdo : 7 derniers jours + moyenne des 7 précédents.
				const last7Stools = stoolsPerDay.slice(-7);
				const prev7 = stoolsPerDay.slice(-14, -7).filter((v): v is number => v != null);
				const previousAvgStools = prev7.length
					? prev7.reduce((a, b) => a + b, 0) / prev7.length
					: null;
				const last7Dates = dates.slice(-7);
				const bloodDays = last7Dates.filter((d) => (bloodByDate.get(d) ?? 0) > 0).length;

				setData({
					scoreKind,
					undiagnosed: !profile?.diagnosis || profile.diagnosis === "undiagnosed",
					scoreSeries: dailyScoreSeries(
						dates,
						entriesByDate as Map<string, ScoreDayEntry[]>,
						extrasByDate,
						scoreKind,
					),
					stoolsPerDay,
					painPerDay,
					fatiguePerDay,
					digest: weeklyDigest({ dailyStools: last7Stools, bloodDays, previousAvgStools }),
					countdown: Math.max(0, 14 - docDates.length),
					todayComplications: todayExtra?.complications ?? [],
				});
			});
		},
		[today],
	);

	useFocusEffect(
		useCallback(() => {
			reload(period);
		}, [reload, period]),
	);

	const toggleComplication = (key: string) => {
		const next = data.todayComplications.includes(key)
			? data.todayComplications.filter((c) => c !== key)
			: [...data.todayComplications, key];
		setData((d) => ({ ...d, todayComplications: next }));
		void setComplications(today, next);
	};

	const scoreMax =
		data.scoreKind === "sccai"
			? Math.max(12, ...numbers(data.scoreSeries))
			: Math.max(18, ...numbers(data.scoreSeries));
	const scoreBands: ChartBand[] =
		data.scoreKind === "sccai"
			? [
					{ from: 0, to: 5, color: BAND_COLORS.remission },
					{ from: 5, to: 12, color: BAND_COLORS.moderate },
					{ from: 12, to: scoreMax, color: BAND_COLORS.severe },
				]
			: [
					{ from: 0, to: 5, color: BAND_COLORS.remission },
					{ from: 5, to: 8, color: BAND_COLORS.mild },
					{ from: 8, to: 16, color: BAND_COLORS.moderate },
					{ from: 16, to: scoreMax, color: BAND_COLORS.severe },
				];

	const hasScore = data.scoreSeries.some((v) => v != null);

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			<ScrollView
				contentContainerStyle={{
					padding: theme.spacing.lg,
					paddingTop: insets.top + theme.spacing.md,
					paddingBottom: insets.bottom + 24,
					gap: theme.spacing.lg,
				}}
			>
				<Text style={[theme.typography.title, { color: theme.colors.text }]}>{t("title")}</Text>

				{/* Sélecteur de période 30 / 90 j. */}
				<View style={styles.segment}>
					{([30, 90] as const).map((p) => {
						const active = period === p;
						return (
							<Pressable
								key={p}
								testID={`period-${p}`}
								accessibilityRole="button"
								accessibilityState={{ selected: active }}
								onPress={() => setPeriod(p)}
								style={[
									styles.segmentCell,
									{
										backgroundColor: active ? theme.colors.text : theme.colors.surface,
										borderRadius: theme.radii.pill,
									},
								]}
							>
								<Text
									style={[
										theme.typography.label,
										{ color: active ? theme.colors.background : theme.colors.textMuted },
									]}
								>
									{t(`period.${p}`)}
								</Text>
							</Pressable>
						);
					})}
				</View>

				{/* Bilan « Votre semaine ». */}
				<Card testID="trends-week" style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
						{t("week.title")}
					</Text>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{t("week.days", { count: data.digest.documentedDays })} ·{" "}
						{t("week.stools", { count: data.digest.totalStools })}
					</Text>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{t(`week.notable.${data.digest.notable.kind}`, {
							count: data.digest.notable.count ?? 0,
						})}
					</Text>
				</Card>

				{/* Score HBI / SCCAI. */}
				<Card style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
						{data.scoreKind === "sccai" ? t("score.titleSccai") : t("score.titleHbi")}
					</Text>
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{data.scoreKind === "sccai" ? t("score.captionSccai") : t("score.captionHbi")}
					</Text>
					{data.undiagnosed ? (
						<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
							{t("score.undiagnosedNote")}
						</Text>
					) : null}
					{hasScore ? (
						<>
							<LineChart
								testID="chart-score"
								data={data.scoreSeries}
								color={theme.colors.text}
								width={chartWidth}
								min={0}
								max={scoreMax}
								bands={scoreBands}
							/>
							<BandLegend kind={data.scoreKind} />
						</>
					) : (
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("score.empty")}
						</Text>
					)}
				</Card>

				<ChartCard
					title={t("stools.title")}
					data={data.stoolsPerDay}
					color={theme.colors.stool}
					width={chartWidth}
				/>
				<ChartCard
					title={t("pain.title")}
					data={data.painPerDay}
					color={theme.colors.pain}
					width={chartWidth}
					max={3}
				/>
				<ChartCard
					title={t("fatigue.title")}
					data={data.fatiguePerDay}
					color={theme.colors.energy}
					width={chartWidth}
					max={3}
				/>

				{/* Associations alimentaires — placeholder Phase 4 + compte à rebours honnête. */}
				<Card testID="trends-correlations" style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
						{t("correlations.title")}
					</Text>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{data.countdown > 0
							? t("correlations.countdown", { count: data.countdown })
							: t("correlations.ready")}
					</Text>
					<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
						{t("correlations.note")}
					</Text>
				</Card>

				{/* Complications du jour (édite daily_extras). */}
				<Card style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
						{t("complications.title")}
					</Text>
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{t("complications.hint")}
					</Text>
					<View style={styles.chipWrap}>
						{COMPLICATION_KEYS.map((key) => (
							<ChipTrigger
								key={key}
								label={t(`complications.labels.${key}`)}
								tint="stool"
								selected={data.todayComplications.includes(key)}
								onPress={() => toggleComplication(key)}
							/>
						))}
					</View>
				</Card>
			</ScrollView>
		</View>
	);
}

/** Nombres non nuls d'une série (utilitaire pour les bornes). */
function numbers(series: (number | null)[]): number[] {
	return series.filter((v): v is number => v != null);
}

function ChartCard({
	title,
	data,
	color,
	width,
	max,
}: {
	title: string;
	data: (number | null)[];
	color: string;
	width: number;
	max?: number;
}) {
	const { t } = useTranslation("trends");
	const theme = useTheme();
	const hasData = data.some((v) => v != null);
	return (
		<Card style={{ gap: theme.spacing.sm }}>
			<Text style={[theme.typography.heading, { color: theme.colors.text }]}>{title}</Text>
			{hasData ? (
				<LineChart data={data} color={color} width={width} min={0} max={max} />
			) : (
				<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
					{t("chartEmpty")}
				</Text>
			)}
		</Card>
	);
}

function BandLegend({ kind }: { kind: ScoreKind }) {
	const { t } = useTranslation("trends");
	const theme = useTheme();
	const bands =
		kind === "sccai"
			? (["remission", "moderate", "severe"] as const)
			: (["remission", "mild", "moderate", "severe"] as const);
	return (
		<View style={styles.legend}>
			{bands.map((b) => (
				<View key={b} style={styles.legendItem}>
					<View
						style={[
							styles.legendDot,
							{ backgroundColor: BAND_COLORS[b], borderColor: theme.colors.border },
						]}
					/>
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{t(`score.bands.${b}`)}
					</Text>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	segment: { flexDirection: "row", gap: 8 },
	segmentCell: {
		flex: 1,
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
	legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
	legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
});
