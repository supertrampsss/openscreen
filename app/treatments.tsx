/**
 * Écran Traitements (§5.9) — poussé plein écran depuis Réglages / carte Home.
 *
 * Liste des traitements actifs (nom, cadence, prochaine échéance, observance 90 j),
 * bouton « Fait » un-tap (undo snackbar, recalcule l'échéance + re-programme les
 * rappels), ajout/édition (nom + type + cadence), effets secondaires en 2 taps,
 * historique replié. Au premier passage, propose de créer les traitements saisis
 * à l'onboarding (pré-remplis).
 */

import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
	type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Card, ChipTrigger, DraftSheet, FadeInView, PillButton, TapRow } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import type { Treatment, TreatmentEvent, TreatmentKind } from "@/db/schema";
import { TREATMENT_KINDS } from "@/db/schema";
import { nowEntryTimestamp } from "@/domain/dates";
import {
	type Adherence,
	CADENCE_WEEKS_OPTIONS,
	daysBetweenLocalDates,
	isDueSoon,
} from "@/domain/treatments";
import * as repo from "@/repositories/treatmentRepo";
import { haptics } from "@/services/haptics";
import { syncTreatmentReminders } from "@/services/notificationService";
import {
	createFromProposals,
	type OnboardingSeedProposal,
	onboardingSeedProposal,
} from "@/services/treatmentService";
import { useTheme } from "@/theme";

/** Décalage d'apparition en cascade (§3, plafonné pour rester calme). */
const STAGGER = 40;
const staggerDelay = (i: number) => Math.min(i, 7) * STAGGER;

/** Type nécessitant une cadence (biothérapies injectable / perfusion). */
function needsCadence(kind: TreatmentKind): boolean {
	return kind === "biologic_injection" || kind === "infusion";
}

const SIDE_EFFECT_CHIPS = [
	"nausea",
	"headache",
	"fatigue",
	"rash",
	"injection_site",
	"infection",
	"joint_pain",
	"other",
] as const;

interface TreatmentView {
	treatment: Treatment;
	adherence: Adherence | null;
	takenToday: boolean;
	events: TreatmentEvent[];
}

export default function TreatmentsScreen() {
	const { t } = useTranslation("treatments");
	const { t: tc } = useTranslation("common");
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const snackbar = useSnackbar();

	const [items, setItems] = useState<TreatmentView[]>([]);
	const [proposals, setProposals] = useState<OnboardingSeedProposal[]>([]);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});

	// Formulaire ajout/édition.
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Treatment | null>(null);
	const [name, setName] = useState("");
	const [kind, setKind] = useState<TreatmentKind>("biologic_injection");
	const [cadence, setCadence] = useState<number | null>(2);

	// Effet secondaire.
	const [sideOpen, setSideOpen] = useState(false);
	const [sideTarget, setSideTarget] = useState<Treatment | null>(null);
	const [sideChips, setSideChips] = useState<string[]>([]);
	const [sideNote, setSideNote] = useState("");

	const today = nowEntryTimestamp().localDate;

	const reload = useCallback(async () => {
		const active = await repo.listActive();
		const views = await Promise.all(
			active.map(async (treatment) => ({
				treatment,
				adherence: await repo.adherenceRate(treatment.id, 90),
				takenToday: await repo.hasTakenToday(treatment.id),
				events: await repo.listEvents(treatment.id, 20),
			})),
		);
		setItems(views);
		setProposals(await onboardingSeedProposal());
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const close = () => {
		if (router.canGoBack()) router.back();
		else router.replace("/(tabs)");
	};

	// --- Seed onboarding ---------------------------------------------------
	const acceptSeed = async () => {
		await createFromProposals(
			proposals.map((p) => ({
				name: t(`kinds.${p.kind}`),
				kind: p.kind,
				cadenceWeeks: p.cadenceWeeks,
			})),
		);
		await syncTreatmentReminders();
		haptics.success();
		await reload();
	};

	// --- Formulaire --------------------------------------------------------
	const openAdd = () => {
		setEditing(null);
		setName("");
		setKind("biologic_injection");
		setCadence(2);
		setFormOpen(true);
	};

	const openEdit = (tr: Treatment) => {
		haptics.selection();
		setEditing(tr);
		setName(tr.name);
		setKind((tr.kind as TreatmentKind) ?? "other");
		setCadence(tr.cadenceWeeks ?? (needsCadence((tr.kind as TreatmentKind) ?? "other") ? 2 : null));
		setFormOpen(true);
	};

	const saveForm = async () => {
		const cadenceWeeks = needsCadence(kind) ? (cadence ?? 2) : null;
		if (editing) await repo.update(editing.id, { name, kind, cadenceWeeks });
		else await repo.create({ name, kind, cadenceWeeks });
		setFormOpen(false);
		await syncTreatmentReminders();
		haptics.success();
		await reload();
	};

	const confirmDelete = () => {
		if (!editing) return;
		Alert.alert(t("form.deleteConfirmTitle"), t("form.deleteConfirmBody"), [
			{ text: tc("actions.cancel"), style: "cancel" },
			{
				text: t("form.delete"),
				style: "destructive",
				onPress: async () => {
					await repo.softDelete(editing.id);
					setFormOpen(false);
					await syncTreatmentReminders();
					await reload();
				},
			},
		]);
	};

	// --- Prise (Fait) avec undo -----------------------------------------
	const markTaken = async (tr: Treatment) => {
		const res = await repo.markTaken(tr.id);
		await syncTreatmentReminders();
		haptics.success();
		await reload();
		snackbar.show({
			message: t("takenToast"),
			actionLabel: t("undo"),
			onAction: async () => {
				await repo.undoTaken(tr.id, res.eventId, res.previousNextDue);
				await syncTreatmentReminders();
				await reload();
			},
		});
	};

	// --- Effet secondaire --------------------------------------------------
	const openSide = (tr: Treatment) => {
		setSideTarget(tr);
		setSideChips([]);
		setSideNote("");
		setSideOpen(true);
	};

	const saveSide = async () => {
		if (sideTarget) {
			await repo.addSideEffect(
				sideTarget.id,
				sideChips.map((c) => t(`sideEffect.chips.${c}`)),
				sideNote,
			);
		}
		setSideOpen(false);
		haptics.success();
		snackbar.show({ message: t("sideEffect.saved") });
		await reload();
	};

	const dueLabel = (tr: Treatment): string => {
		if (!tr.nextDue) return t("nextDue.none");
		const delta = daysBetweenLocalDates(today, tr.nextDue);
		if (delta === 0) return t("nextDue.today");
		if (delta < 0) return t("nextDue.overdue", { count: -delta });
		return t("nextDue.inDays", { count: delta });
	};

	const cadenceLabel = (tr: Treatment): string =>
		tr.cadenceWeeks ? t("cadence.everyWeeks", { count: tr.cadenceWeeks }) : t("cadence.none");

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
				<FadeInView delay={staggerDelay(0)} style={styles.header}>
					<View style={styles.headerText}>
						<Text style={[theme.typography.title, { color: theme.colors.text }]}>{t("title")}</Text>
						<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
							{t("subtitle")}
						</Text>
					</View>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("close")}
						testID="treatments-close"
						onPress={() => {
							haptics.selection();
							close();
						}}
						hitSlop={12}
						style={[styles.close, { backgroundColor: theme.colors.surface }]}
					>
						<Icon name="x" size={18} color={theme.colors.text} strokeWidth={1.9} />
					</Pressable>
				</FadeInView>

				{/* Proposition de seed depuis l'onboarding (table encore vide). */}
				{proposals.length > 0 ? (
					<FadeInView delay={staggerDelay(1)}>
						<Card
							testID="treatment-seed"
							style={{ gap: theme.spacing.md, backgroundColor: theme.colors.flareBackground }}
						>
							<View style={styles.seedHead}>
								<View style={[styles.avatar, { backgroundColor: theme.colors.card }]}>
									<Icon name="sparkles" size={20} color={theme.colors.brand} strokeWidth={1.7} />
								</View>
								<Text
									style={[
										theme.typography.subheading,
										styles.seedTitle,
										{ color: theme.colors.text },
									]}
								>
									{t("seed.title")}
								</Text>
							</View>
							<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
								{t("seed.body")}
							</Text>
							<PillButton
								label={t("seed.confirm")}
								testID="treatment-seed-confirm"
								onPress={() => void acceptSeed()}
								accessibilityLabel={t("seed.confirm")}
							/>
							<PillButton
								label={t("seed.dismiss")}
								variant="secondary"
								onPress={() => setProposals([])}
								accessibilityLabel={t("seed.dismiss")}
							/>
						</Card>
					</FadeInView>
				) : null}

				{items.length === 0 && proposals.length === 0 ? (
					<FadeInView delay={staggerDelay(1)}>
						<Card style={styles.emptyCard}>
							<View style={[styles.emptyIcon, { backgroundColor: theme.colors.brandSoft }]}>
								<Icon name="capsule" size={28} color={theme.colors.brand} strokeWidth={1.7} />
							</View>
							<Text
								style={[theme.typography.body, styles.emptyText, { color: theme.colors.textMuted }]}
							>
								{t("empty")}
							</Text>
						</Card>
					</FadeInView>
				) : null}

				{items.map((it, i) => {
					const soon = it.treatment.nextDue ? isDueSoon(it.treatment.nextDue, today, 2) : false;
					const highlight = soon && !it.takenToday;
					const cardStyle: ViewStyle[] = [{ gap: theme.spacing.md }];
					if (highlight) {
						cardStyle.push({
							backgroundColor: theme.colors.flareBackground,
							borderColor: theme.colors.flareBorder,
							borderWidth: StyleSheet.hairlineWidth,
						});
					}
					return (
						<FadeInView key={it.treatment.id} delay={staggerDelay(2 + i)}>
							<Card testID="treatment-item" style={cardStyle}>
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={it.treatment.name}
									onPress={() => openEdit(it.treatment)}
									style={styles.itemHead}
								>
									<View
										style={[
											styles.avatar,
											{
												backgroundColor: highlight ? theme.colors.painSoft : theme.colors.brandSoft,
											},
										]}
									>
										<Icon
											name="capsule"
											size={22}
											color={highlight ? theme.colors.pain : theme.colors.brand}
											strokeWidth={1.8}
										/>
									</View>
									<View style={styles.itemHeadText}>
										<Text
											testID="treatment-name"
											style={[theme.typography.subheading, { color: theme.colors.text }]}
										>
											{it.treatment.name}
										</Text>
										<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
											{t(`kinds.${(it.treatment.kind as TreatmentKind) ?? "other"}`)} ·{" "}
											{cadenceLabel(it.treatment)}
										</Text>
									</View>
									<Icon
										name="chevronRight"
										size={20}
										color={theme.colors.textFaint}
										strokeWidth={1.8}
									/>
								</Pressable>

								<View style={styles.metaRow}>
									<View
										style={[
											styles.badge,
											{ backgroundColor: highlight ? theme.colors.painSoft : theme.colors.surface },
										]}
									>
										<Icon
											name="bell"
											size={13}
											color={highlight ? theme.colors.pain : theme.colors.textMuted}
											strokeWidth={1.8}
										/>
										<Text
											style={[
												theme.typography.caption,
												{ color: highlight ? theme.colors.pain : theme.colors.text },
											]}
										>
											{dueLabel(it.treatment)}
										</Text>
									</View>
									{it.adherence ? (
										<View style={[styles.badge, { backgroundColor: theme.colors.surface }]}>
											<Text
												testID="treatment-adherence"
												style={[theme.typography.caption, { color: theme.colors.textMuted }]}
											>
												{t("adherence.label")} ·{" "}
												{t("adherence.value", {
													taken: it.adherence.taken,
													expected: it.adherence.expected,
												})}
											</Text>
										</View>
									) : null}
								</View>

								<View style={styles.actionRow}>
									<PillButton
										label={it.takenToday ? t("takenToday") : t("markTaken")}
										testID="treatment-mark-taken"
										accessibilityLabel={it.takenToday ? t("takenToday") : t("markTaken")}
										disabled={it.takenToday}
										fullWidth={false}
										onPress={() => void markTaken(it.treatment)}
									/>
									<PillButton
										label={t("sideEffect.button")}
										variant="secondary"
										fullWidth={false}
										testID="treatment-side-effect"
										accessibilityLabel={t("sideEffect.button")}
										onPress={() => openSide(it.treatment)}
									/>
								</View>

								{/* Historique replié. */}
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={
										expanded[it.treatment.id] ? t("history.hide") : t("history.show")
									}
									accessibilityState={{ expanded: !!expanded[it.treatment.id] }}
									hitSlop={8}
									style={styles.historyToggle}
									onPress={() => {
										haptics.selection();
										setExpanded((e) => ({ ...e, [it.treatment.id]: !e[it.treatment.id] }));
									}}
								>
									<Text style={[theme.typography.caption, { color: theme.colors.meal }]}>
										{expanded[it.treatment.id] ? t("history.hide") : t("history.show")}
									</Text>
								</Pressable>
								{expanded[it.treatment.id] ? (
									<View style={{ gap: theme.spacing.xs }}>
										{it.events.length === 0 ? (
											<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
												{t("history.empty")}
											</Text>
										) : (
											it.events.map((ev) => (
												<Text
													key={ev.id}
													style={[theme.typography.caption, { color: theme.colors.textMuted }]}
												>
													{ev.localDate} · {t(`history.${ev.kind ?? "taken"}`)}
													{ev.notes ? ` — ${ev.notes}` : ""}
												</Text>
											))
										)}
									</View>
								) : null}
							</Card>
						</FadeInView>
					);
				})}

				<FadeInView delay={staggerDelay(7)}>
					<PillButton
						label={t("add")}
						variant="secondary"
						testID="treatments-add"
						accessibilityLabel={t("add")}
						onPress={openAdd}
					/>
				</FadeInView>
			</ScrollView>

			{/* Formulaire ajout / édition. */}
			<DraftSheet
				visible={formOpen}
				onClose={() => setFormOpen(false)}
				title={editing ? t("form.editTitle") : t("form.addTitle")}
			>
				<View style={{ gap: theme.spacing.md }}>
					<TextInput
						accessibilityLabel={t("form.namePlaceholder")}
						testID="treatment-name-input"
						placeholder={t("form.namePlaceholder")}
						placeholderTextColor={theme.colors.textFaint}
						value={name}
						onChangeText={setName}
						style={[
							styles.input,
							theme.typography.body,
							{
								color: theme.colors.text,
								backgroundColor: theme.colors.surface,
								borderRadius: theme.radii.md,
							},
						]}
					/>

					<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
						{t("form.kindLabel")}
					</Text>
					<TapRow
						options={TREATMENT_KINDS.map((k) => ({
							value: k,
							label: t(`kinds.${k}`),
							testID: `treatment-kind-${k}`,
						}))}
						value={kind}
						onChange={(k) => {
							setKind(k);
							if (needsCadence(k) && cadence == null) setCadence(2);
						}}
						tint="meal"
					/>

					{needsCadence(kind) ? (
						<View style={{ gap: theme.spacing.sm }}>
							<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
								{t("form.cadenceLabel")}
							</Text>
							<Text style={[theme.typography.caption, { color: theme.colors.textFaint }]}>
								{t("form.cadenceHint")}
							</Text>
							<TapRow
								options={CADENCE_WEEKS_OPTIONS.map((n) => ({
									value: n,
									label: t("cadence.everyWeeks", { count: n }),
									testID: `treatment-cadence-${n}`,
								}))}
								value={cadence}
								onChange={setCadence}
								tint="meal"
							/>
						</View>
					) : null}

					<PillButton
						label={t("form.save")}
						testID="treatment-save"
						disabled={name.trim().length === 0}
						onPress={() => void saveForm()}
						accessibilityLabel={t("form.save")}
					/>
					{editing ? (
						<PillButton
							label={t("form.delete")}
							variant="secondary"
							onPress={confirmDelete}
							accessibilityLabel={t("form.delete")}
						/>
					) : null}
				</View>
			</DraftSheet>

			{/* Effet secondaire (2 taps). */}
			<DraftSheet
				visible={sideOpen}
				onClose={() => setSideOpen(false)}
				title={t("sideEffect.title")}
			>
				<View style={{ gap: theme.spacing.md }}>
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{t("sideEffect.subtitle")}
					</Text>
					<View style={styles.chips}>
						{SIDE_EFFECT_CHIPS.map((c) => (
							<ChipTrigger
								key={c}
								label={t(`sideEffect.chips.${c}`)}
								selected={sideChips.includes(c)}
								onPress={() =>
									setSideChips((prev) =>
										prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
									)
								}
							/>
						))}
					</View>
					<TextInput
						accessibilityLabel={t("sideEffect.notePlaceholder")}
						placeholder={t("sideEffect.notePlaceholder")}
						placeholderTextColor={theme.colors.textFaint}
						value={sideNote}
						onChangeText={setSideNote}
						style={[
							styles.input,
							theme.typography.body,
							{
								color: theme.colors.text,
								backgroundColor: theme.colors.surface,
								borderRadius: theme.radii.md,
							},
						]}
					/>
					<PillButton
						label={t("sideEffect.save")}
						testID="treatment-side-save"
						disabled={sideChips.length === 0 && sideNote.trim().length === 0}
						onPress={() => void saveSide()}
						accessibilityLabel={t("sideEffect.save")}
					/>
				</View>
			</DraftSheet>
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
	itemHead: { flexDirection: "row", alignItems: "center", gap: 12 },
	itemHeadText: { flex: 1, gap: 2 },
	avatar: {
		width: 42,
		height: 42,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	seedHead: { flexDirection: "row", alignItems: "center", gap: 12 },
	seedTitle: { flex: 1 },
	emptyCard: { alignItems: "center", gap: 12, paddingVertical: 28 },
	emptyIcon: {
		width: 56,
		height: 56,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyText: { textAlign: "center" },
	historyToggle: { paddingVertical: 6 },
	metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 999,
	},
	actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
	input: { minHeight: 48, paddingHorizontal: 14 },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
