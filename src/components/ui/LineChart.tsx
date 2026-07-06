/**
 * LineChart SVG maison (react-native-svg) — Tendances (§5.7).
 *
 * DÉCISION (§10, §11 commit 12) : `react-native-gifted-charts` bundle sur
 * l'export web mais PLANTE au runtime (« Gradient package was not found » — il
 * exige react-native-linear-gradient / expo-linear-gradient). Plutôt que d'ajouter
 * une dépendance native de dégradé, on dessine nos courbes avec react-native-svg
 * (déjà présent, rendu identique web/natif, zéro dépendance en plus).
 *
 * Direction « Clinique calme » : aire de remplissage douce sous la courbe,
 * grille horizontale discrète, dernier point mis en valeur (halo). Les bandes de
 * sévérité restent des fonds PÂLES et étagés, jamais de rouge alarmiste (§3).
 * Invariant produit : les `null` sont des TROUS (jamais des zéros — §2, §5.7).
 */

import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
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

interface Pt {
	x: number;
	y: number;
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
	// id unique par instance pour le dégradé (plusieurs courbes coexistent).
	const gradientId = `line-fill-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
	const padX = 8;
	const padY = 12;
	const innerW = width - padX * 2;
	const innerH = height - padY * 2;
	const baselineY = padY + innerH;

	const values = data.filter((v): v is number => v != null);
	const lo = min ?? (values.length ? Math.min(...values) : 0);
	const hiRaw = max ?? (values.length ? Math.max(...values) : 1);
	const hi = hiRaw <= lo ? lo + 1 : hiRaw;

	const n = data.length;
	const xAt = (i: number) => padX + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
	const yAt = (v: number) => padY + innerH - ((v - lo) / (hi - lo)) * innerH;

	// Groupes de points continus (rompus sur les null) : servent à la fois pour la
	// ligne et pour l'aire fermée sous chaque segment.
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

	// Grille horizontale discrète : 3 repères internes, étagés.
	const gridLines = [0.25, 0.5, 0.75].map((f) => padY + innerH * f);

	// Dernier point renseigné → mis en valeur (halo + point plein).
	let lastIdx = -1;
	for (let i = n - 1; i >= 0; i--) {
		if (data[i] != null) {
			lastIdx = i;
			break;
		}
	}
	const showDots = n <= 31;

	return (
		<View testID={testID} style={styles.wrap}>
			<Svg width={width} height={height}>
				<Defs>
					<LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
						<Stop offset="0" stopColor={color} stopOpacity={0.16} />
						<Stop offset="1" stopColor={color} stopOpacity={0} />
					</LinearGradient>
				</Defs>

				{/* Bandes de sévérité (fonds pâles étagés). */}
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

				{/* Grille horizontale discrète. */}
				{gridLines.map((y) => (
					<Line
						key={`grid-${y.toFixed(1)}`}
						x1={padX}
						y1={y}
						x2={width - padX}
						y2={y}
						stroke={theme.colors.border}
						strokeWidth={StyleSheet.hairlineWidth}
						opacity={0.6}
					/>
				))}

				{/* Ligne de base. */}
				<Line
					x1={padX}
					y1={baselineY}
					x2={width - padX}
					y2={baselineY}
					stroke={theme.colors.border}
					strokeWidth={StyleSheet.hairlineWidth}
				/>

				{/* Aire de remplissage douce (uniquement sous les segments ≥ 2 points). */}
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
						strokeWidth={2.5}
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
				))}

				{/* Points (masqués sur les longues séries). */}
				{showDots
					? data.map((v, i) =>
							v == null || i === lastIdx ? null : (
								<Circle key={`${i}-${v}`} cx={xAt(i)} cy={yAt(v)} r={3} fill={color} />
							),
						)
					: null}

				{/* Dernier point : halo doux + point plein cerclé de la carte. */}
				{lastIdx >= 0 ? (
					<>
						<Circle
							cx={xAt(lastIdx)}
							cy={yAt(data[lastIdx] as number)}
							r={9}
							fill={color}
							opacity={0.14}
						/>
						<Circle
							cx={xAt(lastIdx)}
							cy={yAt(data[lastIdx] as number)}
							r={4.5}
							fill={color}
							stroke={theme.colors.card}
							strokeWidth={2}
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
