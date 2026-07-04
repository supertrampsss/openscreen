import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";

interface CardProps extends ViewProps {
	children: ReactNode;
	/** Fond ambre pâle en mode poussée (§3, jamais rouge). */
	flare?: boolean;
	/** Padding interne (clé de spacing). Défaut : lg. */
	padding?: "sm" | "md" | "lg" | "xl";
	style?: ViewStyle | ViewStyle[];
}

export function Card({ children, flare = false, padding = "lg", style, ...rest }: CardProps) {
	const theme = useTheme();
	return (
		<View
			style={[
				styles.base,
				{
					backgroundColor: flare ? theme.colors.flareBackground : theme.colors.card,
					borderRadius: theme.radii.lg,
					padding: theme.spacing[padding],
					borderColor: flare ? theme.colors.flareBorder : theme.colors.border,
				},
				theme.shadows.card,
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
