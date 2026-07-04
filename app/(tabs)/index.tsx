import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BristolIcon, type BristolType } from "@/components/BristolIcon";
import { Card, RingCard, type WeekDay, WeekStrip } from "@/components/ui";
import type { SymptomEntry } from "@/db/schema";
import { describeLocalDate, formatClock, last7LocalDates, nowEntryTimestamp } from "@/domain/dates";
import { FlareBanner } from "@/features/flare/FlareBanner";
import { AddSheet } from "@/features/log/AddSheet";
import { StoolSheet } from "@/features/log/StoolSheet";
import { SymptomSheet } from "@/features/log/SymptomSheet";
import { listRecent } from "@/repositories/symptomRepo";
import { useTheme } from "@/theme";

export default function HomeScreen() {
	const { t } = useTranslation("common");
	const theme = useTheme();
	const insets = useSafeAreaInsets();

	const [recent, setRecent] = useState<SymptomEntry[]>([]);
	const [addOpen, setAddOpen] = useState(false);
	const [stoolOpen, setStoolOpen] = useState(false);
	const [symptomOpen, setSymptomOpen] = useState(false);
	const [resume, setResume] = useState<SymptomEntry | null>(null);

	const today = nowEntryTimestamp().localDate;

	const reload = useCallback(() => {
		listRecent(25).then(setRecent);
	}, []);

	useFocusEffect(
		useCallback(() => {
			reload();
		}, [reload]),
	);

	const stoolsToday = recent.filter(
		(e) => e.localDate === today && e.kind === "stool" && !e.isDraft,
	).length;
	const documentedDates = new Set(recent.filter((e) => !e.isDraft).map((e) => e.localDate));

	const weekDays: WeekDay[] = last7LocalDates().map((date) => {
		const { label, dayNumber } = describeLocalDate(date);
		return {
			date,
			label,
			dayNumber,
			documented: documentedDates.has(date),
			isToday: date === today,
		};
	});

	const openFor = (entry: SymptomEntry) => {
		setResume(entry);
		if (entry.kind === "stool") setStoolOpen(true);
		else setSymptomOpen(true);
	};

	const pickAction = (action: "stool" | "symptom") => {
		setAddOpen(false);
		setResume(null);
		if (action === "stool") setStoolOpen(true);
		else setSymptomOpen(true);
	};

	const ringProgress = documentedDates.has(today)
		? 1
		: recent.some((e) => e.localDate === today)
			? 0.4
			: 0;
	const ringSubtitle =
		stoolsToday > 0 || documentedDates.has(today) ? t("home.ringDone") : t("home.ringEmpty");

	return (
		<View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
			<ScrollView
				contentContainerStyle={{
					padding: theme.spacing.lg,
					paddingTop: insets.top + theme.spacing.md,
					paddingBottom: insets.bottom + 120,
					gap: theme.spacing.lg,
				}}
			>
				<Text style={[theme.typography.title, { color: theme.colors.text }]}>{t("appName")}</Text>

				<FlareBanner />

				<WeekStrip days={weekDays} />

				<RingCard
					title={t("home.ringTitle")}
					value={stoolsToday}
					subtitle={`${t(stoolsToday === 1 ? "home.stoolsUnit_one" : "home.stoolsUnit_other")} · ${ringSubtitle}`}
					progress={ringProgress}
					tint="stool"
				/>

				<Text style={[theme.typography.heading, { color: theme.colors.text }]}>
					{t("home.recentTitle")}
				</Text>
				{recent.length === 0 ? (
					<Card>
						<Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
							{t("home.recentEmpty")}
						</Text>
					</Card>
				) : (
					<View style={{ gap: theme.spacing.sm }}>
						{recent.map((entry) => (
							<RecentRow key={entry.id} entry={entry} onPress={() => openFor(entry)} />
						))}
					</View>
				)}
			</ScrollView>

			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("home.addButton")}
				testID="fab-add"
				onPress={() => setAddOpen(true)}
				style={[
					styles.fab,
					theme.shadows.floating,
					{ backgroundColor: theme.colors.ctaBackground, bottom: insets.bottom + 16 },
				]}
			>
				<Text style={[styles.fabPlus, { color: theme.colors.ctaText }]}>+</Text>
			</Pressable>

			<AddSheet visible={addOpen} onClose={() => setAddOpen(false)} onPick={pickAction} />
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

function RecentRow({ entry, onPress }: { entry: SymptomEntry; onPress: () => void }) {
	const { t } = useTranslation(["common", "journal"]);
	const theme = useTheme();
	const isStool = entry.kind === "stool";

	return (
		<Pressable accessibilityRole="button" onPress={onPress}>
			<Card padding="md" style={styles.recentCard}>
				{isStool && entry.bristol ? (
					<BristolIcon type={entry.bristol as BristolType} selected size={30} />
				) : (
					<Text style={styles.recentEmoji}>{isStool ? "💩" : "🤕"}</Text>
				)}
				<View style={styles.recentBody}>
					<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>
						{isStool ? t("journal:kinds.stool") : t("journal:kinds.symptom")}
						{isStool && entry.bristol
							? ` · ${t("journal:entry.bristol", { value: entry.bristol })}`
							: ""}
					</Text>
					<Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
						{formatClock(entry.occurredAt, entry.tz)}
					</Text>
				</View>
				{entry.isDraft ? (
					<View style={[styles.draftBadge, { backgroundColor: theme.colors.flareBackground }]}>
						<Text style={[theme.typography.caption, { color: theme.colors.pain }]}>
							{t("common:draft")}
						</Text>
					</View>
				) : null}
			</Card>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	fab: {
		position: "absolute",
		right: 20,
		width: 60,
		height: 60,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	fabPlus: {
		fontSize: 32,
		lineHeight: 36,
		fontWeight: "300",
	},
	recentCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	recentEmoji: {
		fontSize: 24,
	},
	recentBody: {
		flex: 1,
		gap: 2,
	},
	draftBadge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
	},
});
