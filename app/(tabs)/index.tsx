import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BristolIcon, type BristolType } from "@/components/BristolIcon";
import { Card, RingCard, Sparkline, type WeekDay, WeekStrip } from "@/components/ui";
import type { SymptomEntry } from "@/db/schema";
import {
	classifyDay,
	parseProfileBaseline,
	type StoolNormal,
	stoolNormalFromCounts,
} from "@/domain/baseline";
import {
	describeLocalDate,
	formatClock,
	last7LocalDates,
	localDateDaysAgo,
	nowEntryTimestamp,
} from "@/domain/dates";
import {
	dailyScoreSeries,
	groupEntriesByDate,
	type ScoreDayEntry,
	type ScoreKind,
	scoreKindForDiagnosis,
} from "@/domain/scoreSeries";
import { FlareBanner } from "@/features/flare/FlareBanner";
import { AddSheet } from "@/features/log/AddSheet";
import { StoolSheet } from "@/features/log/StoolSheet";
import { SymptomSheet } from "@/features/log/SymptomSheet";
import { StreakFlame } from "@/features/streak/StreakFlame";
import { listSince as listExtrasSince } from "@/repositories/dailyExtrasRepo";
import { listCommittedSince as listMealsSince } from "@/repositories/mealRepo";
import { getProfile } from "@/repositories/profileRepo";
import { listCommittedSince, listRecent } from "@/repositories/symptomRepo";
import { useStreak } from "@/services/streakService";
import { useTheme } from "@/theme";

interface HomeData {
	recent: SymptomEntry[];
	documentedDates: string[];
	stoolsToday: number;
	ringProgress: number;
	normal: StoolNormal | null;
	dayClass: "within" | "busier" | null;
	painToday: number | null;
	energyToday: number | null;
	mealsToday: number;
	scoreKind: ScoreKind;
	scoreSeries: (number | null)[];
	bloodToday: number;
	urgencyToday: number;
}

const EMPTY: HomeData = {
	recent: [],
	documentedDates: [],
	stoolsToday: 0,
	ringProgress: 0,
	normal: null,
	dayClass: null,
	painToday: null,
	energyToday: null,
	mealsToday: 0,
	scoreKind: "hbi",
	scoreSeries: [],
	bloodToday: 0,
	urgencyToday: 0,
};

export default function HomeScreen() {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { width } = useWindowDimensions();
	const { streak, reload: reloadStreak } = useStreak();

	const [data, setData] = useState<HomeData>(EMPTY);
	const [addOpen, setAddOpen] = useState(false);
	const [stoolOpen, setStoolOpen] = useState(false);
	const [symptomOpen, setSymptomOpen] = useState(false);
	const [resume, setResume] = useState<SymptomEntry | null>(null);
	const [heroPage, setHeroPage] = useState(0);

	const today = nowEntryTimestamp().localDate;

	const reload = useCallback(() => {
		const since14 = localDateDaysAgo(13);
		const since7 = localDateDaysAgo(6);
		Promise.all([
			listCommittedSince(since14),
			listMealsSince(since14),
			listExtrasSince(since7),
			getProfile(),
			listRecent(25),
		]).then(([committed, meals, extras, profile, recent]) => {
			const last7 = last7LocalDates();
			const entriesByDate = groupEntriesByDate(committed as ScoreDayEntry[]);
			const extrasByDate = new Map(extras.map((e) => [e.localDate, e]));

			const stoolsToday = committed.filter(
				(e) => e.localDate === today && e.kind === "stool",
			).length;
			const hasSymptomToday = committed.some((e) => e.localDate === today && e.kind === "symptom");
			const mealsToday = meals.filter((m) => m.localDate === today).length;
			const thirds =
				(stoolsToday > 0 ? 1 : 0) + (hasSymptomToday ? 1 : 0) + (mealsToday > 0 ? 1 : 0);

			// Baseline : compte de selles par jour documenté (≥1 entrée commitée).
			const stoolByDate = new Map<string, number>();
			for (const e of committed) {
				if (!stoolByDate.has(e.localDate)) stoolByDate.set(e.localDate, 0);
				if (e.kind === "stool")
					stoolByDate.set(e.localDate, (stoolByDate.get(e.localDate) ?? 0) + 1);
			}
			const dailyCounts = [...stoolByDate.values()];
			const normal =
				parseProfileBaseline(profile?.baselineStools) ?? stoolNormalFromCounts(dailyCounts);

			// Douleur / énergie du jour : valeur la plus récente renseignée (committed trié desc).
			const todayEntries = committed.filter((e) => e.localDate === today);
			const painToday = todayEntries.find((e) => e.pain != null)?.pain ?? null;
			const fatigueToday = todayEntries.find((e) => e.fatigue != null)?.fatigue ?? null;
			const bloodToday = Math.max(0, ...todayEntries.map((e) => e.blood ?? 0));
			const urgencyToday = Math.max(0, ...todayEntries.map((e) => e.urgency ?? 0));

			const scoreKind = scoreKindForDiagnosis(profile?.diagnosis);

			setData({
				recent,
				documentedDates: [...stoolByDate.keys()],
				stoolsToday,
				ringProgress: thirds / 3,
				normal,
				dayClass: normal ? classifyDay(stoolsToday, normal) : null,
				painToday,
				energyToday: fatigueToday != null ? 3 - fatigueToday : null,
				mealsToday,
				scoreKind,
				scoreSeries: dailyScoreSeries(last7, entriesByDate, extrasByDate, scoreKind),
				bloodToday,
				urgencyToday,
			});
		});
	}, [today]);

	useFocusEffect(
		useCallback(() => {
			reload();
			reloadStreak();
		}, [reload, reloadStreak]),
	);

	const onLogged = useCallback(() => {
		reload();
		reloadStreak();
	}, [reload, reloadStreak]);

	const documentedSet = new Set(data.documentedDates);
	const weekDays: WeekDay[] = last7LocalDates().map((date) => {
		const { label, dayNumber } = describeLocalDate(date);
		return {
			date,
			label,
			dayNumber,
			documented: documentedSet.has(date),
			isToday: date === today,
		};
	});

	const openFor = (entry: SymptomEntry) => {
		setResume(entry);
		if (entry.kind === "stool") setStoolOpen(true);
		else setSymptomOpen(true);
	};

	const pickAction = (action: "stool" | "symptom") => {
		setAddOpen(false);
		setResume(null);
		if (action === "stool") setStoolOpen(true);
		else setSymptomOpen(true);
	};

	const goToDay = (date: string) => {
		router.push({ pathname: "/journal", params: { date } });
	};

	const heroWidth = width - theme.spacing.lg * 2;
	const onHeroScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const page = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, heroWidth));
		if (page !== heroPage) setHeroPage(page);
	};

	const unit = t(data.stoolsToday === 1 ? "home.stoolsUnit_one" : "home.stoolsUnit_other");
	const normalText = data.normal ? formatNormal(data.normal) : null;
	const stateText = data.normal
		? data.dayClass === "busier"
			? t("home.busier")
			: t("home.withinNormal")
		: t("home.noNormalYet");

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			<ScrollView
				contentContainerStyle={{
					padding: theme.spacing.lg,
					paddingTop: insets.top + theme.spacing.md,
					paddingBottom: insets.bottom + 120,
					gap: theme.spacing.lg,
				}}
			>
				<View style={styles.topBar}>
					<Text style={[theme.typography.title, { color: theme.colors.text }]}>{t("appName")}</Text>
					<StreakFlame streak={streak} />
				</View>

				<FlareBanner />

				<WeekStrip days={weekDays} onSelectDay={goToDay} />

				{/* Hero swipeable : page 1 = anneau complétude, page 2 = courbe score. */}
				<View>
					<ScrollView
						horizontal
						pagingEnabled
						showsHorizontalScrollIndicator={false}
						onMomentumScrollEnd={onHeroScroll}
						scrollEventThrottle={16}
					>
						<View style={{ width: heroWidth }} testID="hero-page-1">
							<RingCard
								title={t("home.ringTitle")}
								progress={data.ringProgress}
								tint="stool"
								value={
									<View style={styles.ringCenter}>
										<Text
											testID="ring-stools"
											style={[theme.typography.dataXL, { color: theme.colors.text }]}
										>
											{data.stoolsToday}
										</Text>
										<Text
											style={[
												theme.typography.caption,
												styles.ringUnit,
												{ color: theme.colors.textMuted },
											]}
										>
											{unit}
											{normalText ? ` · ${t("home.normalRange", { range: normalText })}` : ""}
										</Text>
									</View>
								}
								subtitle={stateText}
							/>
						</View>

						<View style={{ width: heroWidth }} testID="hero-page-2">
							<Card style={styles.scoreCard}>
								<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
									{data.scoreKind === "sccai" ? t("home.scoreSccai") : t("home.scoreHbi")}
								</Text>
								{data.scoreSeries.some((v) => v != null) ? (
									<Sparkline
										data={data.scoreSeries}
										color={theme.colors.text}
										width={heroWidth - theme.spacing.xl * 2}
										height={96}
										min={0}
									/>
								) : (
									<View style={styles.scoreEmpty}>
										<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
											{t("home.scoreEmpty")}
										</Text>
									</View>
								)}
								<View style={styles.pillRow}>
									<StatPill
										label={t("home.bloodPill")}
										value={t(`home.bloodLevels.${data.bloodToday}`)}
										color={theme.colors.blood}
									/>
									<StatPill
										label={t("home.urgencyPill")}
										value={String(data.urgencyToday)}
										color={theme.colors.pain}
									/>
								</View>
							</Card>
						</View>
					</ScrollView>
					<View style={styles.dots}>
						{[0, 1].map((i) => (
							<View
								key={i}
								style={[
									styles.dot,
									{
										backgroundColor: heroPage === i ? theme.colors.text : theme.colors.border,
									},
								]}
							/>
						))}
					</View>
				</View>

				<View style={styles.miniRow}>
					<MiniCard
						testID="mini-pain"
						label={t("home.miniPain")}
						value={data.painToday != null ? String(data.painToday) : "—"}
						color={theme.colors.pain}
					/>
					<MiniCard
						testID="mini-energy"
						label={t("home.miniEnergy")}
						value={data.energyToday != null ? String(data.energyToday) : "—"}
						color={theme.colors.energy}
					/>
					<MiniCard
						testID="mini-meals"
						label={t("home.miniMeals")}
						value={String(data.mealsToday)}
						color={theme.colors.meal}
					/>
				</View>

				<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
					{t("home.recentTitle")}
				</Text>
				{data.recent.length === 0 ? (
					<Card>
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("home.recentEmpty")}
						</Text>
					</Card>
				) : (
					<View style={{ gap: theme.spacing.sm }}>
						{data.recent.map((entry) => (
							<RecentRow key={entry.id} entry={entry} onPress={() => openFor(entry)} />
						))}
					</View>
				)}
			</ScrollView>

			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("home.addButton")}
				testID="fab-add"
				onPress={() => setAddOpen(true)}
				style={[
					styles.fab,
					theme.shadows.floating,
					{ backgroundColor: theme.colors.ctaBackground, bottom: insets.bottom + 16 },
				]}
			>
				<Text style={[styles.fabPlus, { color: theme.colors.ctaText }]}>+</Text>
			</Pressable>

			<AddSheet visible={addOpen} onClose={() => setAddOpen(false)} onPick={pickAction} />
			<StoolSheet
				visible={stoolOpen}
				onClose={() => setStoolOpen(false)}
				onSaved={onLogged}
				resume={resume?.kind === "stool" ? resume : null}
			/>
			<SymptomSheet
				visible={symptomOpen}
				onClose={() => setSymptomOpen(false)}
				onSaved={onLogged}
				resume={resume?.kind === "symptom" ? resume : null}
			/>
		</View>
	);
}

function formatNormal(n: StoolNormal): string {
	return n.low === n.high ? String(n.low) : `${n.low}-${n.high}`;
}

function MiniCard({
	label,
	value,
	color,
	testID,
}: {
	label: string;
	value: string;
	color: string;
	testID?: string;
}) {
	const theme = useTheme();
	return (
		<Card padding="md" style={styles.miniCard} testID={testID}>
			<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{label}</Text>
			<Text style={[theme.typography.dataLg, { color }]}>{value}</Text>
		</Card>
	);
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
	const theme = useTheme();
	return (
		<View
			style={[
				styles.statPill,
				{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.pill },
			]}
		>
			<View style={[styles.statDot, { backgroundColor: color }]} />
			<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{label}</Text>
			<Text style={[theme.typography.label, { color: theme.colors.text }]}>{value}</Text>
		</View>
	);
}

function RecentRow({ entry, onPress }: { entry: SymptomEntry; onPress: () => void }) {
	const { t } = useTranslation(["common", "journal"]);
	const theme = useTheme();
	const isStool = entry.kind === "stool";

	return (
		<Pressable accessibilityRole="button" onPress={onPress}>
			<Card padding="md" style={styles.recentCard}>
				{isStool && entry.bristol ? (
					<BristolIcon type={entry.bristol as BristolType} selected size={30} />
				) : (
					<Text style={styles.recentEmoji}>{isStool ? "💩" : "🤕"}</Text>
				)}
				<View style={styles.recentBody}>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{isStool ? t("journal:kinds.stool") : t("journal:kinds.symptom")}
						{isStool && entry.bristol
							? ` · ${t("journal:entry.bristol", { value: entry.bristol })}`
							: ""}
					</Text>
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{formatClock(entry.occurredAt, entry.tz)}
					</Text>
				</View>
				{entry.isDraft ? (
					<View style={[styles.draftBadge, { backgroundColor: theme.colors.flareBackground }]}>
						<Text style={[theme.typography.caption, { color: theme.colors.pain }]}>
							{t("common:draft")}
						</Text>
					</View>
				) : null}
			</Card>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	ringCenter: { alignItems: "center" },
	ringUnit: { marginTop: 2, textAlign: "center" },
	scoreCard: { gap: 12, minHeight: 190, justifyContent: "center" },
	scoreEmpty: { minHeight: 96, alignItems: "center", justifyContent: "center" },
	pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
	statPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 6,
	},
	statDot: { width: 8, height: 8, borderRadius: 999 },
	dots: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 6,
		marginTop: 10,
	},
	dot: { width: 7, height: 7, borderRadius: 999 },
	miniRow: { flexDirection: "row", gap: 12 },
	miniCard: { flex: 1, gap: 4 },
	fab: {
		position: "absolute",
		right: 20,
		width: 60,
		height: 60,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	fabPlus: { fontSize: 32, lineHeight: 36, fontWeight: "300" },
	recentCard: { flexDirection: "row", alignItems: "center", gap: 12 },
	recentEmoji: { fontSize: 24 },
	recentBody: { flex: 1, gap: 2 },
	draftBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
