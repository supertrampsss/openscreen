/**
 * Primitives de motion (§3) — micro-transitions douces, jamais tape-à-l'œil.
 * Basées sur react-native-reanimated (déjà dépendance). Respectent
 * `prefers-reduced-motion` : rendu immédiat sans animation si réduit.
 */

import type { ReactNode } from "react";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";

interface FadeInViewProps {
	children: ReactNode;
	/** Délai d'apparition (ms) — permet un léger décalage en cascade. */
	delay?: number;
	/** Durée (ms). Défaut 260. */
	duration?: number;
	/** Léger glissement vers le haut à l'apparition. Défaut true. */
	rise?: boolean;
	style?: object;
}

/** Vue qui apparaît en fondu (+ léger glissement), désarmée en reduced-motion. */
export function FadeInView({
	children,
	delay = 0,
	duration = 260,
	rise = true,
	style,
}: FadeInViewProps) {
	const reduced = useReducedMotion();
	if (reduced) {
		return <Animated.View style={style}>{children}</Animated.View>;
	}
	const entering = (rise ? FadeInDown : FadeIn).duration(duration).delay(delay);
	return (
		<Animated.View entering={entering} style={style}>
			{children}
		</Animated.View>
	);
}
