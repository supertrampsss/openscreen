/**
 * Écran de calcul animé (§4.14) — checklist de 3 items qui se cochent en ~2,5 s,
 * puis `onDone`. Purement cosmétique (le profil est déjà persisté) : rassure et
 * marque le passage « profil → plan ».
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme";

const ITEMS = ["symptoms", "plan", "baseline"] as const;
const STEP_MS = 750;

export function CalcChecklist({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation("onboarding");
	const theme = useTheme();
	const [checked, setChecked] = useState(0);
	const doneRef = useRef(onDone);
	doneRef.current = onDone;

	useEffect(() => {
		const timers = ITEMS.map((_, i) =>
			setTimeout(() => setChecked((c) => Math.max(c, i + 1)), STEP_MS * (i + 1)),
		);
		const finish = setTimeout(() => doneRef.current(), STEP_MS * ITEMS.length + 400);
		return () => {
			for (const timer of timers) clearTimeout(timer);
			clearTimeout(finish);
		};
	}, []);

	return (
		<View style={styles.wrap}>
			<Text style={[theme.typography.title, { color: theme.colors.text, textAlign: "center" }]}>
				{t("calc.title")}
			</Text>
			<View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
				{ITEMS.map((item, i) => (
					<CalcRow key={item} label={t(`calc.${item}`)} done={i < checked} />
				))}
			</View>
		</View>
	);
}

function CalcRow({ label, done }: { label: string; done: boolean }) {
	const theme = useTheme();
	const scale = useRef(new Animated.Value(done ? 1 : 0)).current;

	useEffect(() => {
		if (done) {
			Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
		}
	}, [done, scale]);

	return (
		<View
			style={[styles.row, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
		>
			{done ? (
				<Animated.View
					style={[styles.check, { backgroundColor: theme.colors.energy, transform: [{ scale }] }]}
				>
					<Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.4} />
				</Animated.View>
			) : (
				<ActivityIndicator color={theme.colors.textFaint} />
			)}
			<Text style={[theme.typography.subheading, { color: theme.colors.text }]}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { paddingVertical: 24 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		minHeight: 60,
		paddingHorizontal: 18,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	check: {
		width: 28,
		height: 28,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
});
