/**
 * Sparkline SVG maison (react-native-svg) — courbe compacte pour Home (§5.1).
 *
 * Direction « Clinique calme » : aire de remplissage douce sous la courbe et
 * dernier point mis en valeur (halo), dans le même esprit que `LineChart`.
 * Les valeurs `null` sont des TROUS (jamais des zéros fabriqués — §2, §5.7) :
 * la ligne se rompt, on ne relie pas deux points séparés par un jour sans donnée.
 */

import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
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

interface Pt {
	x: number;
	y: number;
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
	const gradientId = `spark-fill-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
	const pad = 6;
	const values = data.filter((v): v is number => v != null);
	const lo = min ?? (values.length ? Math.min(...values) : 0);
	const hiRaw = max ?? (values.length ? Math.max(...values) : 1);
	const hi = hiRaw === lo ? lo + 1 : hiRaw; // évite la division par zéro

	const innerW = width - pad * 2;
	const innerH = height - pad * 2;
	const baselineY = height - pad;
	const n = data.length;
	const xAt = (i: number) => pad + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
	const yAt = (v: number) => pad + innerH - ((v - lo) / (hi - lo)) * innerH;

	// Groupes de points continus (rompus sur les null) : ligne + aire fermée.
	const groups: Pt[][] = [];
	let group: Pt[] = [];
	data.forEach((v, i) => {
		if (v == null) {
			if (group.length) {
				groups.push(group);
				group = [];
			}
			return;
		}
		group.push({ x: xAt(i), y: yAt(v) });
	});
	if (group.length) groups.push(group);

	const linePath = (pts: Pt[]) =>
		pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
	const areaPath = (pts: Pt[]) => {
		const first = pts[0];
		const last = pts[pts.length - 1];
		return `${linePath(pts)} L${last.x.toFixed(1)},${baselineY.toFixed(1)} L${first.x.toFixed(1)},${baselineY.toFixed(1)} Z`;
	};

	let lastIdx = -1;
	for (let i = n - 1; i >= 0; i--) {
		if (data[i] != null) {
			lastIdx = i;
			break;
		}
	}

	return (
		<View style={styles.wrap}>
			<Svg width={width} height={height}>
				<Defs>
					<LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
						<Stop offset="0" stopColor={color} stopOpacity={0.14} />
						<Stop offset="1" stopColor={color} stopOpacity={0} />
					</LinearGradient>
				</Defs>

				{/* Ligne de base discrète. */}
				<Line
					x1={pad}
					y1={baselineY}
					x2={width - pad}
					y2={baselineY}
					stroke={theme.colors.border}
					strokeWidth={StyleSheet.hairlineWidth}
				/>

				{/* Aire de remplissage douce. */}
				{groups.map((pts) =>
					pts.length >= 2 ? (
						<Path
							key={`area-${pts[0].x.toFixed(1)}`}
							d={areaPath(pts)}
							fill={`url(#${gradientId})`}
						/>
					) : null,
				)}

				{/* Courbe. */}
				{groups.map((pts) => (
					<Path
						key={`line-${pts[0].x.toFixed(1)}`}
						d={linePath(pts)}
						stroke={color}
						strokeWidth={strokeWidth}
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
				))}

				{/* Points intermédiaires discrets. */}
				{data.map((v, i) =>
					v == null || i === lastIdx ? null : (
						<Circle key={`${i}-${v}`} cx={xAt(i)} cy={yAt(v)} r={strokeWidth} fill={color} />
					),
				)}

				{/* Dernier point : halo doux + point plein cerclé de la carte. */}
				{lastIdx >= 0 ? (
					<>
						<Circle
							cx={xAt(lastIdx)}
							cy={yAt(data[lastIdx] as number)}
							r={strokeWidth + 6}
							fill={color}
							opacity={0.14}
						/>
						<Circle
							cx={xAt(lastIdx)}
							cy={yAt(data[lastIdx] as number)}
							r={strokeWidth + 1.5}
							fill={color}
							stroke={theme.colors.card}
							strokeWidth={1.5}
						/>
					</>
				) : null}
			</Svg>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { alignItems: "center" },
});
