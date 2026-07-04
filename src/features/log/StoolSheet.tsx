import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BristolIcon, type BristolType } from "@/components/BristolIcon";
import { DraftSheet, TapRow } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import type { SymptomEntry } from "@/db/schema";
import { type EntryTimestamp, nowEntryTimestamp } from "@/domain/dates";
import {
	commitDraft,
	type DraftInput,
	getLastUsedValues,
	newEntryId,
	upsertDraft,
} from "@/repositories/symptomRepo";
import { useTheme } from "@/theme";
import { TimeChips, type TimeMode } from "./TimeChips";

interface StoolSheetProps {
	visible: boolean;
	onClose: () => void;
	onSaved: () => void;
	/** Brouillon à reprendre (badge « brouillon »). */
	resume?: SymptomEntry | null;
}

const BRISTOL_TYPES: BristolType[] = [1, 2, 3, 4, 5, 6, 7];

/** Selle rapide (§5.2) — cible 3 taps < 5 s. Autosave à chaque tap. */
export function StoolSheet({ visible, onClose, onSaved, resume }: StoolSheetProps) {
	const { t } = useTranslation("log");
	const theme = useTheme();
	const snackbar = useSnackbar();

	const [entryId, setEntryId] = useState(newEntryId);
	const [base, setBase] = useState<EntryTimestamp>(nowEntryTimestamp);
	const [occurred, setOccurred] = useState<EntryTimestamp>(base);
	const [timeMode, setTimeMode] = useState<TimeMode>("now");
	const [bristol, setBristol] = useState<BristolType | null>(null);
	const [urgency, setUrgency] = useState(0);
	const [blood, setBlood] = useState(0);
	const [pain, setPain] = useState(0);

	// Initialisation à l'ouverture : reprise de brouillon ou défauts intelligents.
	useEffect(() => {
		if (!visible) return;
		const now = nowEntryTimestamp();
		if (resume) {
			setEntryId(resume.id);
			const ts: EntryTimestamp = {
				epochMs: resume.occurredAt,
				tz: resume.tz,
				localDate: resume.localDate,
			};
			setBase(now);
			setOccurred(ts);
			setTimeMode("custom");
			setBristol((resume.bristol as BristolType | null) ?? null);
			setUrgency(resume.urgency ?? 0);
			setBlood(resume.blood ?? 0);
			setPain(resume.pain ?? 0);
			return;
		}
		setEntryId(newEntryId());
		setBase(now);
		setOccurred(now);
		setTimeMode("now");
		setUrgency(0);
		setBlood(0);
		setPain(0);
		// Défaut intelligent : dernier Bristol utilisé.
		getLastUsedValues("stool").then((last) => {
			setBristol((last?.bristol as BristolType | null) ?? null);
		});
	}, [visible, resume]);

	// Autosave : upsert du brouillon à chaque changement.
	const persist = useCallback(
		(patch: Partial<Omit<DraftInput, "id" | "kind" | "occurredAt" | "tz" | "localDate">>) => {
			const draft: DraftInput = {
				id: entryId,
				kind: "stool",
				occurredAt: occurred.epochMs,
				tz: occurred.tz,
				localDate: occurred.localDate,
				bristol,
				urgency,
				blood,
				pain,
				...patch,
			};
			void upsertDraft(draft);
		},
		[entryId, occurred, bristol, urgency, blood, pain],
	);

	const chooseBristol = (value: BristolType) => {
		setBristol(value);
		persist({ bristol: value });
	};
	const chooseTime = (mode: TimeMode, ts: EntryTimestamp) => {
		setTimeMode(mode);
		setOccurred(ts);
		void upsertDraft({
			id: entryId,
			kind: "stool",
			occurredAt: ts.epochMs,
			tz: ts.tz,
			localDate: ts.localDate,
			bristol,
			urgency,
			blood,
			pain,
		});
	};

	const save = async () => {
		if (bristol == null) return;
		await commitDraft(entryId);
		snackbar.show({ message: t("stool.saved") });
		onSaved();
		onClose();
	};

	const levelOptions = (key: "urgencyLevels" | "bloodLevels" | "painLevels", max: number) =>
		Array.from({ length: max + 1 }, (_, i) => ({
			value: i,
			label: t(`stool.${key}.${i}`),
		}));

	return (
		<DraftSheet
			visible={visible}
			onClose={onClose}
			title={t("stool.title")}
			confirmLabel={t("stool.save")}
			onConfirm={save}
			confirmDisabled={bristol == null}
			confirmAccessibilityLabel={t("stool.save")}
		>
			<View style={{ gap: theme.spacing.sm }}>
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
					{t("stool.bristol")}
				</Text>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: 2 }}
				>
					{BRISTOL_TYPES.map((type) => {
						const selected = bristol === type;
						return (
							<Pressable
								key={type}
								accessibilityRole="radio"
								accessibilityState={{ selected }}
								accessibilityLabel={`Type ${type}`}
								onPress={() => chooseBristol(type)}
								style={[
									styles.bristolCell,
									{
										borderRadius: theme.radii.md,
										backgroundColor: selected ? theme.colors.surface : "transparent",
										borderColor: selected ? theme.colors.stool : theme.colors.border,
									},
								]}
							>
								<BristolIcon type={type} selected={selected} size={40} />
								<Text
									style={[
										theme.typography.caption,
										{ color: selected ? theme.colors.stool : theme.colors.textMuted },
									]}
								>
									{type}
								</Text>
							</Pressable>
						);
					})}
				</ScrollView>
			</View>

			<TapRow
				title={t("stool.urgency")}
				options={levelOptions("urgencyLevels", 3)}
				value={urgency}
				onChange={(v) => {
					setUrgency(v);
					persist({ urgency: v });
				}}
				tint="pain"
			/>
			<TapRow
				title={t("stool.blood")}
				options={levelOptions("bloodLevels", 2)}
				value={blood}
				onChange={(v) => {
					setBlood(v);
					persist({ blood: v });
				}}
				tint="blood"
			/>
			<TapRow
				title={t("stool.pain")}
				options={levelOptions("painLevels", 3)}
				value={pain}
				onChange={(v) => {
					setPain(v);
					persist({ pain: v });
				}}
				tint="pain"
			/>

			<View style={{ gap: theme.spacing.xs }}>
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
					{t("stool.time")}
				</Text>
				<TimeChips base={base} mode={timeMode} value={occurred} onChange={chooseTime} />
			</View>
		</DraftSheet>
	);
}

const styles = StyleSheet.create({
	bristolCell: {
		width: 56,
		minHeight: 72,
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		borderWidth: StyleSheet.hairlineWidth,
	},
});
