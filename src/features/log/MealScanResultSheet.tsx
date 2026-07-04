import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ChipTrigger, DraftSheet, PillButton } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import type { Meal } from "@/db/schema";
import { activeTriggerKeys, coerceTriggers, type FoodTriggers } from "@/domain/foods";
import {
	commitDraft,
	getOrCreateCustomFood,
	newMealId,
	type Portion,
	replaceItems,
	searchFoods,
	upsertDraft,
} from "@/repositories/mealRepo";
import {
	analyzeMeal,
	dishName,
	flattenIngredients,
	overallConfidence,
	ScanError,
	type ScanResponse,
} from "@/services/mealScanService";
import { useTheme } from "@/theme";

interface EditableItem {
	key: string;
	name: string;
	portion: Portion;
	triggers: FoodTriggers;
}

interface Props {
	visible: boolean;
	meal: Meal;
	response: ScanResponse;
	onClose: () => void;
	onSaved: () => void;
	/** « Saisir à la main » : ouvre le repas manuel avec la photo attachée. */
	onManual: () => void;
}

const PORTION_CYCLE: Record<Portion, Portion> = {
	small: "medium",
	medium: "large",
	large: "small",
};

/** Sheet de confirmation du scan photo (§5.4.3-4) — DraftSheet commun. */
export function MealScanResultSheet({
	visible,
	meal,
	response,
	onClose,
	onSaved,
	onManual,
}: Props) {
	const { t } = useTranslation(["scan", "log"]);
	const theme = useTheme();
	const snackbar = useSnackbar();

	const [name, setName] = useState("");
	const [items, setItems] = useState<EditableItem[]>([]);
	const [confidence, setConfidence] = useState<"high" | "medium" | "low">("medium");
	const [remaining, setRemaining] = useState<number | null>(null);
	const [demo, setDemo] = useState(false);
	const [raw, setRaw] = useState<unknown>(null);
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<
		{ id: string; displayFr: string; triggers: FoodTriggers }[]
	>([]);

	const load = useCallback((r: ScanResponse) => {
		setName(dishName(r.result));
		setItems(
			flattenIngredients(r.result).map((i) => ({
				key: newMealId(),
				name: i.name,
				portion: i.portion,
				triggers: i.triggers,
			})),
		);
		setConfidence(overallConfidence(r.result));
		setRemaining(r.remaining);
		setDemo(r.demo);
		setRaw(r.result);
	}, []);

	useEffect(() => {
		if (!visible) return;
		setNote("");
		setQuery("");
		setResults([]);
		load(response);
	}, [visible, response, load]);

	useEffect(() => {
		let alive = true;
		if (!query.trim()) {
			setResults([]);
			return;
		}
		searchFoods(query, 10).then((rows) => {
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

	const cyclePortion = (key: string) =>
		setItems((prev) =>
			prev.map((i) => (i.key === key ? { ...i, portion: PORTION_CYCLE[i.portion] } : i)),
		);
	const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

	const addFood = (food: { displayFr: string; triggers: FoodTriggers }) => {
		setItems((prev) => [
			...prev,
			{ key: newMealId(), name: food.displayFr, portion: "medium", triggers: food.triggers },
		]);
		setQuery("");
	};

	const createCustom = async () => {
		const label = query.trim();
		if (!label) return;
		const food = await getOrCreateCustomFood(label);
		addFood({ displayFr: food.displayFr, triggers: coerceTriggers(food.triggers) });
	};

	/** « Corriger » (§5.4.4) : ré-analyse avec la note, remplace le résultat. */
	const correct = async () => {
		if (!note.trim() || busy) return;
		setBusy(true);
		try {
			const next = await analyzeMeal({ uri: meal.photoUri ?? "", userNote: note });
			load(next);
			setNote("");
		} catch (e) {
			const kind = e instanceof ScanError ? e.kind : "server";
			snackbar.show({ message: t(`errors.${kind}`) });
		} finally {
			setBusy(false);
		}
	};

	/** « C'est bon » : mappe les ingrédients IA → foods, items, commit. */
	const confirm = async () => {
		if (items.length === 0 || busy) return;
		setBusy(true);
		try {
			const toSave: { foodId: string; portion: Portion }[] = [];
			for (const item of items) {
				const food = await getOrCreateCustomFood(item.name, item.triggers);
				toSave.push({ foodId: food.id, portion: item.portion });
			}
			await upsertDraft({
				id: meal.id,
				occurredAt: meal.occurredAt,
				tz: meal.tz,
				localDate: meal.localDate,
				name: name.trim() || meal.name || null,
				source: "photo",
				photoUri: meal.photoUri,
				aiConfidence: confidence,
				aiRaw: raw,
			});
			await replaceItems(meal.id, toSave);
			await commitDraft(meal.id);
			snackbar.show({ message: t("log:meal.saved") });
			onSaved();
			onClose();
		} finally {
			setBusy(false);
		}
	};

	const confBar =
		confidence === "high"
			? { color: theme.colors.energy, label: t("result.confidence.high") }
			: confidence === "low"
				? { color: theme.colors.pain, label: t("result.confidence.low") }
				: { color: theme.colors.textMuted, label: t("result.confidence.medium") };

	const showCreateCustom = query.trim().length > 0 && results.length === 0;
	const hasFood = items.length > 0;

	return (
		<DraftSheet
			visible={visible}
			onClose={onClose}
			title={t("result.title")}
			confirmLabel={hasFood ? t("result.confirm") : undefined}
			onConfirm={hasFood ? confirm : undefined}
			confirmDisabled={busy}
			confirmTestID="scan-confirm"
			confirmAccessibilityLabel={t("result.confirm")}
		>
			{demo ? (
				<View
					testID="scan-demo-banner"
					style={[styles.banner, { backgroundColor: theme.colors.flareBackground }]}
				>
					<Text style={[theme.typography.caption, { color: theme.colors.pain }]}>
						{t("result.demoBanner")}
					</Text>
				</View>
			) : null}

			<View style={styles.header}>
				{meal.photoUri ? (
					<Image
						source={{ uri: meal.photoUri }}
						style={[styles.thumb, { borderRadius: theme.radii.md }]}
						contentFit="cover"
						testID="scan-thumb"
					/>
				) : null}
				<View style={styles.headerBody}>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{name || t("result.title")}
					</Text>
					<View style={styles.confRow}>
						<View style={[styles.confDot, { backgroundColor: confBar.color }]} />
						<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
							{confBar.label}
							{confidence === "low" ? ` · ${t("result.checkIngredients")}` : ""}
						</Text>
					</View>
				</View>
			</View>

			{/* Ingrédients détectés. */}
			<View style={{ gap: theme.spacing.sm }} testID="scan-ingredients">
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
					{t("result.ingredients")}
				</Text>
				{hasFood ? (
					items.map((item) => (
						<View
							key={item.key}
							testID={`scan-item-${item.key}`}
							style={[
								styles.itemRow,
								{ borderRadius: theme.radii.md, backgroundColor: theme.colors.surface },
							]}
						>
							<View style={styles.itemMain}>
								<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
									{item.name}
								</Text>
								<View style={styles.chips}>
									{activeTriggerKeys(item.triggers).map((key) => (
										<ChipTrigger key={key} label={t(`log:triggers.${key}`)} tint="meal" />
									))}
								</View>
							</View>
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("result.cyclePortion", {
									size: t(`log:meal.portion.${item.portion}`),
								})}
								onPress={() => cyclePortion(item.key)}
								style={[
									styles.portion,
									{ borderRadius: theme.radii.pill, borderColor: theme.colors.meal },
								]}
							>
								<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
									{t(`log:meal.portion.${item.portion}`)}
								</Text>
							</Pressable>
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={t("result.remove", { name: item.name })}
								onLongPress={() => removeItem(item.key)}
								onPress={() => removeItem(item.key)}
								hitSlop={8}
								style={styles.remove}
							>
								<Text style={{ color: theme.colors.textFaint, fontSize: 18 }}>✕</Text>
							</Pressable>
						</View>
					))
				) : (
					<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
						{t("result.noFood")}
					</Text>
				)}
			</View>

			{/* Ajouter un aliment (réutilise la recherche foods). */}
			<View style={{ gap: theme.spacing.xs }}>
				<TextInput
					accessibilityLabel={t("result.addIngredient")}
					testID="scan-add-search"
					placeholder={t("result.addPlaceholder")}
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
				{results.map((food) => (
					<Pressable
						key={food.id}
						accessibilityRole="button"
						accessibilityLabel={food.displayFr}
						onPress={() => addFood(food)}
						style={[
							styles.resultRow,
							{ borderRadius: theme.radii.sm, backgroundColor: theme.colors.surface },
						]}
					>
						<Text style={[theme.typography.body, { color: theme.colors.text }]}>
							{food.displayFr}
						</Text>
					</Pressable>
				))}
				{showCreateCustom ? (
					<Pressable
						accessibilityRole="button"
						onPress={createCustom}
						style={[
							styles.resultRow,
							{ borderRadius: theme.radii.sm, backgroundColor: theme.colors.surface },
						]}
					>
						<Text style={[theme.typography.label, { color: theme.colors.meal }]}>
							{t("result.createCustom", { name: query.trim() })}
						</Text>
					</Pressable>
				) : null}
			</View>

			{/* « Corriger » : champ libre → ré-analyse. */}
			<View style={{ gap: theme.spacing.xs }}>
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>
					{t("result.correctLabel")}
				</Text>
				<TextInput
					accessibilityLabel={t("result.correctLabel")}
					testID="scan-correct"
					placeholder={t("result.correctPlaceholder")}
					placeholderTextColor={theme.colors.textFaint}
					value={note}
					onChangeText={setNote}
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
				{note.trim().length > 0 ? (
					<PillButton
						label={t("result.correctButton")}
						accessibilityLabel={t("result.correctButton")}
						variant="secondary"
						onPress={correct}
						disabled={busy}
						testID="scan-correct-submit"
					/>
				) : null}
			</View>

			{busy ? <ActivityIndicator color={theme.colors.meal} /> : null}

			{remaining != null ? (
				<Text
					testID="scan-remaining"
					style={[theme.typography.caption, { color: theme.colors.textMuted, textAlign: "center" }]}
				>
					{t("result.trialRemaining", { count: remaining })}
				</Text>
			) : null}

			{!hasFood ? (
				<PillButton
					label={t("card.manual")}
					accessibilityLabel={t("card.manual")}
					variant="secondary"
					onPress={onManual}
					testID="scan-manual"
				/>
			) : null}
		</DraftSheet>
	);
}

const styles = StyleSheet.create({
	banner: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
	header: { flexDirection: "row", gap: 12, alignItems: "center" },
	thumb: { width: 64, height: 64 },
	headerBody: { flex: 1, gap: 4 },
	confRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	confDot: { width: 8, height: 8, borderRadius: 999 },
	itemRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	itemMain: { flex: 1, gap: 4 },
	chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
	portion: {
		minWidth: 36,
		minHeight: 36,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: StyleSheet.hairlineWidth,
	},
	remove: { paddingHorizontal: 4, paddingVertical: 8 },
	input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 },
	resultRow: {
		minHeight: 44,
		paddingHorizontal: 12,
		paddingVertical: 8,
		flexDirection: "row",
		alignItems: "center",
	},
});
