import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ChipTrigger, DraftSheet } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import { type EntryTimestamp, localHourInTz, nowEntryTimestamp } from "@/domain/dates";
import { activeTriggerKeys, coerceTriggers, type FoodTriggers } from "@/domain/foods";
import {
	commitDraft,
	getOrCreateCustomFood,
	listRecentCommittedWithItems,
	type MealItemView,
	type MealWithItems,
	newMealId,
	type Portion,
	replaceItems,
	searchFoods,
	upsertDraft,
} from "@/repositories/mealRepo";
import { useTheme } from "@/theme";
import { TimeChips, type TimeMode } from "./TimeChips";

interface MealSheetProps {
	visible: boolean;
	onClose: () => void;
	onSaved: () => void;
	/** Repas à éditer (depuis Récemment loggé / Journal). */
	resume?: MealWithItems | null;
}

const PORTION_CYCLE: Record<Portion, Portion> = {
	small: "medium",
	medium: "large",
	large: "small",
};

/** Clé i18n du nom de repas par défaut selon l'heure locale (§5.5). */
function mealNameKeyForHour(hour: number): "breakfast" | "lunch" | "snack" | "dinner" {
	if (hour < 11) return "breakfast";
	if (hour < 15) return "lunch";
	if (hour < 18) return "snack";
	return "dinner";
}

/** Repas manuel (§5.5) — cible ≤10 s. Autosave brouillon à chaque modification. */
export function MealSheet({ visible, onClose, onSaved, resume }: MealSheetProps) {
	const { t } = useTranslation("log");
	const theme = useTheme();
	const snackbar = useSnackbar();

	const [mealId, setMealId] = useState(newMealId);
	const [base, setBase] = useState<EntryTimestamp>(nowEntryTimestamp);
	const [occurred, setOccurred] = useState<EntryTimestamp>(base);
	const [timeMode, setTimeMode] = useState<TimeMode>("now");
	const [name, setName] = useState("");
	const [items, setItems] = useState<MealItemView[]>([]);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<
		{ id: string; displayFr: string; triggers: FoodTriggers }[]
	>([]);
	const [recents, setRecents] = useState<MealWithItems[]>([]);

	const defaultName = useCallback(
		(ts: EntryTimestamp) => t(`meal.names.${mealNameKeyForHour(localHourInTz(ts.epochMs, ts.tz))}`),
		[t],
	);

	// Initialisation à l'ouverture : reprise ou nouveau repas (nom auto par heure).
	useEffect(() => {
		if (!visible) return;
		const now = nowEntryTimestamp();
		setQuery("");
		setResults([]);
		listRecentCommittedWithItems(8).then(setRecents);
		if (resume) {
			setMealId(resume.meal.id);
			const ts: EntryTimestamp = {
				epochMs: resume.meal.occurredAt,
				tz: resume.meal.tz,
				localDate: resume.meal.localDate,
			};
			setBase(now);
			setOccurred(ts);
			setTimeMode("custom");
			setName(resume.meal.name ?? defaultName(ts));
			setItems(resume.items);
			return;
		}
		setMealId(newMealId());
		setBase(now);
		setOccurred(now);
		setTimeMode("now");
		setName(defaultName(now));
		setItems([]);
	}, [visible, resume, defaultName]);

	// Recherche live d'aliments (name_normalized LIKE). Vidée si champ vide.
	useEffect(() => {
		let alive = true;
		if (!query.trim()) {
			setResults([]);
			return;
		}
		searchFoods(query, 12).then((rows) => {
			if (!alive) return;
			setResults(
				rows.map((r) => ({
					id: r.id,
					displayFr: r.displayFr,
					triggers: coerceTriggers(r.triggers),
				})),
			);
		});
		return () => {
			alive = false;
		};
	}, [query]);

	/** Persiste le brouillon (meal + items) — appelé à CHAQUE modification (§5.2). */
	const persist = useCallback(
		async (nextItems: MealItemView[], nextName: string, ts: EntryTimestamp) => {
			await upsertDraft({
				id: mealId,
				occurredAt: ts.epochMs,
				tz: ts.tz,
				localDate: ts.localDate,
				name: nextName.trim() || null,
				source: "manual",
			});
			await replaceItems(
				mealId,
				nextItems.map((i) => ({ foodId: i.foodId, portion: i.portion })),
			);
		},
		[mealId],
	);

	const addFood = (food: { id: string; displayFr: string; triggers: FoodTriggers }) => {
		if (items.some((i) => i.foodId === food.id)) {
			setQuery("");
			return;
		}
		const next: MealItemView[] = [
			...items,
			{ foodId: food.id, displayFr: food.displayFr, portion: "medium", triggers: food.triggers },
		];
		setItems(next);
		setQuery("");
		void persist(next, name, occurred);
	};

	const createCustom = async () => {
		const label = query.trim();
		if (!label) return;
		const food = await getOrCreateCustomFood(label);
		addFood({ id: food.id, displayFr: food.displayFr, triggers: coerceTriggers(food.triggers) });
	};

	const removeItem = (foodId: string) => {
		const next = items.filter((i) => i.foodId !== foodId);
		setItems(next);
		void persist(next, name, occurred);
	};

	const cyclePortion = (foodId: string) => {
		const next = items.map((i) =>
			i.foodId === foodId ? { ...i, portion: PORTION_CYCLE[i.portion] } : i,
		);
		setItems(next);
		void persist(next, name, occurred);
	};

	const relog = (template: MealWithItems) => {
		const next = template.items.map((i) => ({ ...i }));
		setItems(next);
		setName(template.meal.name ?? defaultName(occurred));
		void persist(next, template.meal.name ?? name, occurred);
	};

	const chooseTime = (mode: TimeMode, ts: EntryTimestamp) => {
		setTimeMode(mode);
		setOccurred(ts);
		void persist(items, name, ts);
	};

	const changeName = (value: string) => {
		setName(value);
		void persist(items, value, occurred);
	};

	const save = async () => {
		if (items.length === 0) return;
		await persist(items, name, occurred);
		await commitDraft(mealId);
		snackbar.show({ message: t("meal.saved") });
		onSaved();
		onClose();
	};

	const showCreateCustom = query.trim().length > 0 && results.length === 0;

	return (
		<DraftSheet
			visible={visible}
			onClose={onClose}
			title={t("meal.title")}
			confirmLabel={t("meal.save")}
			onConfirm={save}
			confirmDisabled={items.length === 0}
			confirmTestID="meal-save"
			confirmAccessibilityLabel={t("meal.save")}
		>
			{/* Récents : 1 tap = re-log (items pré-remplis). */}
			{recents.length > 0 ? (
				<View style={{ gap: theme.spacing.sm }}>
					<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
						{t("meal.recents")}
					</Text>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: 2 }}
					>
						{recents.map((r) => (
							<Pressable
								key={r.meal.id}
								accessibilityRole="button"
								accessibilityLabel={r.meal.name ?? t("meal.title")}
								testID={`meal-recent-${r.meal.id}`}
								onPress={() => relog(r)}
								style={[
									styles.recentChip,
									{
										borderRadius: theme.radii.pill,
										backgroundColor: theme.colors.surface,
										borderColor: theme.colors.border,
									},
								]}
							>
								<Text style={styles.recentEmoji}>🍽️</Text>
								<Text
									numberOfLines={1}
									style={[theme.typography.label, { color: theme.colors.text }]}
								>
									{r.meal.name ?? t("meal.title")}
								</Text>
							</Pressable>
						))}
					</ScrollView>
				</View>
			) : null}

			{/* Recherche d'aliments. */}
			<View style={{ gap: theme.spacing.sm }}>
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
					{t("meal.searchLabel")}
				</Text>
				<TextInput
					accessibilityLabel={t("meal.searchLabel")}
					testID="meal-search"
					placeholder={t("meal.searchPlaceholder")}
					placeholderTextColor={theme.colors.textFaint}
					value={query}
					onChangeText={setQuery}
					autoCorrect={false}
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
				{results.length > 0 ? (
					<View style={{ gap: theme.spacing.xs }}>
						{results.map((food) => (
							<Pressable
								key={food.id}
								accessibilityRole="button"
								accessibilityLabel={food.displayFr}
								testID={`meal-result-${food.id}`}
								onPress={() => addFood(food)}
								style={[
									styles.resultRow,
									{ borderRadius: theme.radii.sm, backgroundColor: theme.colors.surface },
								]}
							>
								<Text style={[theme.typography.body, { color: theme.colors.text }]}>
									{food.displayFr}
								</Text>
								<TriggerMini keys={activeTriggerKeys(food.triggers)} />
							</Pressable>
						))}
					</View>
				) : null}
				{showCreateCustom ? (
					<Pressable
						accessibilityRole="button"
						testID="meal-create-custom"
						onPress={createCustom}
						style={[
							styles.resultRow,
							{ borderRadius: theme.radii.sm, backgroundColor: theme.colors.surface },
						]}
					>
						<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
							{t("meal.createCustom", { name: query.trim() })}
						</Text>
					</Pressable>
				) : null}
			</View>

			{/* Items sélectionnés. */}
			<View style={{ gap: theme.spacing.sm }}>
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
					{t("meal.items")}
				</Text>
				{items.length === 0 ? (
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{t("meal.noItems")}
					</Text>
				) : (
					<View style={{ gap: theme.spacing.sm }}>
						{items.map((item) => (
							<View
								key={item.foodId}
								testID={`meal-item-${item.foodId}`}
								style={[
									styles.itemRow,
									{ borderRadius: theme.radii.md, backgroundColor: theme.colors.surface },
								]}
							>
								<View style={styles.itemMain}>
									<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
										{item.displayFr}
									</Text>
									<TriggerMini keys={activeTriggerKeys(item.triggers)} />
								</View>
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={t("meal.cyclePortion", {
										size: t(`meal.portion.${item.portion}`),
									})}
									testID={`meal-portion-${item.foodId}`}
									onPress={() => cyclePortion(item.foodId)}
									style={[
										styles.portion,
										{ borderRadius: theme.radii.pill, borderColor: theme.colors.meal },
									]}
								>
									<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
										{t(`meal.portion.${item.portion}`)}
									</Text>
								</Pressable>
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={t("meal.remove", { name: item.displayFr })}
									testID={`meal-remove-${item.foodId}`}
									onPress={() => removeItem(item.foodId)}
									hitSlop={8}
									style={styles.remove}
								>
									<Text style={{ color: theme.colors.textFaint, fontSize: 18 }}>✕</Text>
								</Pressable>
							</View>
						))}
					</View>
				)}
			</View>

			{/* Nom du repas (auto, modifiable). */}
			<View style={{ gap: theme.spacing.xs }}>
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
					{t("meal.nameLabel")}
				</Text>
				<TextInput
					accessibilityLabel={t("meal.nameLabel")}
					testID="meal-name"
					placeholder={t("meal.namePlaceholder")}
					placeholderTextColor={theme.colors.textFaint}
					value={name}
					onChangeText={changeName}
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
			</View>

			{/* Heure. */}
			<View style={{ gap: theme.spacing.xs }}>
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
					{t("meal.time")}
				</Text>
				<TimeChips base={base} mode={timeMode} value={occurred} onChange={chooseTime} />
			</View>
		</DraftSheet>
	);
}

/** Rangée compacte de chips triggers (max 4 pour rester lisible). */
function TriggerMini({ keys }: { keys: string[] }) {
	const { t } = useTranslation("log");
	const theme = useTheme();
	if (keys.length === 0) return null;
	const shown = keys.slice(0, 4);
	const extra = keys.length - shown.length;
	return (
		<View style={styles.miniWrap}>
			{shown.map((key) => (
				<ChipTrigger key={key} label={t(`triggers.${key}`)} tint="meal" />
			))}
			{extra > 0 ? (
				<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
					{t("meal.moreTriggers", { count: extra })}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	recentChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		maxWidth: 180,
		paddingHorizontal: 12,
		minHeight: 40,
		borderWidth: StyleSheet.hairlineWidth,
	},
	recentEmoji: { fontSize: 16 },
	input: {
		minHeight: 48,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	resultRow: {
		minHeight: 44,
		paddingHorizontal: 12,
		paddingVertical: 8,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	itemRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	itemMain: { flex: 1, gap: 4 },
	miniWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
	portion: {
		minWidth: 36,
		minHeight: 36,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: StyleSheet.hairlineWidth,
	},
	remove: { paddingHorizontal: 4, paddingVertical: 8 },
});
