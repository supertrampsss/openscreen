import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Card, Confetti, DraftSheet, FadeInView, PillButton, Segmented } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import { storeReviewUrl } from "@/constants/branding";
import type { ReportData } from "@/domain/exportReport";
import {
	generatePdf,
	getIdentity,
	loadReport,
	PERIOD_MONTHS,
	type PeriodMonths,
	periodDaysFor,
	setIdentity,
} from "@/services/exportService";
import { haptics } from "@/services/haptics";
import {
	markExportDone,
	recordReviewDeclined,
	recordReviewRated,
	shouldPromptReview,
} from "@/services/reviewPrompt";
import { useTheme } from "@/theme";

/** Décalage d'apparition en cascade (§3, plafonné pour rester calme). */
const STAGGER = 40;
const staggerDelay = (i: number) => Math.min(i, 7) * STAGGER;

export default function ExportScreen() {
	const { t } = useTranslation("export");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const snackbar = useSnackbar();

	const [months, setMonths] = useState<PeriodMonths>(1);
	const [identity, setIdentityText] = useState("");
	const [report, setReport] = useState<ReportData | null>(null);
	const [consultLines, setConsultLines] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [reviewOpen, setReviewOpen] = useState(false);
	const [confetti, setConfetti] = useState(false);

	// Charge l'identité une fois.
	useEffect(() => {
		getIdentity().then(setIdentityText);
	}, []);

	// (Re)construit le rapport à chaque changement de période.
	const reload = useCallback(() => {
		loadReport(periodDaysFor(months)).then(({ report: r, consultLines: lines }) => {
			setReport(r);
			setConsultLines(lines);
		});
	}, [months]);

	useEffect(() => {
		reload();
	}, [reload]);

	const saveIdentity = () => {
		void setIdentity(identity);
		reload();
	};

	const onGenerate = async () => {
		if (!report) return;
		setBusy(true);
		try {
			await generatePdf(report);
			haptics.success();
			const { firstExport } = await markExportDone();
			if (firstExport) {
				setConfetti(true);
				snackbar.show({ message: t("milestone") });
			}
			if (await shouldPromptReview()) {
				setReviewOpen(true);
			}
		} catch {
			haptics.warning();
			snackbar.show({
				message: t("error.message"),
				actionLabel: t("error.retry"),
				onAction: onGenerate,
			});
		} finally {
			setBusy(false);
		}
	};

	const onRate = async () => {
		await recordReviewRated();
		setReviewOpen(false);
		void Linking.openURL(storeReviewUrl());
	};

	const onReviewLater = async () => {
		await recordReviewDeclined();
		setReviewOpen(false);
	};

	const lastWeek =
		report && report.weekly.length > 0 ? report.weekly[report.weekly.length - 1] : null;
	const hasData = report != null && report.documentedDays > 0;
	const na = t("report.na");

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
				{/* En-tête + fermeture. */}
				<FadeInView delay={staggerDelay(0)} style={styles.header}>
					<View style={styles.headerText}>
						<Text style={[theme.typography.title, { color: theme.colors.text }]}>{t("title")}</Text>
						<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
							{t("subtitle")}
						</Text>
					</View>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("common:actions.close", { defaultValue: "Fermer" })}
						testID="export-close"
						onPress={() => {
							haptics.selection();
							router.back();
						}}
						hitSlop={12}
						style={[styles.close, { backgroundColor: theme.colors.surface }]}
					>
						<Icon name="x" size={18} color={theme.colors.text} strokeWidth={1.9} />
					</Pressable>
				</FadeInView>

				{/* Sélecteur de période. */}
				<FadeInView delay={staggerDelay(1)} style={{ gap: theme.spacing.sm }}>
					<Text
						style={[
							theme.typography.overline,
							styles.groupLabel,
							{ color: theme.colors.textFaint },
						]}
					>
						{t("period.heading")}
					</Text>
					<Segmented
						accessibilityLabel={t("period.heading")}
						value={String(months)}
						onChange={(v) => setMonths(Number(v) as PeriodMonths)}
						options={PERIOD_MONTHS.map((m) => ({
							value: String(m),
							label: t(`period.${m}`),
							testID: `export-period-${m}`,
						}))}
					/>
				</FadeInView>

				{/* Identité optionnelle. */}
				<FadeInView delay={staggerDelay(2)} style={{ gap: theme.spacing.sm }}>
					<Text
						style={[
							theme.typography.overline,
							styles.groupLabel,
							{ color: theme.colors.textFaint },
						]}
					>
						{t("identity.heading")}
					</Text>
					<TextInput
						accessibilityLabel={t("identity.heading")}
						testID="export-identity"
						placeholder={t("identity.placeholder")}
						placeholderTextColor={theme.colors.textFaint}
						value={identity}
						onChangeText={setIdentityText}
						onBlur={saveIdentity}
						style={[
							styles.input,
							theme.typography.body,
							{
								color: theme.colors.text,
								backgroundColor: theme.colors.card,
								borderColor: theme.colors.border,
								borderRadius: theme.radii.md,
							},
						]}
					/>
					<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
						{t("identity.hint")}
					</Text>
				</FadeInView>

				{/* Aperçu natif : points à consulter + dernière semaine. */}
				<FadeInView delay={staggerDelay(3)}>
					<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
						{t("preview.heading")}
					</Text>
				</FadeInView>

				{hasData ? (
					<FadeInView delay={staggerDelay(4)} style={{ gap: theme.spacing.lg }}>
						<Card testID="export-consult" style={{ gap: theme.spacing.md }}>
							<View style={styles.cardHead}>
								<View style={[styles.cardHeadIcon, { backgroundColor: theme.colors.brandSoft }]}>
									<Icon name="stethoscope" size={20} color={theme.colors.brand} strokeWidth={1.8} />
								</View>
								<Text
									style={[
										theme.typography.subheading,
										styles.cardHeadTitle,
										{ color: theme.colors.text },
									]}
								>
									{t("preview.consultTitle")}
								</Text>
							</View>
							{consultLines.map((line) => (
								<View key={line} style={styles.bulletRow}>
									<View style={[styles.bulletDot, { backgroundColor: theme.colors.brand }]} />
									<Text
										style={[theme.typography.body, styles.bulletText, { color: theme.colors.text }]}
									>
										{line}
									</Text>
								</View>
							))}
						</Card>

						{lastWeek ? (
							<Card style={{ gap: theme.spacing.sm }}>
								<View style={styles.cardHead}>
									<View style={[styles.cardHeadIcon, { backgroundColor: theme.colors.stoolSoft }]}>
										<Icon name="pulse" size={20} color={theme.colors.stool} strokeWidth={1.9} />
									</View>
									<Text
										style={[
											theme.typography.subheading,
											styles.cardHeadTitle,
											{ color: theme.colors.text },
										]}
									>
										{t("preview.lastWeekTitle")}
									</Text>
								</View>
								<StatLine label={t("report.col.stools")} value={String(lastWeek.stools)} />
								<StatLine label={t("report.col.bloodDays")} value={String(lastWeek.bloodDays)} />
								<StatLine
									label={t("report.col.worstPain")}
									value={lastWeek.worstPain != null ? String(lastWeek.worstPain) : na}
								/>
								<StatLine
									label={t("report.col.weight")}
									value={lastWeek.weightKg != null ? `${lastWeek.weightKg.toFixed(1)} kg` : na}
								/>
							</Card>
						) : null}

						<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
							{t("preview.pdfNote")}
						</Text>
					</FadeInView>
				) : (
					<FadeInView delay={staggerDelay(4)}>
						<Card>
							<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
								{t("preview.empty")}
							</Text>
						</Card>
					</FadeInView>
				)}

				<FadeInView delay={staggerDelay(5)}>
					<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
						{t("freeForever")}
					</Text>
				</FadeInView>

				<FadeInView delay={staggerDelay(6)}>
					<PillButton
						label={busy ? t("generating") : t("generate")}
						testID="export-generate"
						onPress={onGenerate}
						loading={busy}
						disabled={!hasData}
						accessibilityLabel={t("generate")}
					/>
				</FadeInView>
			</ScrollView>

			{/* Demande d'avis (§7) — sheet maison bienveillant, deux issues. */}
			<DraftSheet visible={reviewOpen} onClose={onReviewLater} title={t("review.title")}>
				<View style={{ gap: theme.spacing.md }}>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{t("review.body")}
					</Text>
					<PillButton
						label={t("review.rate")}
						testID="review-rate"
						onPress={onRate}
						accessibilityLabel={t("review.rate")}
					/>
					<PillButton
						label={t("review.later")}
						variant="secondary"
						onPress={onReviewLater}
						accessibilityLabel={t("review.later")}
					/>
				</View>
			</DraftSheet>

			<Confetti visible={confetti} onDone={() => setConfetti(false)} />
		</View>
	);
}

function StatLine({ label, value }: { label: string; value: string }) {
	const theme = useTheme();
	return (
		<View style={styles.statLine}>
			<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{label}</Text>
			<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
	headerText: { flex: 1, gap: 2 },
	close: {
		width: 36,
		height: 36,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: 12,
	},
	groupLabel: { paddingHorizontal: 4 },
	input: {
		minHeight: 48,
		paddingHorizontal: 14,
		borderWidth: StyleSheet.hairlineWidth,
	},
	cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
	cardHeadIcon: {
		width: 38,
		height: 38,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	cardHeadTitle: { flex: 1 },
	bulletRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
	bulletDot: { width: 6, height: 6, borderRadius: 999, marginTop: 8 },
	bulletText: { flex: 1 },
	statLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
