import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

interface PillButtonProps {
	label: string;
	onPress: () => void;
	/** accessibilityLabel obligatoire (§3, VoiceOver/TalkBack). */
	accessibilityLabel: string;
	/** primary = pilule noire (défaut) ; secondary = contour discret. */
	variant?: "primary" | "secondary";
	disabled?: boolean;
	loading?: boolean;
	fullWidth?: boolean;
	style?: ViewStyle | ViewStyle[];
	/** testID → data-testid sur react-native-web (E2E). */
	testID?: string;
}

/** CTA principal : pilule noire, texte blanc, cible ≥48 px (§3). */
export function PillButton({
	label,
	onPress,
	accessibilityLabel,
	variant = "primary",
	disabled = false,
	loading = false,
	fullWidth = true,
	style,
	testID,
}: PillButtonProps) {
	const theme = useTheme();
	const isPrimary = variant === "primary";
	const isDisabled = disabled || loading;

	const backgroundColor = isPrimary ? theme.colors.ctaBackground : theme.colors.surface;
	const textColor = isPrimary ? theme.colors.ctaText : theme.colors.text;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled: isDisabled, busy: loading }}
			testID={testID}
			disabled={isDisabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.base,
				{
					backgroundColor,
					borderRadius: theme.radii.pill,
					opacity: isDisabled ? 0.4 : pressed ? 0.85 : 1,
					alignSelf: fullWidth ? "stretch" : "center",
					paddingHorizontal: fullWidth ? theme.spacing.xl : theme.spacing.xxl,
				},
				style,
			]}
		>
			{loading ? (
				<ActivityIndicator color={textColor} />
			) : (
				<Text style={[theme.typography.subheading, { color: textColor }]}>{label}</Text>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	base: {
		minHeight: 52,
		alignItems: "center",
		justifyContent: "center",
	},
});
