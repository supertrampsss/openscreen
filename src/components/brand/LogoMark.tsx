/**
 * LogoMark — la marque Crohnicle (§2). Un anneau ouvert (« C » de Crohnicle)
 * qui fait écho à l'anneau de complétude « Aujourd'hui » et à l'idée de
 * chronique continue. Trait épais, bouts arrondis, calme. Couleur = `brand`
 * par défaut. SVG maison, aucune dépendance d'image.
 */

import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "@/theme";

interface LogoMarkProps {
	size?: number;
	/** Couleur du trait. Défaut : accent `brand`. */
	color?: string;
}

export function LogoMark({ size = 28, color }: LogoMarkProps) {
	const theme = useTheme();
	const stroke = color ?? theme.colors.brand;
	const w = size / 28; // épaisseur proportionnelle
	return (
		<Svg width={size} height={size} viewBox="0 0 28 28">
			{/* Anneau ouvert (gap en haut à droite) = « C ». */}
			<Path
				d="M20.5 7.2A9 9 0 1 0 23 14"
				stroke={stroke}
				strokeWidth={3.4 * w}
				strokeLinecap="round"
				fill="none"
			/>
			{/* Point de continuité (le « jour documenté »). */}
			<Circle cx={22.4} cy={7.6} r={2 * w} fill={stroke} />
		</Svg>
	);
}
