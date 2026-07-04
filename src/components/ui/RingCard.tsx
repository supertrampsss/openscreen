import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { DataColorKey } from "@/theme";
import { useTheme } from "@/theme";
import { Card } from "./Card";

interface RingCardProps {
	/** Gros chiffre / contenu central. */
	value: ReactNode;
	/** Sous-texte d'état neutre sous le chiffre. */
	subtitle?: string;
	/** Titre au-dessus de l'anneau. */
	title?: string;
	/** Progression 0-1 (complétude du jour §5.1). */
	progress: number;
	/** Teinte de l'anneau. Défaut : stool. */
	tint?: DataColorKey;
	size?: number;
	strokeWidth?: number;
	flare?: boolean;
}

/** Anneau SVG de progression + gros chiffre centré + sous-texte (§3). */
export function RingCard({
	value,
	subtitle,
	title,
	progress,
	tint = "stool",
	size = 168,
	strokeWidth = 14,
	flare = false,
}: RingCardProps) {
	const theme = useTheme();
	const clamped = Math.max(0, Math.min(1, progress));
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const dashOffset = circumference * (1 - clamped);
	const center = size / 2;
	const tintColor = theme.colors[tint];

	return (
		<Card flare={flare} style={styles.card}>
			{title ? (
				<Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{title}</Text>
			) : null}
			<View style={[styles.ringWrap, { width: size, height: size }]}>
				<Svg width={size} height={size}>
					{/* Piste de fond */}
					<Circle
						cx={center}
						cy={center}
						r={radius}
						stroke={theme.colors.surface}
						strokeWidth={strokeWidth}
						fill="none"
					/>
					{/* Progression */}
					<Circle
						cx={center}
						cy={center}
						r={radius}
						stroke={tintColor}
						strokeWidth={strokeWidth}
						strokeLinecap="round"
						fill="none"
						strokeDasharray={circumference}
						strokeDashoffset={dashOffset}
						transform={`rotate(-90 ${center} ${center})`}
					/>
				</Svg>
				<View style={styles.center} pointerEvents="none">
					{typeof value === "string" || typeof value === "number" ? (
						<Text style={[theme.typography.dataXL, { color: theme.colors.text }]}>{value}</Text>
					) : (
						value
					)}
					{subtitle ? (
						<Text
							style={[theme.typography.caption, styles.subtitle, { color: theme.colors.textMuted }]}
						>
							{subtitle}
						</Text>
					) : null}
				</View>
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	card: {
		alignItems: "center",
		gap: 12,
	},
	ringWrap: {
		alignItems: "center",
		justifyContent: "center",
	},
	center: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
	},
	subtitle: {
		marginTop: 2,
		textAlign: "center",
	},
});
