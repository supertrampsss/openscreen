import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

interface CardProps extends ViewProps {
	children: ReactNode;
	/** Fond ambre pâle en mode poussée (§3, jamais rouge). */
	flare?: boolean;
	/** Padding interne (clé de spacing). Défaut : lg. */
	padding?: "sm" | "md" | "lg" | "xl";
	/**
	 * `elevated` (défaut) = hairline + ombre douce.
	 * `flat` = hairline seule, sans ombre — pour cartes imbriquées.
	 */
	variant?: "elevated" | "flat";
	style?: ViewStyle | ViewStyle[];
}

export function Card({
	children,
	flare = false,
	padding = "lg",
	variant = "elevated",
	style,
	...rest
}: CardProps) {
	const theme = useTheme();
	return (
		<View
			style={[
				styles.base,
				{
					backgroundColor: flare ? theme.colors.flareBackground : theme.colors.card,
					borderRadius: theme.radii.xl,
					padding: theme.spacing[padding],
					borderColor: flare ? theme.colors.flareBorder : theme.colors.border,
				},
				variant === "elevated" ? theme.shadows.card : null,
				style,
			]}
			{...rest}
		>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	base: {
		borderWidth: StyleSheet.hairlineWidth,
	},
});
