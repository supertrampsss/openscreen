/**
 * Funnel d'onboarding (§4, CONTRACTUEL) — 16 écrans, un écran = une question,
 * barre de progression fine, transitions spring douces. Contrôleur unique : les
 * réponses s'accumulent en état et se persistent au fil de l'eau (profile +
 * settings), l'écran 16 (paywall SOFT) réutilise `PremiumPaywall`.
 *
 * Ordre des écrans FIGÉ (§4.1 → §4.16) — ne pas réordonner.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Card, Confetti, PillButton, TapRow } from "@/components/ui";
import type { Profile } from "@/db/schema";
import { useFlare } from "@/features/flare/FlareContext";
import { CalcChecklist } from "@/features/onboarding/CalcChecklist";
import { ChoiceList } from "@/features/onboarding/ChoiceList";
import {
	NOTIF_OPT_IN_KEY,
	ONBOARDING_ATTRIBUTION_KEY,
	ONBOARDING_SYMPTOMS_KEY,
	ONBOARDING_TREATMENTS_KEY,
	TREATMENT_REMINDER_WEEKS_KEY,
} from "@/features/onboarding/keys";
import { useOnboarding } from "@/features/onboarding/OnboardingGate";
import { ProofChart } from "@/features/onboarding/ProofChart";
import { ScanAnimation } from "@/features/onboarding/ScanAnimation";
import { YearPicker } from "@/features/onboarding/YearPicker";
import { PremiumPaywall } from "@/features/premium/PremiumPaywall";
import { upsertProfile } from "@/repositories/profileRepo";
import { set as setSetting } from "@/repositories/settingsRepo";
import {
	enableNotificationsFromOnboarding,
	setNotificationPrefs,
} from "@/services/notificationService";
import { useTheme } from "@/theme";

const TOTAL = 16;
const LAST = TOTAL - 1;

type Diagnosis = NonNullable<Profile["diagnosis"]>;
type FlareStatus = NonNullable<Profile["flareStatus"]>;
type Baseline = NonNullable<Profile["baselineStools"]>;

interface Answers {
	diagnosis: Diagnosis | null;
	diagnosisYear: number | null;
	flareStatus: FlareStatus | null;
	baselineStools: Baseline | null;
	symptoms: string[];
	treatments: string[];
	treatmentWeeks: number | null;
	goals: string[];
	obstacles: string[];
	attribution: string | null;
}

const EMPTY: Answers = {
	diagnosis: null,
	diagnosisYear: null,
	flareStatus: null,
	baselineStools: null,
	symptoms: [],
	treatments: [],
	treatmentWeeks: null,
	goals: [],
	obstacles: [],
	attribution: null,
};

const DIAGNOSIS_OPTS: Diagnosis[] = ["crohn", "uc", "ibd_u", "undiagnosed"];
const STATE_OPTS: FlareStatus[] = ["flare", "remission", "unknown"];
const STOOL_OPTS: Baseline[] = ["0-2", "3-5", "6-9", "10+"];
const SYMPTOM_OPTS = ["urgency", "pain", "fatigue", "blood", "joints", "mood"];
const TREATMENT_OPTS = [
	"biologic_injectable",
	"biologic_infusion",
	"immunosuppressant",
	"corticosteroids",
	"aminosalicylates",
	"none",
];
const GOAL_OPTS = ["triggers", "flares", "consults", "treatment"];
const OBSTACLE_OPTS = ["forget", "too_long", "anxious", "doctor"];
const ATTRIBUTION_OPTS = ["friend", "social", "search", "association", "doctor", "other"];
const CADENCE_WEEKS = [1, 2, 4, 6, 8];

/** Écrans où « Passer » est médicalement acceptable (§4). */
const SKIPPABLE = new Set([2, 5, 6, 8, 9, 10, 12]);

export default function OnboardingScreen() {
	const { t } = useTranslation("onboarding");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const { markDone } = useOnboarding();
	const flare = useFlare();

	const [step, setStep] = useState(0);
	const [answers, setAnswers] = useState<Answers>(EMPTY);

	// Transition spring à chaque changement d'écran (mount inclus).
	const anim = useRef(new Animated.Value(0)).current;
	// biome-ignore lint/correctness/useExhaustiveDependencies: rejoué à chaque écran.
	useEffect(() => {
		anim.setValue(0);
		Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }).start();
	}, [step, anim]);

	// Barre de progression : remplissage `brand` animé en douceur d'un écran à l'autre.
	const progress = useRef(new Animated.Value((step + 1) / TOTAL)).current;
	useEffect(() => {
		Animated.timing(progress, {
			toValue: (step + 1) / TOTAL,
			duration: 420,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: false,
		}).start();
	}, [step, progress]);

	const setSingle = <K extends keyof Answers>(key: K, value: Answers[K]) =>
		setAnswers((a) => ({ ...a, [key]: value }));

	const toggleMulti = (key: "symptoms" | "treatments" | "goals" | "obstacles", value: string) =>
		setAnswers((a) => {
			const arr = a[key];
			return {
				...a,
				[key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
			};
		});

	/** Persiste la réponse de l'écran qu'on quitte (zéro perte, §2). */
	const persistStep = useCallback(() => {
		switch (step) {
			case 1:
				if (answers.diagnosis) void upsertProfile({ diagnosis: answers.diagnosis });
				break;
			case 2:
				if (answers.diagnosisYear != null)
					void upsertProfile({ diagnosisYear: answers.diagnosisYear });
				break;
			case 3:
				if (answers.flareStatus) {
					void upsertProfile({ flareStatus: answers.flareStatus });
					void flare.setActive(answers.flareStatus === "flare");
				}
				break;
			case 4:
				if (answers.baselineStools) void upsertProfile({ baselineStools: answers.baselineStools });
				break;
			case 5:
				void setSetting(ONBOARDING_SYMPTOMS_KEY, answers.symptoms);
				break;
			case 6:
				void setSetting(ONBOARDING_TREATMENTS_KEY, answers.treatments);
				if (needsCadence(answers.treatments) && answers.treatmentWeeks != null)
					void setSetting(TREATMENT_REMINDER_WEEKS_KEY, answers.treatmentWeeks);
				break;
			case 8:
				void upsertProfile({ goals: answers.goals });
				break;
			case 9:
				void upsertProfile({ obstacles: answers.obstacles });
				break;
			case 10:
				if (answers.attribution) void setSetting(ONBOARDING_ATTRIBUTION_KEY, answers.attribution);
				break;
			default:
				break;
		}
	}, [step, answers, flare]);

	const complete = useCallback(async () => {
		await markDone();
	}, [markDone]);

	const goNext = useCallback(() => {
		if (step >= LAST) {
			void complete();
			return;
		}
		setStep((s) => s + 1);
	}, [step, complete]);

	const advance = useCallback(() => {
		persistStep();
		goNext();
	}, [persistStep, goNext]);

	const goBack = useCallback(() => {
		setStep((s) => Math.max(0, s - 1));
	}, []);

	const answerNotifications = useCallback(
		(wanted: boolean) => {
			// On capte l'intention (§4.12) puis on demande la permission système
			// AVANT d'activer les rappels (§7) — « Plus tard » n'active rien.
			void setSetting(NOTIF_OPT_IN_KEY, wanted);
			if (wanted) {
				void enableNotificationsFromOnboarding();
			} else {
				void setNotificationPrefs({ master: false });
			}
			goNext();
		},
		[goNext],
	);

	const canContinue = useMemo(() => {
		if (step === 1) return answers.diagnosis != null;
		if (step === 3) return answers.flareStatus != null;
		if (step === 4) return answers.baselineStools != null;
		return true;
	}, [step, answers.diagnosis, answers.flareStatus, answers.baselineStools]);

	const showBack = step > 0 && step !== 13 && step !== LAST;
	const showFooter = step !== 13 && step !== LAST;

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			{/* Barre de progression fine (§4). */}
			<View style={{ paddingTop: insets.top + 8, paddingHorizontal: theme.spacing.lg }}>
				<View style={styles.topRow}>
					{showBack ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("progress", { current: step, total: TOTAL })}
							testID="onboarding-back"
							onPress={goBack}
							hitSlop={10}
						>
							<Text style={[theme.typography.heading, { color: theme.colors.textMuted }]}>‹</Text>
						</Pressable>
					) : (
						<View style={styles.backSpacer} />
					)}
					<View style={[styles.track, { backgroundColor: theme.colors.border }]}>
						<Animated.View
							style={[
								styles.fill,
								{
									backgroundColor: theme.colors.brand,
									width: progress.interpolate({
										inputRange: [0, 1],
										outputRange: ["0%", "100%"],
									}),
								},
							]}
						/>
					</View>
					{SKIPPABLE.has(step) ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t("skip")}
							testID="onboarding-skip"
							onPress={goNext}
							hitSlop={10}
						>
							<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
								{t("skip")}
							</Text>
						</Pressable>
					) : (
						<View style={styles.skipSpacer} />
					)}
				</View>
			</View>

			<Animated.View
				style={[
					styles.flex,
					{
						opacity: anim,
						transform: [
							{
								translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
							},
						],
					},
				]}
			>
				<ScrollView
					contentContainerStyle={{
						padding: theme.spacing.lg,
						paddingBottom: theme.spacing.xl,
						gap: theme.spacing.lg,
						flexGrow: 1,
					}}
					showsVerticalScrollIndicator={false}
				>
					{renderStep()}
				</ScrollView>
			</Animated.View>

			{showFooter ? (
				<View
					style={[
						styles.footer,
						{ paddingBottom: insets.bottom + 12, backgroundColor: theme.colors.background },
					]}
				>
					{step === 11 ? (
						<View style={{ gap: theme.spacing.sm }}>
							<PillButton
								label={t("notifications.allow")}
								accessibilityLabel={t("notifications.allow")}
								onPress={() => answerNotifications(true)}
								testID="onboarding-notif-allow"
							/>
							<PillButton
								label={t("notifications.later")}
								accessibilityLabel={t("notifications.later")}
								variant="secondary"
								onPress={() => answerNotifications(false)}
								testID="onboarding-notif-later"
							/>
						</View>
					) : (
						<PillButton
							label={footerLabel()}
							accessibilityLabel={footerLabel()}
							onPress={advance}
							disabled={!canContinue}
							testID="onboarding-continue"
						/>
					)}
				</View>
			) : null}

			<Confetti visible={step === 14} />
		</View>
	);

	function footerLabel(): string {
		if (step === 0) return t("welcome.cta");
		if (step === 14) return t("plan.cta");
		return t("continue");
	}

	function renderStep() {
		switch (step) {
			case 0:
				return (
					<StepIntro
						title={t("welcome.title")}
						subtitle={t("welcome.subtitle")}
						media={<ScanAnimation />}
					/>
				);
			case 1:
				return (
					<StepQuestion title={t("diagnosis.title")} subtitle={t("diagnosis.subtitle")}>
						<ChoiceList
							options={DIAGNOSIS_OPTS.map((v) => ({
								value: v,
								label: t(`diagnosis.${v}`),
								testID: `onb-opt-${v}`,
							}))}
							selected={answers.diagnosis ? [answers.diagnosis] : []}
							onToggle={(v) => setSingle("diagnosis", v as Diagnosis)}
						/>
					</StepQuestion>
				);
			case 2:
				return (
					<StepQuestion title={t("year.title")} subtitle={t("year.subtitle")}>
						<YearPicker
							value={answers.diagnosisYear}
							onChange={(y) => setSingle("diagnosisYear", y)}
						/>
					</StepQuestion>
				);
			case 3:
				return (
					<StepQuestion title={t("state.title")} subtitle={t("state.subtitle")}>
						<ChoiceList
							options={STATE_OPTS.map((v) => ({
								value: v,
								label: t(`state.${v}`),
								testID: `onb-opt-${v}`,
							}))}
							selected={answers.flareStatus ? [answers.flareStatus] : []}
							onToggle={(v) => setSingle("flareStatus", v as FlareStatus)}
						/>
					</StepQuestion>
				);
			case 4:
				return (
					<StepQuestion title={t("stools.title")} subtitle={t("stools.subtitle")}>
						<ChoiceList
							options={STOOL_OPTS.map((v) => ({
								value: v,
								label: t(`stools.${v}`),
								testID: `onb-opt-${v}`,
							}))}
							selected={answers.baselineStools ? [answers.baselineStools] : []}
							onToggle={(v) => setSingle("baselineStools", v as Baseline)}
						/>
					</StepQuestion>
				);
			case 5:
				return (
					<StepQuestion title={t("symptoms.title")} subtitle={t("symptoms.subtitle")}>
						<ChoiceList
							multi
							options={SYMPTOM_OPTS.map((v) => ({
								value: v,
								label: t(`symptoms.${v}`),
								testID: `onb-opt-${v}`,
							}))}
							selected={answers.symptoms}
							onToggle={(v) => toggleMulti("symptoms", v)}
						/>
					</StepQuestion>
				);
			case 6:
				return (
					<StepQuestion title={t("treatment.title")} subtitle={t("treatment.subtitle")}>
						<ChoiceList
							multi
							options={TREATMENT_OPTS.map((v) => ({
								value: v,
								label: t(`treatment.${v}`),
								testID: `onb-opt-${v}`,
							}))}
							selected={answers.treatments}
							onToggle={(v) => toggleMulti("treatments", v)}
						/>
						{needsCadence(answers.treatments) ? (
							<View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
								<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
									{t("treatment.cadenceTitle")}
								</Text>
								<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
									{t("treatment.cadenceSubtitle")}
								</Text>
								<TapRow
									options={CADENCE_WEEKS.map((n) => ({
										value: n,
										label: t("treatment.week", { count: n }),
										testID: `onb-week-${n}`,
									}))}
									value={answers.treatmentWeeks}
									onChange={(n) => setSingle("treatmentWeeks", n)}
									tint="meal"
								/>
							</View>
						) : null}
					</StepQuestion>
				);
			case 7:
				return (
					<StepIntro
						title={t("proof.title")}
						subtitle={t("proof.body")}
						media={<ProofChart />}
						footnote={t("proof.source")}
					/>
				);
			case 8:
				return (
					<StepQuestion title={t("goals.title")} subtitle={t("goals.subtitle")}>
						<ChoiceList
							multi
							options={GOAL_OPTS.map((v) => ({
								value: v,
								label: t(`goals.${v}`),
								testID: `onb-opt-${v}`,
							}))}
							selected={answers.goals}
							onToggle={(v) => toggleMulti("goals", v)}
						/>
					</StepQuestion>
				);
			case 9:
				return (
					<StepQuestion title={t("obstacles.title")} subtitle={t("obstacles.subtitle")}>
						<ChoiceList
							multi
							options={OBSTACLE_OPTS.map((v) => ({
								value: v,
								label: t(`obstacles.${v}`),
								testID: `onb-opt-${v}`,
							}))}
							selected={answers.obstacles}
							onToggle={(v) => toggleMulti("obstacles", v)}
						/>
					</StepQuestion>
				);
			case 10:
				return (
					<StepQuestion title={t("attribution.title")} subtitle={t("attribution.subtitle")}>
						<ChoiceList
							options={ATTRIBUTION_OPTS.map((v) => ({
								value: v,
								label: t(`attribution.${v}`),
								testID: `onb-opt-${v}`,
							}))}
							selected={answers.attribution ? [answers.attribution] : []}
							onToggle={(v) => setSingle("attribution", v)}
						/>
					</StepQuestion>
				);
			case 11:
				return (
					<StepIntro
						title={t("notifications.title")}
						subtitle={t("notifications.body")}
						media={<Icon name="bell" size={72} color={theme.colors.brand} strokeWidth={1.5} />}
					/>
				);
			case 12:
				return (
					<StepQuestion title={t("health.title")} subtitle={t("health.body")}>
						<View
							style={[
								styles.healthToggle,
								{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
							]}
						>
							<Text style={[theme.typography.subheading, { color: theme.colors.textFaint }]}>
								{t("health.toggle")}
							</Text>
							<View style={[styles.soonBadge, { backgroundColor: theme.colors.border }]}>
								<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
									{t("health.soon")}
								</Text>
							</View>
						</View>
					</StepQuestion>
				);
			case 13:
				return <CalcChecklist onDone={goNext} />;
			case 14:
				return <StepPlan baseline={answers.baselineStools} />;
			case 15:
				return (
					<PremiumPaywall
						mode="onboarding"
						onContinueFree={() => void complete()}
						onPurchased={() => void complete()}
					/>
				);
			default:
				return null;
		}
	}
}

function needsCadence(treatments: string[]): boolean {
	return treatments.includes("biologic_injectable") || treatments.includes("biologic_infusion");
}

/** Écran informatif (splash, preuve, notifications) : média + titres. */
function StepIntro({
	title,
	subtitle,
	media,
	footnote,
}: {
	title: string;
	subtitle: string;
	media: ReactNode;
	footnote?: string;
}) {
	const theme = useTheme();
	return (
		<View style={styles.introWrap}>
			<View style={styles.introMedia}>{media}</View>
			<View style={styles.introText}>
				<Text style={[theme.typography.title, styles.center, { color: theme.colors.text }]}>
					{title}
				</Text>
				<Text
					style={[
						theme.typography.body,
						styles.center,
						styles.lede,
						{ color: theme.colors.textMuted },
					]}
				>
					{subtitle}
				</Text>
				{footnote ? (
					<Text
						style={[theme.typography.caption, styles.center, { color: theme.colors.textFaint }]}
					>
						{footnote}
					</Text>
				) : null}
			</View>
		</View>
	);
}

/** Écran-question : titre, sous-titre, contrôle de saisie. */
function StepQuestion({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle: string;
	children: ReactNode;
}) {
	const theme = useTheme();
	return (
		<View style={{ gap: theme.spacing.xl }}>
			<View style={{ gap: theme.spacing.sm }}>
				<Text style={[theme.typography.title, { color: theme.colors.text }]}>{title}</Text>
				<Text style={[theme.typography.body, styles.readable, { color: theme.colors.textMuted }]}>
					{subtitle}
				</Text>
			</View>
			{children}
		</View>
	);
}

/** Écran « Votre plan est prêt » (§4.15) — carte récap personnalisée. */
function StepPlan({ baseline }: { baseline: Baseline | null }) {
	const { t } = useTranslation("onboarding");
	const theme = useTheme();
	const rows: {
		icon: "stool" | "refresh" | "sparkles";
		tint: "stool" | "meal" | "energy";
		soft: string;
		label: string;
		value: string;
		accent?: boolean;
	}[] = [
		{
			icon: "stool",
			tint: "stool",
			soft: theme.colors.stoolSoft,
			label: t("plan.baselineLabel"),
			value: baseline ? t("plan.baselineValue", { range: baseline }) : t("plan.baselineUnknown"),
		},
		{
			icon: "refresh",
			tint: "meal",
			soft: theme.colors.mealSoft,
			label: t("plan.rhythmLabel"),
			value: t("plan.rhythmValue"),
		},
		{
			icon: "sparkles",
			tint: "energy",
			soft: theme.colors.energySoft,
			label: t("plan.goalLabel"),
			value: t("plan.goalValue"),
			accent: true,
		},
	];
	return (
		<View style={{ gap: theme.spacing.xl }}>
			{/* En-tête : pastille de marque + titres. */}
			<View style={styles.planHeader}>
				<View style={[styles.planCrest, { backgroundColor: theme.colors.brandSoft }]}>
					<Icon name="check" size={26} color={theme.colors.brand} strokeWidth={2.4} />
				</View>
				<View style={{ gap: theme.spacing.xs }}>
					<Text style={[theme.typography.title, styles.center, { color: theme.colors.text }]}>
						{t("plan.title")}
					</Text>
					<Text
						style={[
							theme.typography.body,
							styles.center,
							styles.lede,
							{ color: theme.colors.textMuted },
						]}
					>
						{t("plan.subtitle")}
					</Text>
				</View>
			</View>
			<Card padding="md" style={{ gap: theme.spacing.xs }}>
				{rows.map((row, i) => (
					<View key={row.label}>
						{i > 0 ? (
							<View style={[styles.planDivider, { backgroundColor: theme.colors.border }]} />
						) : null}
						<View style={styles.planRow}>
							<View style={[styles.planIcon, { backgroundColor: row.soft }]}>
								<Icon name={row.icon} size={20} color={theme.colors[row.tint]} strokeWidth={1.8} />
							</View>
							<View style={styles.planRowText}>
								<Text style={[theme.typography.overline, { color: theme.colors.textFaint }]}>
									{row.label}
								</Text>
								<Text
									style={[
										theme.typography.subheading,
										styles.planValue,
										{ color: row.accent ? theme.colors.brand : theme.colors.text },
									]}
								>
									{row.value}
								</Text>
							</View>
						</View>
					</View>
				))}
			</Card>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
	backSpacer: { width: 16 },
	skipSpacer: { width: 16 },
	track: { flex: 1, height: 4, borderRadius: 999, overflow: "hidden" },
	fill: { height: 4, borderRadius: 999 },
	footer: { paddingHorizontal: 20, paddingTop: 8 },
	introWrap: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		gap: 14,
		paddingVertical: 24,
	},
	introMedia: { alignItems: "center", justifyContent: "center" },
	introText: { gap: 10, alignItems: "center", alignSelf: "stretch" },
	center: { textAlign: "center" },
	lede: { maxWidth: 320 },
	readable: { maxWidth: 340 },
	healthToggle: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 56,
		paddingHorizontal: 18,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		opacity: 0.7,
	},
	soonBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
	planHeader: { alignItems: "center", gap: 16 },
	planCrest: {
		width: 56,
		height: 56,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	planRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
	planIcon: {
		width: 40,
		height: 40,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	planRowText: { flex: 1, gap: 3 },
	planDivider: { height: StyleSheet.hairlineWidth },
	planValue: { lineHeight: 22 },
});
