import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "@/components/Icon";
import { ChipTrigger, DraftSheet, TapRow } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import type { SymptomEntry } from "@/db/schema";
import { type EntryTimestamp, nowEntryTimestamp } from "@/domain/dates";
import { useFlare } from "@/features/flare/FlareContext";
import { setComplications } from "@/repositories/dailyExtrasRepo";
import { commitDraft, type DraftInput, newEntryId, upsertDraft } from "@/repositories/symptomRepo";
import { haptics } from "@/services/haptics";
import { useTheme } from "@/theme";
import { Eyebrow, SheetIntro } from "./sheetKit";

interface SymptomSheetProps {
	visible: boolean;
	onClose: () => void;
	onSaved: () => void;
	resume?: SymptomEntry | null;
}

const ZONE_KEYS = ["lower_right", "lower_left", "lower_center", "diffuse"] as const;
const COMPLICATION_KEYS = [
	"arthralgia",
	"uveitis",
	"erythema_nodosum",
	"aphthae",
	"fissure",
	"fistula",
	"abscess",
] as const;

/** Symptômes de fin de journée (§5.3). Mêmes règles de brouillon. */
export function SymptomSheet({ visible, onClose, onSaved, resume }: SymptomSheetProps) {
	const { t } = useTranslation("log");
	const theme = useTheme();
	const snackbar = useSnackbar();
	const { flare } = useFlare();

	const [entryId, setEntryId] = useState(newEntryId);
	const [occurred, setOccurred] = useState<EntryTimestamp>(nowEntryTimestamp);
	const [pain, setPain] = useState<number | null>(null);
	const [painZone, setPainZone] = useState<string | null>(null);
	const [fatigue, setFatigue] = useState<number | null>(null);
	const [wellbeing, setWellbeing] = useState<number | null>(null);
	const [complications, setComplicationList] = useState<string[]>([]);
	const [notes, setNotes] = useState("");
	const [notesOpen, setNotesOpen] = useState(false);
	// Mode poussée (§5.6) : essentiel = douleur + forme ; le reste replié.
	const [expanded, setExpanded] = useState(false);
	const showExtras = !flare.active || expanded;

	useEffect(() => {
		if (!visible) return;
		setExpanded(false);
		const now = nowEntryTimestamp();
		if (resume) {
			setEntryId(resume.id);
			setOccurred({ epochMs: resume.occurredAt, tz: resume.tz, localDate: resume.localDate });
			setPain(resume.pain ?? null);
			setPainZone(resume.painZone ?? null);
			setFatigue(resume.fatigue ?? null);
			setWellbeing(resume.wellbeing ?? null);
			setComplicationList(resume.extraIntestinal ?? []);
			setNotes(resume.notes ?? "");
			setNotesOpen(Boolean(resume.notes));
			return;
		}
		setEntryId(newEntryId());
		setOccurred(now);
		setPain(null);
		setPainZone(null);
		setFatigue(null);
		setWellbeing(null);
		setComplicationList([]);
		setNotes("");
		setNotesOpen(false);
	}, [visible, resume]);

	const persist = useCallback(
		(patch: Partial<DraftInput>) => {
			const draft: DraftInput = {
				id: entryId,
				kind: "symptom",
				occurredAt: occurred.epochMs,
				tz: occurred.tz,
				localDate: occurred.localDate,
				pain,
				painZone,
				fatigue,
				wellbeing,
				extraIntestinal: complications,
				notes: notes.trim() ? notes.trim() : null,
				...patch,
			};
			void upsertDraft(draft);
		},
		[entryId, occurred, pain, painZone, fatigue, wellbeing, complications, notes],
	);

	const toggleComplication = (key: string) => {
		const next = complications.includes(key)
			? complications.filter((c) => c !== key)
			: [...complications, key];
		setComplicationList(next);
		persist({ extraIntestinal: next });
	};

	const canSave =
		wellbeing !== null ||
		(pain ?? 0) > 0 ||
		(fatigue ?? 0) > 0 ||
		complications.length > 0 ||
		notes.trim().length > 0;

	const save = async () => {
		if (!canSave) return;
		try {
			// Loi 2 : persiste l'état courant complet AVANT le commit (les notes ne
			// sont persistées qu'au blur et peuvent activer Save sans brouillon).
			await upsertDraft({
				id: entryId,
				kind: "symptom",
				occurredAt: occurred.epochMs,
				tz: occurred.tz,
				localDate: occurred.localDate,
				pain,
				painZone,
				fatigue,
				wellbeing,
				extraIntestinal: complications,
				notes: notes.trim() ? notes.trim() : null,
			});
			await commitDraft(entryId);
			if (complications.length > 0) {
				await setComplications(occurred.localDate, complications);
			}
			// Loi 2 : commit OK → petit succès haptique (jamais sur échec).
			haptics.success();
			snackbar.show({ message: t("symptom.saved") });
			onSaved();
			onClose();
		} catch {
			// Échec jamais silencieux : le brouillon (autosave) est intact, la sheet
			// reste ouverte pour réessayer.
			snackbar.show({ message: t("saveError") });
		}
	};

	const levels = (max: number) =>
		Array.from({ length: max + 1 }, (_, i) => ({ value: i, label: t(`symptom.levels.${i}`) }));
	const wellbeingLevels = Array.from({ length: 5 }, (_, i) => ({
		value: i,
		label: t(`symptom.wellbeingLevels.${i}`),
		testID: `wellbeing-${i}`,
	}));

	return (
		<DraftSheet
			visible={visible}
			onClose={onClose}
			title={t("symptom.title")}
			confirmLabel={t("symptom.save")}
			onConfirm={save}
			confirmDisabled={!canSave}
			confirmTestID="symptom-save"
			confirmAccessibilityLabel={t("symptom.save")}
		>
			<SheetIntro icon="pulse" tint="pain" soft="painSoft" text={t("symptom.subtitle")} />
			<View style={{ gap: theme.spacing.sm }}>
				<Eyebrow>{t("symptom.wellbeing")}</Eyebrow>
				<TapRow
					accessibilityLabel={t("symptom.wellbeing")}
					options={wellbeingLevels}
					value={wellbeing}
					onChange={(v) => {
						setWellbeing(v);
						persist({ wellbeing: v });
					}}
					tint="energy"
				/>
			</View>
			<View style={{ gap: theme.spacing.sm }}>
				<Eyebrow>{t("symptom.pain")}</Eyebrow>
				<TapRow
					accessibilityLabel={t("symptom.pain")}
					options={levels(3)}
					value={pain}
					onChange={(v) => {
						setPain(v);
						persist({ pain: v });
					}}
					tint="pain"
				/>
			</View>
			{showExtras ? (
				<>
					<View style={{ gap: theme.spacing.sm }}>
						<Eyebrow>{t("symptom.painZone")}</Eyebrow>
						<View style={styles.chipWrap}>
							{ZONE_KEYS.map((zone) => (
								<ChipTrigger
									key={zone}
									label={t(`symptom.zones.${zone}`)}
									tint="pain"
									selected={painZone === zone}
									onPress={() => {
										const next = painZone === zone ? null : zone;
										setPainZone(next);
										persist({ painZone: next });
									}}
								/>
							))}
						</View>
					</View>
					<View style={{ gap: theme.spacing.sm }}>
						<Eyebrow>{t("symptom.fatigue")}</Eyebrow>
						<TapRow
							accessibilityLabel={t("symptom.fatigue")}
							options={levels(3)}
							value={fatigue}
							onChange={(v) => {
								setFatigue(v);
								persist({ fatigue: v });
							}}
							tint="energy"
						/>
					</View>
					<View style={{ gap: theme.spacing.sm }}>
						<Eyebrow>{t("symptom.extraIntestinal")}</Eyebrow>
						<View style={styles.chipWrap}>
							{COMPLICATION_KEYS.map((key) => (
								<ChipTrigger
									key={key}
									label={t(`symptom.complications.${key}`)}
									tint="stool"
									selected={complications.includes(key)}
									onPress={() => toggleComplication(key)}
								/>
							))}
						</View>
					</View>
					<View style={{ gap: theme.spacing.sm }}>
						{notesOpen ? (
							<TextInput
								accessibilityLabel={t("symptom.notes")}
								placeholder={t("symptom.notesPlaceholder")}
								placeholderTextColor={theme.colors.textFaint}
								value={notes}
								onChangeText={setNotes}
								onBlur={() => persist({ notes: notes.trim() ? notes.trim() : null })}
								multiline
								style={[
									styles.notes,
									theme.typography.body,
									{
										color: theme.colors.text,
										backgroundColor: theme.colors.surface,
										borderRadius: theme.radii.md,
									},
								]}
							/>
						) : (
							<Pressable
								accessibilityRole="button"
								onPress={() => setNotesOpen(true)}
								style={({ pressed }) => [styles.moreRow, { opacity: pressed ? 0.6 : 1 }]}
							>
								<Icon name="plus" size={16} color={theme.colors.meal} strokeWidth={1.8} />
								<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
									{t("symptom.addNote")}
								</Text>
							</Pressable>
						)}
					</View>
				</>
			) : (
				<Pressable
					accessibilityRole="button"
					testID="symptom-more"
					onPress={() => setExpanded(true)}
					style={({ pressed }) => [styles.moreRow, { opacity: pressed ? 0.6 : 1 }]}
				>
					<Icon name="plus" size={16} color={theme.colors.meal} strokeWidth={1.8} />
					<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
						{t("showMore")}
					</Text>
				</Pressable>
			)}
		</DraftSheet>
	);
}

const styles = StyleSheet.create({
	chipWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	moreRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		alignSelf: "flex-start",
		minHeight: 32,
	},
	notes: {
		minHeight: 80,
		padding: 12,
		textAlignVertical: "top",
	},
});
