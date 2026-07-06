import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Pressable,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import {
	Card,
	type ChartBand,
	ChipTrigger,
	LineChart,
	Segmented,
	type SegmentedOption,
} from "@/components/ui";
import { localDateDaysAgo, nowEntryTimestamp } from "@/domain/dates";
import type { InsightAggregatesInput } from "@/domain/insightAggregates";
import {
	dailyScoreSeries,
	groupEntriesByDate,
	type ScoreDayEntry,
	type ScoreKind,
	scoreKindForDiagnosis,
} from "@/domain/scoreSeries";
import { datesInclusive } from "@/domain/streak";
import { type WeeklyDigest, weeklyDigest } from "@/domain/weeklyDigest";
import { WeeklyInsightCard } from "@/features/trends/WeeklyInsightCard";
import {
	getDay as getExtrasDay,
	listSince as listExtrasSince,
	setComplications,
} from "@/repositories/dailyExtrasRepo";
import { listCommittedSince as listMealsSince } from "@/repositories/mealRepo";
import { getProfile } from "@/repositories/profileRepo";
import { listCommittedSince } from "@/repositories/symptomRepo";
import {
	type DisplayAssociation,
	loadAssociations,
	topAssociations,
} from "@/services/correlationService";
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
	associations: DisplayAssociation[];
	todayComplications: string[];
	/** Entrée d'agrégats ANONYMES (7 j) pour l'insight IA hebdo (§7). */
	insightInput: InsightAggregatesInput;
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
	associations: [],
	todayComplications: [],
	insightInput: {
		dailyStools: [],
		painValues: [],
		bloodByDay: [],
		scores: [],
		scoreKind: "hbi",
		triggerAssociations: [],
		adherencePct: null,
	},
};

export default function TrendsScreen() {
	const { t } = useTranslation("trends");
	const { t: tx } = useTranslation("export");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { width } = useWindowDimensions();

	const [period, setPeriod] = useState<30 | 90>(30);
	const [data, setData] = useState<TrendsData>(EMPTY);
	const [refreshing, setRefreshing] = useState(false);

	const today = nowEntryTimestamp().localDate;
	const chartWidth = width - theme.spacing.lg * 2 - theme.spacing.xl * 2;

	const reload = useCallback(
		(days: number, forceAssociations = false) => {
			const since = localDateDaysAgo(days - 1);
			return Promise.all([
				listCommittedSince(since),
				listMealsSince(since),
				listExtrasSince(since),
				getProfile(),
				documentedLocalDates(),
				getExtrasDay(today),
				loadAssociations(forceAssociations),
			]).then(([committed, _meals, extras, profile, docDates, todayExtra, associations]) => {
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

				const scoreSeries = dailyScoreSeries(
					dates,
					entriesByDate as Map<string, ScoreDayEntry[]>,
					extrasByDate,
					scoreKind,
				);
				const displayAssociations = topAssociations(associations, 5);

				// Agrégats ANONYMES (7 j) pour l'insight IA hebdo (§7, §2 loi 4) :
				// uniquement des nombres et des libellés de déclencheurs génériques.
				const insightInput: InsightAggregatesInput = {
					dailyStools: last7Stools,
					painValues: painPerDay.slice(-7),
					bloodByDay: last7Dates.map((d) => bloodByDate.get(d) ?? 0),
					scores: scoreSeries.slice(-7).filter((v): v is number => v != null),
					scoreKind,
					triggerAssociations: displayAssociations
						.filter((a) => a.kind === "trigger")
						.map((a) => a.key),
					adherencePct: null,
				};

				setData({
					scoreKind,
					undiagnosed: !profile?.diagnosis || profile.diagnosis === "undiagnosed",
					scoreSeries,
					stoolsPerDay,
					painPerDay,
					fatiguePerDay,
					digest: weeklyDigest({ dailyStools: last7Stools, bloodDays, previousAvgStools }),
					countdown: associations.daysUntilEligible,
					associations: displayAssociations,
					todayComplications: todayExtra?.complications ?? [],
					insightInput,
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

	const onRefresh = useCallback(() => {
		setRefreshing(true);
		reload(period, true).finally(() => setRefreshing(false));
	}, [reload, period]);

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

	const periodOptions: SegmentedOption[] = [
		{ value: "30", label: t("period.30"), testID: "period-30" },
		{ value: "90", label: t("period.90"), testID: "period-90" },
	];

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			<ScrollView
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
				contentContainerStyle={{
					padding: theme.spacing.lg,
					paddingTop: insets.top + theme.spacing.md,
					paddingBottom: insets.bottom + 24,
					gap: theme.spacing.lg,
				}}
			>
				<Text style={[theme.typography.title, { color: theme.colors.text }]}>{t("title")}</Text>

				{/* Préparer ma consultation → écran Export médecin (§5.8). */}
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={tx("card.trendsTitle")}
					testID="trends-export"
					onPress={() => router.push("/export")}
				>
					<Card style={styles.exportCard}>
						<View style={[styles.exportIcon, { backgroundColor: theme.colors.brandSoft }]}>
							<Icon name="stethoscope" size={22} color={theme.colors.brand} strokeWidth={1.8} />
						</View>
						<View style={styles.exportBody}>
							<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
								{tx("card.trendsTitle")}
							</Text>
							<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
								{tx("card.trendsBody")}
							</Text>
						</View>
						<Icon name="chevronRight" size={20} color={theme.colors.textFaint} />
					</Card>
				</Pressable>

				{/* Sélecteur de période 30 / 90 j. */}
				<Segmented
					options={periodOptions}
					value={String(period)}
					onChange={(v) => setPeriod(v === "90" ? 90 : 30)}
					accessibilityLabel={t("title")}
				/>

				{/* --- Résumé de la semaine. --- */}
				<SectionHeader label={t("sections.summary")} />

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

				{/* Insight IA de la semaine (§7) — Premium (sinon teaser discret). */}
				<WeeklyInsightCard input={data.insightInput} />

				{/* --- Courbes. --- */}
				<SectionHeader label={t("sections.charts")} />

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

				{/* --- Analyse. --- */}
				<SectionHeader label={t("sections.analysis")} />

				{/* Associations alimentaires — corrélations réelles + garde-fous (§5.7). */}
				<Card testID="trends-correlations" style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
						{t("correlations.title")}
					</Text>
					{data.countdown > 0 ? (
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("correlations.countdown", { count: data.countdown })}
						</Text>
					) : data.associations.length === 0 ? (
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("correlations.empty")}
						</Text>
					) : (
						<View style={{ gap: theme.spacing.md }}>
							{data.associations.map((a) => (
								<AssociationRow
									key={`${a.kind}-${a.key}-${a.signal}`}
									assoc={a}
									maxLift={Math.max(...data.associations.map((x) => x.lift), 1)}
								/>
							))}
						</View>
					)}
					<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
						{t("correlations.footer")}
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

/** En-tête de section discret en `overline` (§3). */
function SectionHeader({ label }: { label: string }) {
	const theme = useTheme();
	return (
		<Text
			style={[theme.typography.overline, styles.sectionHeader, { color: theme.colors.textFaint }]}
		>
			{label}
		</Text>
	);
}

/** Une ligne d'association observée : « Lactose associé à selles liquides · … ». */
function AssociationRow({ assoc, maxLift }: { assoc: DisplayAssociation; maxLift: number }) {
	const { t } = useTranslation(["trends", "log"]);
	const theme = useTheme();
	const label = assoc.kind === "trigger" ? t(`log:triggers.${assoc.key}`) : assoc.displayName;
	const signal = t(`correlations.signals.${assoc.signal}`, { defaultValue: assoc.signal });
	// Barre de « lift » relative — force de l'association observée, jamais < 12 %
	// pour rester lisible. Purement indicatif (garde-fou « pas une preuve »).
	const fill = Math.max(0.12, Math.min(1, assoc.lift / maxLift));
	return (
		<View testID="association-row" style={styles.assocRow}>
			<ChipTrigger label={label} tint="meal" />
			<View style={styles.assocText}>
				<Text style={[theme.typography.body, { color: theme.colors.text }]}>
					{t("correlations.associatedWith")} {signal}
				</Text>
				<View style={[styles.liftTrack, { backgroundColor: theme.colors.surface }]}>
					<View
						style={[
							styles.liftFill,
							{ backgroundColor: theme.colors.meal, width: `${Math.round(fill * 100)}%` },
						]}
					/>
				</View>
				<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
					{t("correlations.observed", { count: assoc.n })}
				</Text>
			</View>
		</View>
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
	sectionHeader: { marginBottom: -4 },
	chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	assocRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	assocText: { flex: 1, gap: 4 },
	liftTrack: { height: 4, borderRadius: 999, overflow: "hidden" },
	liftFill: { height: 4, borderRadius: 999 },
	exportCard: { flexDirection: "row", alignItems: "center", gap: 14 },
	exportIcon: {
		width: 42,
		height: 42,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	exportBody: { flex: 1, gap: 2 },
	legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
	legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
	legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
});
