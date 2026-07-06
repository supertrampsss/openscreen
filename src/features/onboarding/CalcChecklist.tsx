/**
 * Écran de calcul animé (§4.14) — checklist de 3 items qui se cochent un à un en
 * ~2,5 s, puis `onDone`. Purement cosmétique (le profil est déjà persisté) :
 * rassure et marque le passage « profil → plan ». Respecte « réduire les animations ».
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
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
			<View style={styles.header}>
				<View style={[styles.crest, { backgroundColor: theme.colors.brandSoft }]}>
					<Icon name="sparkles" size={26} color={theme.colors.brand} strokeWidth={1.6} />
				</View>
				<Text style={[theme.typography.title, styles.title, { color: theme.colors.text }]}>
					{t("calc.title")}
				</Text>
			</View>
			<View style={styles.list}>
				{ITEMS.map((item, i) => (
					<CalcRow key={item} label={t(`calc.${item}`)} done={i < checked} active={i === checked} />
				))}
			</View>
		</View>
	);
}

function CalcRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
	const theme = useTheme();
	const reduceMotion = useReducedMotion();
	const scale = useRef(new Animated.Value(done ? 1 : 0)).current;

	useEffect(() => {
		if (!done) return;
		if (reduceMotion) {
			scale.setValue(1);
			return;
		}
		scale.setValue(0);
		Animated.spring(scale, {
			toValue: 1,
			useNativeDriver: true,
			friction: 5,
			tension: 120,
		}).start();
	}, [done, reduceMotion, scale]);

	const labelColor = done ? theme.colors.text : active ? theme.colors.text : theme.colors.textFaint;

	return (
		<View
			style={[
				styles.row,
				{
					backgroundColor: theme.colors.card,
					borderColor: done ? theme.colors.brand : theme.colors.border,
					borderWidth: done ? 1.5 : StyleSheet.hairlineWidth,
				},
			]}
		>
			{done ? (
				<Animated.View
					style={[styles.check, { backgroundColor: theme.colors.energy, transform: [{ scale }] }]}
				>
					<Icon name="check" size={15} color="#FFFFFF" strokeWidth={2.6} />
				</Animated.View>
			) : active ? (
				<View style={styles.check}>
					<ActivityIndicator color={theme.colors.brand} />
				</View>
			) : (
				<View style={[styles.pending, { borderColor: theme.colors.border }]} />
			)}
			<Text style={[theme.typography.subheading, { color: labelColor, flex: 1 }]}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { paddingVertical: 24, gap: 28 },
	header: { alignItems: "center", gap: 16 },
	crest: {
		width: 56,
		height: 56,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	title: { textAlign: "center", maxWidth: 320 },
	list: { gap: 10 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		minHeight: 62,
		paddingHorizontal: 18,
		borderRadius: 16,
	},
	check: {
		width: 28,
		height: 28,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	pending: {
		width: 28,
		height: 28,
		borderRadius: 999,
		borderWidth: 2,
	},
});
