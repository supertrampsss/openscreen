/**
 * LineChart SVG maison (react-native-svg) — Tendances (§5.7).
 *
 * DÉCISION (§10, §11 commit 12) : `react-native-gifted-charts` bundle sur
 * l'export web mais PLANTE au runtime (« Gradient package was not found » — il
 * exige react-native-linear-gradient / expo-linear-gradient). Plutôt que d'ajouter
 * une dépendance native de dégradé, on dessine nos courbes avec react-native-svg
 * (déjà présent, rendu identique web/natif, zéro dépendance en plus).
 *
 * Invariants produit : les `null` sont des TROUS (jamais des zéros — §2, §5.7) ;
 * bandes de sévérité en fonds PÂLES, jamais de rouge alarmiste (§3).
 */

import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { useTheme } from "@/theme";

export interface ChartBand {
	from: number;
	to: number;
	/** Couleur de fond (translucide, jamais rouge vif). */
	color: string;
}

interface LineChartProps {
	/** Points ordonnés ; `null` = jour sans donnée (rupture de ligne). */
	data: (number | null)[];
	color: string;
	width: number;
	height?: number;
	min?: number;
	max?: number;
	/** Bandes horizontales de sévérité (fonds pâles). */
	bands?: ChartBand[];
	testID?: string;
}

export function LineChart({
	data,
	color,
	width,
	height = 180,
	min,
	max,
	bands = [],
	testID,
}: LineChartProps) {
	const theme = useTheme();
	const padX = 8;
	const padY = 12;
	const innerW = width - padX * 2;
	const innerH = height - padY * 2;

	const values = data.filter((v): v is number => v != null);
	const lo = min ?? (values.length ? Math.min(...values) : 0);
	const hiRaw = max ?? (values.length ? Math.max(...values) : 1);
	const hi = hiRaw <= lo ? lo + 1 : hiRaw;

	const n = data.length;
	const xAt = (i: number) => padX + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
	const yAt = (v: number) => padY + innerH - ((v - lo) / (hi - lo)) * innerH;

	// Segments continus (rompus sur les null).
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
		current += `${current ? " L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
	});
	if (current) segments.push(current);

	const showDots = n <= 31;

	return (
		<View testID={testID} style={styles.wrap}>
			<Svg width={width} height={height}>
				{bands.map((b) => {
					const yTop = yAt(Math.min(b.to, hi));
					const yBottom = yAt(Math.max(b.from, lo));
					return (
						<Rect
							key={`${b.from}-${b.to}`}
							x={padX}
							y={yTop}
							width={innerW}
							height={Math.max(0, yBottom - yTop)}
							fill={b.color}
						/>
					);
				})}
				<Line
					x1={padX}
					y1={height - padY}
					x2={width - padX}
					y2={height - padY}
					stroke={theme.colors.border}
					strokeWidth={StyleSheet.hairlineWidth}
				/>
				{segments.map((d) => (
					<Path
						key={d}
						d={d}
						stroke={color}
						strokeWidth={2.5}
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
				))}
				{showDots
					? data.map((v, i) =>
							v == null ? null : (
								<Circle key={`${i}-${v}`} cx={xAt(i)} cy={yAt(v)} r={3} fill={color} />
							),
						)
					: null}
			</Svg>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { alignItems: "center" },
});
