import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import type { ThemeColors } from "@/theme";
import { useTheme } from "@/theme";

/**
 * Atomes partagés des feuilles de saisie (§5) — direction « Clinique calme ».
 * Un seul jeu de composants pour garder en-têtes, pastilles de portion et
 * boutons « retirer » rigoureusement cohérents d'une sheet à l'autre.
 */

/** En-tête de section : overline capitale, discret et régulier. */
export function Eyebrow({ children }: { children: ReactNode }) {
	const theme = useTheme();
	return (
		<Text style={[theme.typography.overline, { color: theme.colors.textMuted }]}>{children}</Text>
	);
}

/** Bandeau d'identité d'une sheet : avatar teinté + courte aide en légende. */
export function SheetIntro({
	icon,
	tint,
	soft,
	text,
}: {
	icon: IconName;
	tint: keyof ThemeColors;
	soft: keyof ThemeColors;
	text: string;
}) {
	const theme = useTheme();
	return (
		<View style={styles.intro}>
			<View style={[styles.introAvatar, { backgroundColor: theme.colors[soft] }]}>
				<Icon name={icon} size={20} color={theme.colors[tint]} strokeWidth={1.8} />
			</View>
			<Text style={[theme.typography.caption, styles.introText, { color: theme.colors.textMuted }]}>
				{text}
			</Text>
		</View>
	);
}

/** Pastille de portion S/M/L (cycle au tap), teinte repas douce. */
export function PortionButton({
	label,
	accessibilityLabel,
	testID,
	onPress,
}: {
	label: string;
	accessibilityLabel: string;
	testID?: string;
	onPress: () => void;
}) {
	const theme = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			testID={testID}
			onPress={onPress}
			style={({ pressed }) => [
				styles.portion,
				{
					borderRadius: theme.radii.pill,
					backgroundColor: theme.colors.mealSoft,
					opacity: pressed ? 0.7 : 1,
				},
			]}
		>
			<Text style={[theme.typography.label, { color: theme.colors.meal }]}>{label}</Text>
		</Pressable>
	);
}

/** Bouton « retirer » discret (croix au trait), cible tactile élargie. */
export function RemoveButton({
	accessibilityLabel,
	testID,
	onPress,
	onLongPress,
}: {
	accessibilityLabel: string;
	testID?: string;
	onPress: () => void;
	onLongPress?: () => void;
}) {
	const theme = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			testID={testID}
			onPress={onPress}
			onLongPress={onLongPress}
			hitSlop={8}
			style={({ pressed }) => [styles.remove, { opacity: pressed ? 0.55 : 1 }]}
		>
			<Icon name="x" size={16} color={theme.colors.textFaint} strokeWidth={1.9} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	intro: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	introAvatar: {
		width: 38,
		height: 38,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	introText: {
		flex: 1,
	},
	portion: {
		minWidth: 38,
		minHeight: 34,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	remove: {
		width: 32,
		height: 32,
		alignItems: "center",
		justifyContent: "center",
	},
});
