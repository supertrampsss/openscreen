import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BristolIcon, type BristolType } from "@/components/BristolIcon";
import { Card } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import type { SymptomEntry } from "@/db/schema";
import {
	describeLocalDate,
	formatClock,
	groupByLocalDate,
	localDateDaysAgo,
	nowEntryTimestamp,
} from "@/domain/dates";
import { StoolSheet } from "@/features/log/StoolSheet";
import { SymptomSheet } from "@/features/log/SymptomSheet";
import { listAll, restore, softDelete } from "@/repositories/symptomRepo";
import { useTheme } from "@/theme";

interface Section {
	title: string;
	localDate: string;
	stools: number;
	worstPain: number | null;
	data: SymptomEntry[];
}

export default function JournalScreen() {
	const { t } = useTranslation(["journal", "common"]);
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const snackbar = useSnackbar();

	const [sections, setSections] = useState<Section[]>([]);
	const [resume, setResume] = useState<SymptomEntry | null>(null);
	const [stoolOpen, setStoolOpen] = useState(false);
	const [symptomOpen, setSymptomOpen] = useState(false);

	const today = nowEntryTimestamp().localDate;
	const yesterday = localDateDaysAgo(1);

	const reload = useCallback(() => {
		listAll(500).then((entries) => {
			const grouped = groupByLocalDate(entries);
			setSections(
				grouped.map(([localDate, dayEntries]) => {
					const stools = dayEntries.filter((e) => e.kind === "stool").length;
					const pains = dayEntries.map((e) => e.pain ?? 0);
					const worstPain = pains.length > 0 ? Math.max(...pains) : null;
					const label =
						localDate === today
							? t("today")
							: localDate === yesterday
								? t("yesterday")
								: formatDate(localDate);
					return { title: label, localDate, stools, worstPain, data: dayEntries };
				}),
			);
		});
	}, [t, today, yesterday]);

	useFocusEffect(
		useCallback(() => {
			reload();
		}, [reload]),
	);

	const openFor = (entry: SymptomEntry) => {
		setResume(entry);
		if (entry.kind === "stool") setStoolOpen(true);
		else setSymptomOpen(true);
	};

	const remove = async (entry: SymptomEntry) => {
		await softDelete(entry.id);
		reload();
		snackbar.show({
			message: t("deleted"),
			actionLabel: t("undo"),
			onAction: async () => {
				await restore(entry.id);
				reload();
			},
		});
	};

	if (sections.length === 0) {
		return (
			<View
				style={[styles.empty, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
			>
				<Text style={[theme.typography.heading, { color: theme.colors.text }]}>{t("empty")}</Text>
				<Text style={[theme.typography.body, styles.center, { color: theme.colors.textMuted }]}>
					{t("emptyHint")}
				</Text>
			</View>
		);
	}

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			<SectionList
				sections={sections}
				keyExtractor={(item) => item.id}
				contentContainerStyle={{
					padding: theme.spacing.lg,
					paddingTop: insets.top + theme.spacing.md,
					paddingBottom: insets.bottom + 24,
					gap: theme.spacing.sm,
				}}
				stickySectionHeadersEnabled={false}
				renderSectionHeader={({ section }) => (
					<View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
						<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
							{(section as Section).title}
						</Text>
						<View style={styles.badges}>
							{(section as Section).stools > 0 ? (
								<Badge
									text={t("badges.stools", { count: (section as Section).stools })}
									color={theme.colors.stool}
								/>
							) : null}
							{(section as Section).worstPain && (section as Section).worstPain! > 0 ? (
								<Badge
									text={t("badges.pain", { level: (section as Section).worstPain })}
									color={theme.colors.pain}
								/>
							) : null}
						</View>
					</View>
				)}
				renderItem={({ item }) => (
					<JournalRow entry={item} onPress={() => openFor(item)} onDelete={() => remove(item)} />
				)}
			/>

			<StoolSheet
				visible={stoolOpen}
				onClose={() => setStoolOpen(false)}
				onSaved={reload}
				resume={resume?.kind === "stool" ? resume : null}
			/>
			<SymptomSheet
				visible={symptomOpen}
				onClose={() => setSymptomOpen(false)}
				onSaved={reload}
				resume={resume?.kind === "symptom" ? resume : null}
			/>
		</View>
	);
}

function Badge({ text, color }: { text: string; color: string }) {
	const theme = useTheme();
	return (
		<View style={[styles.badge, { borderColor: color }]}>
			<Text style={[theme.typography.caption, { color }]}>{text}</Text>
		</View>
	);
}

function JournalRow({
	entry,
	onPress,
	onDelete,
}: {
	entry: SymptomEntry;
	onPress: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation(["journal", "common"]);
	const theme = useTheme();
	const isStool = entry.kind === "stool";

	return (
		<Card padding="md" style={styles.row}>
			<Pressable style={styles.rowMain} accessibilityRole="button" onPress={onPress}>
				{isStool && entry.bristol ? (
					<BristolIcon type={entry.bristol as BristolType} selected size={28} />
				) : (
					<Text style={styles.emoji}>{isStool ? "💩" : "🤕"}</Text>
				)}
				<View style={styles.rowBody}>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{isStool ? t("kinds.stool") : t("kinds.symptom")}
						{isStool && entry.bristol ? ` · ${t("entry.bristol", { value: entry.bristol })}` : ""}
					</Text>
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{formatClock(entry.occurredAt, entry.tz)}
						{entry.blood ? ` · ${t("entry.blood")}` : ""}
						{entry.isDraft ? ` · ${t("entry.draft")}` : ""}
					</Text>
				</View>
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("common:actions.delete")}
				onPress={onDelete}
				hitSlop={8}
				style={styles.delete}
			>
				<Text style={{ color: theme.colors.textFaint, fontSize: 20 }}>✕</Text>
			</Pressable>
		</Card>
	);
}

function formatDate(localDate: string): string {
	const { label, dayNumber } = describeLocalDate(localDate);
	const [, month] = localDate.split("-");
	return `${label} ${dayNumber}/${month}`;
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 32,
		gap: 8,
	},
	center: { textAlign: "center" },
	sectionHeader: {
		paddingTop: 12,
		paddingBottom: 8,
		gap: 8,
	},
	badges: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	badge: {
		paddingHorizontal: 10,
		paddingVertical: 3,
		borderRadius: 999,
		borderWidth: StyleSheet.hairlineWidth,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
	},
	rowMain: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	rowBody: {
		flex: 1,
		gap: 2,
	},
	emoji: { fontSize: 22 },
	delete: {
		paddingLeft: 12,
		paddingVertical: 8,
	},
});
