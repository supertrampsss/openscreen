import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { useTheme } from "@/theme";

export type BristolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface BristolIconProps {
	type: BristolType;
	size?: number;
	/** Surligné (violet #8B5CF6) quand sélectionné, gris sinon. */
	selected?: boolean;
	color?: string;
}

/**
 * Pictogrammes Bristol maison, sobres et stylisés — formes abstraites (§3).
 * 1=billes séparées · 2=grumeaux liés · 3=saucisse craquelée · 4=saucisse lisse
 * 5=morceaux mous · 6=fragments floconneux · 7=liquide.
 * ViewBox 48×48. Rendu au trait pour un rendu graphique, pas clinique.
 */
export function BristolIcon({ type, size = 40, selected = false, color }: BristolIconProps) {
	const theme = useTheme();
	const stroke = color ?? (selected ? theme.colors.stool : theme.colors.textFaint);
	const fill = selected ? theme.colors.stool : "none";
	const sw = 2.2;
	const common = { stroke, strokeWidth: sw, fill } as const;

	return (
		<Svg width={size} height={size} viewBox="0 0 48 48">
			{renderShape(type, common)}
		</Svg>
	);
}

type ShapeProps = { stroke: string; strokeWidth: number; fill: string };

function renderShape(type: BristolType, p: ShapeProps) {
	switch (type) {
		case 1:
			// Billes séparées et dures.
			return (
				<>
					<Circle cx={15} cy={17} r={5} {...p} />
					<Circle cx={31} cy={15} r={5} {...p} />
					<Circle cx={20} cy={31} r={5} {...p} />
					<Circle cx={34} cy={30} r={5} {...p} />
				</>
			);
		case 2:
			// Grumeaux liés (saucisse bosselée).
			return (
				<Path
					d="M8 24c0-5 4-6 7-6 3 0 4 2 8 2s5-2 9-2 8 1 8 6-4 6-8 6-6-2-9-2-5 2-8 2-7-1-7-6z"
					{...p}
				/>
			);
		case 3:
			// Saucisse craquelée.
			return (
				<>
					<Path d="M8 24c0-4 4-6 16-6s16 2 16 6-4 6-16 6-16-2-16-6z" {...p} />
					<Path d="M19 19v10M27 18v11" stroke={p.stroke} strokeWidth={1.6} fill="none" />
				</>
			);
		case 4:
			// Saucisse lisse (l'idéal).
			return <Path d="M7 24c0-3.5 4-5.5 17-5.5S41 20.5 41 24s-4 5.5-17 5.5S7 27.5 7 24z" {...p} />;
		case 5:
			// Morceaux mous aux bords nets.
			return (
				<>
					<Ellipse cx={16} cy={19} rx={7} ry={5} {...p} />
					<Ellipse cx={32} cy={20} rx={6} ry={4.5} {...p} />
					<Ellipse cx={24} cy={31} rx={8} ry={5} {...p} />
				</>
			);
		case 6:
			// Fragments floconneux aux bords déchiquetés.
			return (
				<Path
					d="M10 22l3-3 2 3 3-4 3 4 3-3 2 3 4-3 2 4 3-2 1 4-2 3-4-1-2 3-3-2-3 3-3-3-3 2-3-3-1-4z"
					{...p}
				/>
			);
		case 7:
			// Liquide : flaque ondulée.
			return (
				<Path
					d="M8 26c0-4 5-6 16-6s16 2 16 6c0 1.5-1 3-3 3 1 1 1 3-1 3-1.5 0-2-1-4-1s-3 2-5 2-3-2-5-2-2 1-4 1c-2 0-3-2-2-3-3-1-4-1.5-4-3z"
					{...p}
				/>
			);
	}
}
