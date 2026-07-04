import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	ActivityIndicator,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Platform,
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
import { PillButton } from "@/components/ui/PillButton";
import type { Meal, SymptomEntry } from "@/db/schema";
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
import { daysBetweenLocalDates } from "@/domain/treatments";
import type { VoiceDraft } from "@/domain/voiceEntries";
import { FlareBanner } from "@/features/flare/FlareBanner";
import { type AddAction, AddSheet } from "@/features/log/AddSheet";
import { MealScanResultSheet } from "@/features/log/MealScanResultSheet";
import { MealSheet } from "@/features/log/MealSheet";
import { MealTriggerChips } from "@/features/log/MealTriggerChips";
import { PremiumTeaserSheet } from "@/features/log/PremiumTeaserSheet";
import { StoolSheet } from "@/features/log/StoolSheet";
import { SymptomSheet } from "@/features/log/SymptomSheet";
import { VoiceNoteSheet } from "@/features/log/VoiceNoteSheet";
import { StreakFlame } from "@/features/streak/StreakFlame";
import { listSince as listExtrasSince } from "@/repositories/dailyExtrasRepo";
import {
	listActivePhotoDrafts,
	listCommittedSince as listMealsSince,
	listRecentCommittedWithItems,
	type MealWithItems,
	newMealId,
	upsertDraft,
} from "@/repositories/mealRepo";
import { getProfile } from "@/repositories/profileRepo";
import {
	listCommittedSince,
	listRecent,
	newEntryId,
	upsertDraft as upsertSymptomDraft,
} from "@/repositories/symptomRepo";
import { listActive as listActiveTreatments } from "@/repositories/treatmentRepo";
import { currentEntitlementToken } from "@/services/entitlements";
import {
	analyzeMeal,
	persistPhoto,
	ScanError,
	type ScanResponse,
} from "@/services/mealScanService";
import { useStreak } from "@/services/streakService";
import { useTheme } from "@/theme";

interface HomeData {
	recent: SymptomEntry[];
	recentMeals: MealWithItems[];
	photoDrafts: MealWithItems[];
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
	/** Échéance de traitement la plus proche (J-2 → J+n), pour la carte discrète. */
	dueTreatment: { name: string; days: number } | null;
}

const EMPTY: HomeData = {
	recent: [],
	recentMeals: [],
	photoDrafts: [],
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
	dueTreatment: null,
};

export default function HomeScreen() {
	const { t } = useTranslation("common");
	const { t: ttr } = useTranslation("treatments");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const quickParams = useLocalSearchParams<{ quick?: string }>();
	const { width } = useWindowDimensions();
	const { streak, reload: reloadStreak } = useStreak();

	const [data, setData] = useState<HomeData>(EMPTY);
	const [addOpen, setAddOpen] = useState(false);
	const [stoolOpen, setStoolOpen] = useState(false);
	const [symptomOpen, setSymptomOpen] = useState(false);
	const [mealOpen, setMealOpen] = useState(false);
	const [resume, setResume] = useState<SymptomEntry | null>(null);
	const [resumeMeal, setResumeMeal] = useState<MealWithItems | null>(null);
	const [heroPage, setHeroPage] = useState(0);
	// Scan photo (§5.4) : brouillon en cours, résultat, teaser Premium.
	const [scanResult, setScanResult] = useState<{ meal: Meal; response: ScanResponse } | null>(null);
	const [scanStates, setScanStates] = useState<
		Record<string, { status: "analyzing" | "error"; kind?: string }>
	>({});
	const [premiumOpen, setPremiumOpen] = useState(false);
	const [premiumMeal, setPremiumMeal] = useState<Meal | null>(null);
	// Note vocale (§5.4, §6.1) — Premium.
	const [voiceOpen, setVoiceOpen] = useState(false);

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
			listRecentCommittedWithItems(10),
			listActivePhotoDrafts(10),
			listActiveTreatments(),
		]).then(([committed, meals, extras, profile, recent, recentMeals, photoDrafts, treatments]) => {
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

			// Échéance de traitement la plus urgente si elle approche (J-2 → passée).
			let dueTreatment: { name: string; days: number } | null = null;
			for (const tr of treatments) {
				if (!tr.nextDue) continue;
				const days = daysBetweenLocalDates(today, tr.nextDue);
				if (days <= 2 && (dueTreatment == null || days < dueTreatment.days)) {
					dueTreatment = { name: tr.name, days };
				}
			}

			setData({
				recent,
				recentMeals,
				photoDrafts,
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
				dueTreatment,
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

	// Flux « Récemment loggé » : entrées symptômes + repas fusionnés par heure.
	type FeedItem =
		| { kind: "entry"; occurredAt: number; entry: SymptomEntry }
		| { kind: "meal"; occurredAt: number; meal: MealWithItems }
		| { kind: "scan"; occurredAt: number; draft: MealWithItems };
	const recentFeed: FeedItem[] = [
		...data.recent.map((entry) => ({
			kind: "entry" as const,
			occurredAt: entry.occurredAt,
			entry,
		})),
		...data.recentMeals.map((meal) => ({
			kind: "meal" as const,
			occurredAt: meal.meal.occurredAt,
			meal,
		})),
		...data.photoDrafts.map((draft) => ({
			kind: "scan" as const,
			occurredAt: draft.meal.occurredAt,
			draft,
		})),
	]
		.sort((a, b) => b.occurredAt - a.occurredAt)
		.slice(0, 15);

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

	const openMeal = (meal: MealWithItems) => {
		setResumeMeal(meal);
		setMealOpen(true);
	};

	// ---- Scan photo (§5.4) -------------------------------------------------
	/** Ouvre la caméra (natif) ou la galerie (web), renvoie l'URI ou null. */
	const pickImage = useCallback(async (): Promise<string | null> => {
		try {
			let res: ImagePicker.ImagePickerResult;
			if (Platform.OS === "web") {
				res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
			} else {
				const perm = await ImagePicker.requestCameraPermissionsAsync();
				res = perm.granted
					? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
					: await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
			}
			if (res.canceled || !res.assets?.[0]) return null;
			return res.assets[0].uri;
		} catch {
			return null;
		}
	}, []);

	/** Lance l'analyse d'un brouillon photo existant (démarrage ou ré-analyse). */
	const runAnalysis = useCallback(
		async (meal: Meal, userNote?: string) => {
			setScanStates((s) => ({ ...s, [meal.id]: { status: "analyzing" } }));
			try {
				// Jeton d'entitlement (Premium) joint quand présent : le proxy débloque
				// alors l'analyse illimitée au lieu de décompter le quota d'essai (§6, §8).
				const entitlementToken = (await currentEntitlementToken()) ?? undefined;
				const response = await analyzeMeal({
					uri: meal.photoUri ?? "",
					userNote,
					entitlementToken,
				});
				setScanStates((s) => {
					const next = { ...s };
					delete next[meal.id];
					return next;
				});
				setScanResult({ meal, response });
			} catch (e) {
				const kind = e instanceof ScanError ? e.kind : "server";
				setScanStates((s) => {
					const next = { ...s };
					if (kind === "trial_exhausted") delete next[meal.id];
					else next[meal.id] = { status: "error", kind };
					return next;
				});
				if (kind === "trial_exhausted") {
					setPremiumMeal(meal);
					setPremiumOpen(true);
				}
				reload();
			}
		},
		[reload],
	);

	/** Prise de photo → brouillon immédiat (Récemment loggé) → analyse en fond. */
	const startPhotoScan = useCallback(async () => {
		const uri = await pickImage();
		if (!uri) return;
		const local = await persistPhoto(uri);
		const ts = nowEntryTimestamp();
		const meal = await upsertDraft({
			id: newMealId(),
			occurredAt: ts.epochMs,
			tz: ts.tz,
			localDate: ts.localDate,
			name: t("scan:draftName"),
			source: "photo",
			photoUri: local,
		});
		reload();
		runAnalysis(meal);
	}, [pickImage, runAnalysis, reload, t]);

	/** Bascule vers le repas manuel avec la photo attachée (§5.4.5 fallback). */
	const scanToManual = useCallback((meal: Meal) => {
		setScanResult(null);
		setPremiumOpen(false);
		setResumeMeal({ meal, items: [] });
		setMealOpen(true);
	}, []);

	const pickAction = (action: AddAction) => {
		setAddOpen(false);
		setResume(null);
		if (action === "stool") setStoolOpen(true);
		else if (action === "symptom") setSymptomOpen(true);
		else if (action === "photo") startPhotoScan();
		else if (action === "voice") setVoiceOpen(true);
		else {
			setResumeMeal(null);
			setMealOpen(true);
		}
	};

	/**
	 * Édition d'une entrée voix (§5.4) : on pré-persiste le brouillon puis on
	 * ouvre le sheet détaillé pré-rempli PAR-DESSUS la note vocale (qui reste
	 * ouverte avec les entrées restantes). Rien n'est committé sans le geste.
	 */
	const editVoiceEntry = useCallback(async (draft: VoiceDraft) => {
		const ts = draft.occurredAt;
		if (draft.type === "meal") {
			const meal = await upsertDraft({
				id: newMealId(),
				occurredAt: ts.epochMs,
				tz: ts.tz,
				localDate: ts.localDate,
				name: draft.name,
				source: "voice",
			});
			setResumeMeal({ meal, items: [] });
			setMealOpen(true);
			return;
		}
		const row = await upsertSymptomDraft({
			id: newEntryId(),
			kind: draft.type,
			occurredAt: ts.epochMs,
			tz: ts.tz,
			localDate: ts.localDate,
			bristol: draft.type === "stool" ? draft.bristol : null,
			pain: draft.type === "symptom" ? draft.pain : null,
			fatigue: draft.type === "symptom" ? draft.fatigue : null,
			notes: draft.notes,
		});
		setResume(row);
		if (draft.type === "stool") setStoolOpen(true);
		else setSymptomOpen(true);
	}, []);

	// Quick actions / deep-links (§5.12) : `?quick=stool|photo` ouvre directement
	// le sheet ou le picker, puis on efface le paramètre (une seule fois).
	useEffect(() => {
		const q = quickParams.quick;
		if (!q) return;
		router.setParams({ quick: undefined });
		if (q === "stool") {
			setResume(null);
			setStoolOpen(true);
		} else if (q === "photo") {
			startPhotoScan();
		}
	}, [quickParams.quick, router, startPhotoScan]);

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

				{/* Échéance de traitement qui approche (§5.9) : carte discrète, ambre pâle
				    jamais rouge, tap → écran Traitements. */}
				{data.dueTreatment ? (
					<Pressable
						accessibilityRole="button"
						testID="home-treatment-due"
						accessibilityLabel={
							data.dueTreatment.days <= 0
								? ttr("homeCard.dueToday", { name: data.dueTreatment.name })
								: ttr("homeCard.dueInDays", {
										name: data.dueTreatment.name,
										count: data.dueTreatment.days,
									})
						}
						onPress={() => router.push("/treatments")}
					>
						<Card
							padding="md"
							style={[
								styles.recentCard,
								{
									backgroundColor: theme.colors.flareBackground,
									borderColor: theme.colors.flareBorder,
									borderWidth: StyleSheet.hairlineWidth,
								},
							]}
						>
							<Text style={styles.recentEmoji}>💊</Text>
							<View style={styles.recentBody}>
								<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
									{data.dueTreatment.days <= 0
										? ttr("homeCard.dueToday", { name: data.dueTreatment.name })
										: ttr("homeCard.dueInDays", {
												name: data.dueTreatment.name,
												count: data.dueTreatment.days,
											})}
								</Text>
							</View>
							<Text style={[theme.typography.subheading, { color: theme.colors.textFaint }]}>
								›
							</Text>
						</Card>
					</Pressable>
				) : null}

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
				{recentFeed.length === 0 ? (
					<Card>
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("home.recentEmpty")}
						</Text>
					</Card>
				) : (
					<View style={{ gap: theme.spacing.sm }}>
						{recentFeed.map((f) => {
							if (f.kind === "entry") {
								return (
									<RecentRow key={f.entry.id} entry={f.entry} onPress={() => openFor(f.entry)} />
								);
							}
							if (f.kind === "meal") {
								return (
									<MealRecentRow
										key={f.meal.meal.id}
										meal={f.meal}
										onPress={() => openMeal(f.meal)}
									/>
								);
							}
							return (
								<ScanRecentCard
									key={f.draft.meal.id}
									draft={f.draft}
									status={scanStates[f.draft.meal.id]?.status}
									onRetry={() => runAnalysis(f.draft.meal)}
									onManual={() => scanToManual(f.draft.meal)}
								/>
							);
						})}
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
			<VoiceNoteSheet
				visible={voiceOpen}
				onClose={() => setVoiceOpen(false)}
				onSaved={onLogged}
				onEditEntry={editVoiceEntry}
				onSeePremium={() => {
					setVoiceOpen(false);
					router.push("/premium");
				}}
			/>
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
			<MealSheet
				visible={mealOpen}
				onClose={() => setMealOpen(false)}
				onSaved={onLogged}
				resume={resumeMeal}
			/>
			{scanResult ? (
				<MealScanResultSheet
					visible={!!scanResult}
					meal={scanResult.meal}
					response={scanResult.response}
					onClose={() => setScanResult(null)}
					onSaved={onLogged}
					onManual={() => {
						if (scanResult) scanToManual(scanResult.meal);
					}}
				/>
			) : null}
			<PremiumTeaserSheet
				visible={premiumOpen}
				onClose={() => setPremiumOpen(false)}
				onManual={() => {
					if (premiumMeal) scanToManual(premiumMeal);
				}}
			/>
		</View>
	);
}

/** Carte « Récemment loggé » d'un brouillon photo (analyse / échec / ré-analyse). */
function ScanRecentCard({
	draft,
	status,
	onRetry,
	onManual,
}: {
	draft: MealWithItems;
	status?: "analyzing" | "error";
	onRetry: () => void;
	onManual: () => void;
}) {
	const { t } = useTranslation("scan");
	const theme = useTheme();
	const analyzing = status === "analyzing";

	return (
		<Card padding="md" style={styles.recentCard} testID={`scan-card-${draft.meal.id}`}>
			{draft.meal.photoUri ? (
				<Image
					source={{ uri: draft.meal.photoUri }}
					style={[styles.scanThumb, { borderRadius: theme.radii.sm }]}
					contentFit="cover"
				/>
			) : (
				<Text style={styles.recentEmoji}>📸</Text>
			)}
			<View style={styles.recentBody}>
				{analyzing ? (
					<View style={styles.scanRow} testID="scan-shimmer">
						<ActivityIndicator color={theme.colors.meal} />
						<Text style={[theme.typography.subheading, { color: theme.colors.textMuted }]}>
							{t("card.analyzing")}
						</Text>
					</View>
				) : (
					<>
						<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
							{status === "error" ? t("card.failed") : (draft.meal.name ?? t("draftName"))}
						</Text>
						<View style={styles.scanActions}>
							<PillButton
								label={status === "error" ? t("card.retry") : t("card.reanalyze")}
								accessibilityLabel={status === "error" ? t("card.retry") : t("card.reanalyze")}
								variant="secondary"
								fullWidth={false}
								onPress={onRetry}
								testID={`scan-retry-${draft.meal.id}`}
							/>
							<PillButton
								label={t("card.manual")}
								accessibilityLabel={t("card.manual")}
								variant="secondary"
								fullWidth={false}
								onPress={onManual}
								testID={`scan-manual-${draft.meal.id}`}
							/>
						</View>
					</>
				)}
			</View>
		</Card>
	);
}

function MealRecentRow({ meal, onPress }: { meal: MealWithItems; onPress: () => void }) {
	const { t } = useTranslation(["common", "journal", "log"]);
	const theme = useTheme();
	return (
		<Pressable accessibilityRole="button" onPress={onPress}>
			<Card padding="md" style={styles.recentCard}>
				<Text style={styles.recentEmoji}>🍽️</Text>
				<View style={styles.recentBody}>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{meal.meal.name ?? t("journal:kinds.meal")}
					</Text>
					<MealTriggerChips items={meal.items} max={3} />
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{formatClock(meal.meal.occurredAt, meal.meal.tz)}
					</Text>
				</View>
			</Card>
		</Pressable>
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
	scanThumb: { width: 44, height: 44 },
	scanRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	scanActions: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
});
