/**
 * Sparkline SVG maison (react-native-svg) — courbe compacte pour Home (§5.1).
 *
 * Les valeurs `null` sont des TROUS (jamais des zéros fabriqués — §2, §5.7) :
 * la ligne se rompt, on ne relie pas deux points séparés par un jour sans donnée.
 */

import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useTheme } from "@/theme";

interface SparklineProps {
	/** Points ordonnés chronologiquement ; `null` = jour sans donnée (trou). */
	data: (number | null)[];
	color: string;
	width?: number;
	height?: number;
	/** Bornes du domaine. Déduites des données si absentes. */
	min?: number;
	max?: number;
	strokeWidth?: number;
}

export function Sparkline({
	data,
	color,
	width = 260,
	height = 72,
	min,
	max,
	strokeWidth = 2.5,
}: SparklineProps) {
	const theme = useTheme();
	const pad = 6;
	const values = data.filter((v): v is number => v != null);
	const lo = min ?? (values.length ? Math.min(...values) : 0);
	const hiRaw = max ?? (values.length ? Math.max(...values) : 1);
	const hi = hiRaw === lo ? lo + 1 : hiRaw; // évite la division par zéro

	const innerW = width - pad * 2;
	const innerH = height - pad * 2;
	const n = data.length;
	const xAt = (i: number) => pad + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
	const yAt = (v: number) => pad + innerH - ((v - lo) / (hi - lo)) * innerH;

	// Construit les segments continus (rompus sur les null).
	const segments: string[] = [];
	let current = "";
	data.forEach((v, i) => {
		if (v == null) {
			if (current) {
				segments.push(current);
				current = "";
			}
			return;
		}
		const cmd = current ? "L" : "M";
		current += `${current ? " " : ""}${cmd}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
	});
	if (current) segments.push(current);

	return (
		<View style={styles.wrap}>
			<Svg width={width} height={height}>
				{/* Ligne de base discrète. */}
				<Line
					x1={pad}
					y1={height - pad}
					x2={width - pad}
					y2={height - pad}
					stroke={theme.colors.border}
					strokeWidth={StyleSheet.hairlineWidth}
				/>
				{segments.map((d) => (
					<Path
						key={d}
						d={d}
						stroke={color}
						strokeWidth={strokeWidth}
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
				))}
				{data.map((v, i) =>
					v == null ? null : (
						<Circle key={`${i}-${v}`} cx={xAt(i)} cy={yAt(v)} r={strokeWidth + 1} fill={color} />
					),
				)}
			</Svg>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { alignItems: "center" },
});
