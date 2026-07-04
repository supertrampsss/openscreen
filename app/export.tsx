import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Confetti, DraftSheet, PillButton } from "@/components/ui";
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
import {
	markExportDone,
	recordReviewDeclined,
	recordReviewRated,
	shouldPromptReview,
} from "@/services/reviewPrompt";
import { useTheme } from "@/theme";

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
			const { firstExport } = await markExportDone();
			if (firstExport) {
				setConfetti(true);
				snackbar.show({ message: t("milestone") });
			}
			if (await shouldPromptReview()) {
				setReviewOpen(true);
			}
		} catch {
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
				<View style={styles.header}>
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
						onPress={() => router.back()}
						hitSlop={12}
						style={[styles.close, { backgroundColor: theme.colors.surface }]}
					>
						<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>✕</Text>
					</Pressable>
				</View>

				{/* Sélecteur de période. */}
				<View style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
						{t("period.heading")}
					</Text>
					<View style={styles.segment}>
						{PERIOD_MONTHS.map((m) => {
							const active = months === m;
							return (
								<Pressable
									key={m}
									testID={`export-period-${m}`}
									accessibilityRole="button"
									accessibilityState={{ selected: active }}
									onPress={() => setMonths(m)}
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
										{t(`period.${m}`)}
									</Text>
								</Pressable>
							);
						})}
					</View>
				</View>

				{/* Identité optionnelle. */}
				<View style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
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
				</View>

				{/* Aperçu natif : points à consulter + dernière semaine. */}
				<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
					{t("preview.heading")}
				</Text>

				{hasData ? (
					<>
						<Card testID="export-consult" style={{ gap: theme.spacing.sm }}>
							<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
								{t("preview.consultTitle")}
							</Text>
							{consultLines.map((line) => (
								<View key={line} style={styles.bulletRow}>
									<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>•</Text>
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
								<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
									{t("preview.lastWeekTitle")}
								</Text>
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
					</>
				) : (
					<Card>
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("preview.empty")}
						</Text>
					</Card>
				)}

				<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
					{t("freeForever")}
				</Text>

				<PillButton
					label={busy ? t("generating") : t("generate")}
					testID="export-generate"
					onPress={onGenerate}
					loading={busy}
					disabled={!hasData}
					accessibilityLabel={t("generate")}
				/>
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
	segment: { flexDirection: "row", gap: 8 },
	segmentCell: {
		flex: 1,
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	input: {
		minHeight: 48,
		paddingHorizontal: 14,
		borderWidth: StyleSheet.hairlineWidth,
	},
	bulletRow: { flexDirection: "row", gap: 8 },
	bulletText: { flex: 1 },
	statLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
