import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
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
import { FlareBanner } from "@/features/flare/FlareBanner";
import { FlareToggle } from "@/features/flare/FlareToggle";
import { MealSheet } from "@/features/log/MealSheet";
import { MealTriggerChips } from "@/features/log/MealTriggerChips";
import { StoolSheet } from "@/features/log/StoolSheet";
import { SymptomSheet } from "@/features/log/SymptomSheet";
import {
	listRecentCommittedWithItems,
	type MealWithItems,
	restore as restoreMeal,
	softDelete as softDeleteMeal,
} from "@/repositories/mealRepo";
import { listAll, restore, softDelete } from "@/repositories/symptomRepo";
import type { DataColorKey } from "@/theme";
import { useTheme } from "@/theme";

/** Élément unifié du journal : entrée symptôme/selle OU repas. */
type JournalItem =
	| { kind: "entry"; id: string; localDate: string; occurredAt: number; entry: SymptomEntry }
	| { kind: "meal"; id: string; localDate: string; occurredAt: number; meal: MealWithItems };

interface Section {
	title: string;
	localDate: string;
	stools: number;
	worstPain: number | null;
	meals: number;
	data: JournalItem[];
}

export default function JournalScreen() {
	const { t } = useTranslation(["journal", "common"]);
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const snackbar = useSnackbar();

	const { date: anchorDate } = useLocalSearchParams<{ date?: string }>();
	const listRef = useRef<SectionList<JournalItem, Section>>(null);

	const [sections, setSections] = useState<Section[]>([]);
	const [resume, setResume] = useState<SymptomEntry | null>(null);
	const [resumeMeal, setResumeMeal] = useState<MealWithItems | null>(null);
	const [stoolOpen, setStoolOpen] = useState(false);
	const [symptomOpen, setSymptomOpen] = useState(false);
	const [mealOpen, setMealOpen] = useState(false);

	const today = nowEntryTimestamp().localDate;
	const yesterday = localDateDaysAgo(1);

	const reload = useCallback(() => {
		Promise.all([listAll(500), listRecentCommittedWithItems(500)]).then(([entries, meals]) => {
			const feed: JournalItem[] = [
				...entries.map((entry) => ({
					kind: "entry" as const,
					id: entry.id,
					localDate: entry.localDate,
					occurredAt: entry.occurredAt,
					entry,
				})),
				...meals.map((meal) => ({
					kind: "meal" as const,
					id: meal.meal.id,
					localDate: meal.meal.localDate,
					occurredAt: meal.meal.occurredAt,
					meal,
				})),
			];
			const grouped = groupByLocalDate(feed);
			setSections(
				grouped.map(([localDate, dayItems]) => {
					const sorted = [...dayItems].sort((a, b) => b.occurredAt - a.occurredAt);
					const stools = sorted.filter(
						(i) => i.kind === "entry" && i.entry.kind === "stool",
					).length;
					const mealCount = sorted.filter((i) => i.kind === "meal").length;
					const pains = sorted.map((i) => (i.kind === "entry" ? (i.entry.pain ?? 0) : 0));
					const worstPain = pains.length > 0 ? Math.max(...pains) : null;
					const label =
						localDate === today
							? t("today")
							: localDate === yesterday
								? t("yesterday")
								: formatDate(localDate);
					return {
						title: label,
						localDate,
						stools,
						worstPain,
						meals: mealCount,
						data: sorted,
					};
				}),
			);
		});
	}, [t, today, yesterday]);

	useFocusEffect(
		useCallback(() => {
			reload();
		}, [reload]),
	);

	useEffect(() => {
		if (!anchorDate || sections.length === 0) return;
		const index = sections.findIndex((s) => s.localDate === anchorDate);
		if (index < 0) return;
		const id = setTimeout(() => {
			try {
				listRef.current?.scrollToLocation({
					sectionIndex: index,
					itemIndex: 0,
					viewOffset: 24,
					animated: true,
				});
			} catch {
				// La liste n'est pas encore mesurée : on ignore (pas critique).
			}
		}, 150);
		return () => clearTimeout(id);
	}, [anchorDate, sections]);

	const openEntry = (entry: SymptomEntry) => {
		setResume(entry);
		if (entry.kind === "stool") setStoolOpen(true);
		else setSymptomOpen(true);
	};

	const openMeal = (meal: MealWithItems) => {
		setResumeMeal(meal);
		setMealOpen(true);
	};

	const removeEntry = async (entry: SymptomEntry) => {
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

	const removeMeal = async (meal: MealWithItems) => {
		await softDeleteMeal(meal.meal.id);
		reload();
		snackbar.show({
			message: t("deleted"),
			actionLabel: t("undo"),
			onAction: async () => {
				await restoreMeal(meal.meal.id);
				reload();
			},
		});
	};

	const header = (
		<View style={styles.header}>
			<Text style={[theme.typography.title, { color: theme.colors.text }]}>{t("title")}</Text>
			<FlareBanner />
			<FlareToggle />
		</View>
	);

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			<SectionList
				ref={listRef}
				sections={sections}
				keyExtractor={(item) => item.id}
				onScrollToIndexFailed={() => undefined}
				contentContainerStyle={{
					padding: theme.spacing.lg,
					paddingTop: insets.top + theme.spacing.md,
					paddingBottom: insets.bottom + 24,
					gap: theme.spacing.sm,
				}}
				stickySectionHeadersEnabled={false}
				ListHeaderComponent={header}
				ListEmptyComponent={
					<View style={styles.emptyInline}>
						<View style={[styles.emptyIcon, { backgroundColor: theme.colors.brandSoft }]}>
							<Icon name="journal" size={30} color={theme.colors.brand} strokeWidth={1.7} />
						</View>
						<Text style={[theme.typography.heading, styles.center, { color: theme.colors.text }]}>
							{t("empty")}
						</Text>
						<Text style={[theme.typography.body, styles.center, { color: theme.colors.textMuted }]}>
							{t("emptyHint")}
						</Text>
					</View>
				}
				renderSectionHeader={({ section }) => {
					const s = section as Section;
					return (
						<View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
							<Text style={[theme.typography.overline, { color: theme.colors.textFaint }]}>
								{s.title}
							</Text>
							<View style={styles.badges}>
								{s.stools > 0 ? (
									<Badge text={t("badges.stools", { count: s.stools })} tint="stool" />
								) : null}
								{s.meals > 0 ? (
									<Badge text={t("badges.meals", { count: s.meals })} tint="meal" />
								) : null}
								{s.worstPain && s.worstPain > 0 ? (
									<Badge text={t("badges.pain", { level: s.worstPain })} tint="pain" />
								) : null}
							</View>
						</View>
					);
				}}
				renderItem={({ item }) =>
					item.kind === "entry" ? (
						<JournalRow
							entry={item.entry}
							onPress={() => openEntry(item.entry)}
							onDelete={() => removeEntry(item.entry)}
						/>
					) : (
						<MealRow
							meal={item.meal}
							onPress={() => openMeal(item.meal)}
							onDelete={() => removeMeal(item.meal)}
						/>
					)
				}
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
			<MealSheet
				visible={mealOpen}
				onClose={() => setMealOpen(false)}
				onSaved={reload}
				resume={resumeMeal}
			/>
		</View>
	);
}

/** Soft-fill de chaque teinte de donnée (pastille discrète du jour). */
const BADGE_SOFT: Record<"stool" | "meal" | "pain", "stoolSoft" | "mealSoft" | "painSoft"> = {
	stool: "stoolSoft",
	meal: "mealSoft",
	pain: "painSoft",
};

function Badge({ text, tint }: { text: string; tint: "stool" | "meal" | "pain" }) {
	const theme = useTheme();
	const color = theme.colors[tint as DataColorKey];
	return (
		<View style={[styles.badge, { backgroundColor: theme.colors[BADGE_SOFT[tint]] }]}>
			<View style={[styles.badgeDot, { backgroundColor: color }]} />
			<Text style={[theme.typography.caption, { color, fontWeight: theme.fontWeight.medium }]}>
				{text}
			</Text>
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

	const sub = [entry.blood ? t("entry.blood") : null, entry.isDraft ? t("entry.draft") : null]
		.filter(Boolean)
		.join(" · ");

	return (
		<Card padding="md" style={styles.row} testID="journal-entry">
			<Pressable style={styles.rowMain} accessibilityRole="button" onPress={onPress}>
				<View
					style={[
						styles.avatar,
						{ backgroundColor: isStool ? theme.colors.stoolSoft : theme.colors.painSoft },
					]}
				>
					<Icon
						name={isStool ? "stool" : "pulse"}
						size={20}
						color={isStool ? theme.colors.stool : theme.colors.pain}
						strokeWidth={1.8}
					/>
				</View>
				<View style={styles.rowBody}>
					<Text style={[styles.rowTitle, { color: theme.colors.text }]}>
						{isStool ? t("kinds.stool") : t("kinds.symptom")}
						{isStool && entry.bristol ? ` · ${t("entry.bristol", { value: entry.bristol })}` : ""}
					</Text>
					{sub ? (
						<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{sub}</Text>
					) : null}
				</View>
			</Pressable>
			<View style={styles.rowRight}>
				<Text style={[theme.typography.caption, styles.time, { color: theme.colors.textFaint }]}>
					{formatClock(entry.occurredAt, entry.tz)}
				</Text>
				<DeleteButton onDelete={onDelete} />
			</View>
		</Card>
	);
}

function MealRow({
	meal,
	onPress,
	onDelete,
}: {
	meal: MealWithItems;
	onPress: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation(["journal", "common"]);
	const theme = useTheme();
	return (
		<Card padding="md" style={styles.row} testID="journal-meal">
			<Pressable style={styles.rowMain} accessibilityRole="button" onPress={onPress}>
				<View style={[styles.avatar, { backgroundColor: theme.colors.mealSoft }]}>
					<Icon name="utensils" size={20} color={theme.colors.meal} strokeWidth={1.8} />
				</View>
				<View style={styles.rowBody}>
					<Text style={[styles.rowTitle, { color: theme.colors.text }]}>
						{meal.meal.name ?? t("kinds.meal")}
					</Text>
					<MealTriggerChips items={meal.items} max={3} />
					{meal.meal.isDraft ? (
						<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
							{t("entry.draft")}
						</Text>
					) : null}
				</View>
			</Pressable>
			<View style={styles.rowRight}>
				<Text style={[theme.typography.caption, styles.time, { color: theme.colors.textFaint }]}>
					{formatClock(meal.meal.occurredAt, meal.meal.tz)}
				</Text>
				<DeleteButton onDelete={onDelete} />
			</View>
		</Card>
	);
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
	const { t } = useTranslation("common");
	const theme = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t("actions.delete")}
			onPress={onDelete}
			hitSlop={8}
			style={styles.delete}
		>
			<Icon name="x" size={16} color={theme.colors.textFaint} strokeWidth={1.8} />
		</Pressable>
	);
}

function formatDate(localDate: string): string {
	const { label, dayNumber } = describeLocalDate(localDate);
	const [, month] = localDate.split("-");
	return `${label} ${dayNumber}/${month}`;
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	header: {
		gap: 12,
		paddingBottom: 8,
	},
	emptyInline: {
		alignItems: "center",
		paddingVertical: 56,
		gap: 12,
	},
	emptyIcon: {
		width: 64,
		height: 64,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
	},
	center: { textAlign: "center" },
	sectionHeader: {
		paddingTop: 16,
		paddingBottom: 8,
		gap: 8,
	},
	badges: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
	},
	badgeDot: {
		width: 6,
		height: 6,
		borderRadius: 999,
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
		gap: 3,
	},
	avatar: {
		width: 42,
		height: 42,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	rowTitle: { fontSize: 15, fontWeight: "600", letterSpacing: -0.1 },
	rowRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingLeft: 8,
	},
	time: { fontVariant: ["tabular-nums"] },
	delete: {
		padding: 6,
	},
});
