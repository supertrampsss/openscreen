/**
 * Icônes au trait — jeu maison « Clinique calme » (§3 refonte design).
 *
 * Remplace TOUS les emoji utilisés comme icônes (navigation, avatars de log,
 * en-têtes de section). Une seule famille cohérente : stroke `currentColor`,
 * viewBox 24, bouts arrondis, trait fin — dessinée à la main pour rester
 * cohérente avec le pictogramme Bristol déjà maison (`BristolIcon`).
 *
 * Fichier react-native-svg pur (pas de dépendance d'icônes).
 */

import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

/** Noms d'icônes disponibles. */
export type IconName =
	| "home"
	| "journal"
	| "pin"
	| "activity"
	| "settings"
	| "camera"
	| "mic"
	| "utensils"
	| "capsule"
	| "thermometer"
	| "stool"
	| "flame"
	| "snowflake"
	| "moon"
	| "bell"
	| "sparkles"
	| "stethoscope"
	| "lifebuoy"
	| "plus"
	| "chevronRight"
	| "check"
	| "refresh";

interface IconProps {
	name: IconName;
	/** Taille (largeur = hauteur). Défaut 22. */
	size?: number;
	/** Couleur du trait. Défaut currentColor (hérite via prop). */
	color?: string;
	/** Épaisseur du trait. Défaut 1.8. */
	strokeWidth?: number;
}

/**
 * Dessine une icône du jeu maison. Les `props` de trait sont passés aux
 * éléments SVG ; certaines icônes ajoutent un point plein (pastille) via `fill`.
 */
export function Icon({ name, size = 22, color = "#000", strokeWidth = 1.8 }: IconProps) {
	const s = {
		stroke: color,
		strokeWidth,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		fill: "none" as const,
	};
	return (
		<Svg width={size} height={size} viewBox="0 0 24 24">
			{glyph(name, s, color)}
		</Svg>
	);
}

type StrokeProps = {
	stroke: string;
	strokeWidth: number;
	strokeLinecap: "round";
	strokeLinejoin: "round";
	fill: "none";
};

function glyph(name: IconName, s: StrokeProps, color: string) {
	switch (name) {
		case "home":
			return (
				<>
					<Path d="M3 10.5 12 3l9 7.5" {...s} />
					<Path d="M5 9.5V20h14V9.5" {...s} />
					<Path d="M9.5 20v-6h5v6" {...s} />
				</>
			);
		case "journal":
			return (
				<>
					<Path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2Z" {...s} />
					<Path d="M9 8h6M9 12h6" {...s} />
				</>
			);
		case "pin":
			return (
				<>
					<Path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11Z" {...s} />
					<Circle cx={12} cy={10} r={2.4} {...s} />
				</>
			);
		case "activity":
			return (
				<>
					<Path d="M4 19V5M4 19h16" {...s} />
					<Path d="M7 15l4-5 3 3 4-6" {...s} />
				</>
			);
		case "settings":
			return (
				<>
					<Circle cx={12} cy={12} r={3} {...s} />
					<Path
						d="M12 2.5a1.6 1.6 0 0 1 1.6 1.6v.3a1.4 1.4 0 0 0 2.1 1.05l.2-.12a1.6 1.6 0 1 1 1.6 2.77l-.2.12a1.4 1.4 0 0 0 0 2.42l.2.12a1.6 1.6 0 1 1-1.6 2.77l-.2-.12A1.4 1.4 0 0 0 13.6 17.6v.3a1.6 1.6 0 1 1-3.2 0v-.3a1.4 1.4 0 0 0-2.1-1.05l-.2.12a1.6 1.6 0 1 1-1.6-2.77l.2-.12a1.4 1.4 0 0 0 0-2.42l-.2-.12a1.6 1.6 0 1 1 1.6-2.77l.2.12A1.4 1.4 0 0 0 10.4 4.4v-.3A1.6 1.6 0 0 1 12 2.5Z"
						{...s}
					/>
				</>
			);
		case "camera":
			return (
				<>
					<Path d="M4 8h3l1.5-2h7L17 8h3v11H4Z" {...s} />
					<Circle cx={12} cy={13} r={3.2} {...s} />
				</>
			);
		case "mic":
			return (
				<>
					<Rect x={9} y={3} width={6} height={11} rx={3} {...s} />
					<Path d="M6 11a6 6 0 0 0 12 0M12 17v4" {...s} />
				</>
			);
		case "utensils":
			return (
				<Path
					d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11M17 3c-1.5 0-2.5 1.5-2.5 4.5S15.5 12 17 12v9"
					{...s}
				/>
			);
		case "capsule":
			return (
				<>
					<Rect
						x={2.5}
						y={8.5}
						width={19}
						height={7}
						rx={3.5}
						transform="rotate(-45 12 12)"
						{...s}
					/>
					<Line x1={9.5} y1={9.5} x2={14.5} y2={14.5} {...s} />
				</>
			);
		case "thermometer":
			return (
				<>
					<Path d="M12 14a4 4 0 0 0 4-4V5a4 4 0 0 0-8 0v5a4 4 0 0 0 4 4Z" {...s} />
					<Path d="M12 14v4M9 21h6" {...s} />
					<Circle cx={12} cy={6} r={1.2} fill={color} stroke="none" />
				</>
			);
		case "stool":
			return <Path d="M3 12c0-1.9 2-2.9 9-2.9s9 1 9 2.9-2 2.9-9 2.9-9-1-9-2.9Z" {...s} />;
		case "flame":
			return (
				<>
					<Path
						d="M12 3c.6 3 3.2 4.4 3.2 7.6a3.2 3.2 0 0 1-6.4 0c0-1 .4-1.7.8-2.3.3 1 .9 1.4 1.4 1.5C10.6 8 10 6 12 3Z"
						{...s}
					/>
					<Path d="M8.5 13.5A5.5 5.5 0 1 0 17 18" {...s} />
				</>
			);
		case "snowflake":
			return (
				<>
					<Path d="M12 3v18M4.2 7.5 19.8 16.5M19.8 7.5 4.2 16.5" {...s} />
					<Path d="M12 6.5 9.7 4.6M12 6.5l2.3-1.9M12 17.5l-2.3 1.9M12 17.5l2.3 1.9" {...s} />
				</>
			);
		case "moon":
			return <Path d="M20 13.5A8 8 0 1 1 10.5 4 6.5 6.5 0 0 0 20 13.5Z" {...s} />;
		case "bell":
			return (
				<>
					<Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" {...s} />
					<Path d="M10 19a2 2 0 0 0 4 0" {...s} />
				</>
			);
		case "sparkles":
			return (
				<>
					<Path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" {...s} />
					<Path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" {...s} />
				</>
			);
		case "stethoscope":
			return (
				<>
					<Path d="M5 3v5a4 4 0 0 0 8 0V3" {...s} />
					<Path d="M9 16a5 5 0 0 0 5 5 4 4 0 0 0 4-4v-2.5" {...s} />
					<Circle cx={18} cy={11} r={2.4} {...s} />
				</>
			);
		case "lifebuoy":
			return (
				<>
					<Circle cx={12} cy={12} r={9} {...s} />
					<Circle cx={12} cy={12} r={3.4} {...s} />
					<Path d="M14.4 9.6 18 6M6 18l3.6-3.6M14.4 14.4 18 18M6 6l3.6 3.6" {...s} />
				</>
			);
		case "plus":
			return <Path d="M12 5v14M5 12h14" {...s} strokeWidth={s.strokeWidth + 0.3} />;
		case "chevronRight":
			return <Path d="M9 6l6 6-6 6" {...s} />;
		case "check":
			return <Path d="M4 12.5 9 17.5 20 6.5" {...s} strokeWidth={s.strokeWidth + 0.2} />;
		case "refresh":
			return (
				<>
					<Path d="M4 12a8 8 0 0 1 13.7-5.6L20 8" {...s} />
					<Path d="M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.6L4 16" {...s} />
					<Path d="M4 20v-4h4" {...s} />
				</>
			);
	}
}
