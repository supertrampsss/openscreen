import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { dataColors } from "@/theme";

/**
 * Confetti SOBRE (§3) — réservé aux JALONS (1er export, séries), jamais lié aux
 * symptômes. Quelques pastilles aux couleurs de la donnée qui tombent et
 * s'estompent en ~1,4 s. `pointerEvents=none` : n'intercepte aucun tap.
 */
interface ConfettiProps {
	/** Passe à true déclenche une bouffée unique. */
	visible: boolean;
	/** Nombre de pastilles (défaut 14 — sobre). */
	count?: number;
	onDone?: () => void;
}

const PALETTE = [dataColors.stool, dataColors.energy, dataColors.meal, dataColors.pain];

export function Confetti({ visible, count = 14, onDone }: ConfettiProps) {
	const { width } = useWindowDimensions();
	const progress = useRef(new Animated.Value(0)).current;

	// Positions/retards figés une fois (rendu stable, pas de random par frame).
	const pieces = useMemo(
		() =>
			Array.from({ length: count }, (_, i) => ({
				x: ((i + 0.5) / count) * width + ((i % 3) - 1) * 10,
				color: PALETTE[i % PALETTE.length],
				drift: (i % 2 === 0 ? 1 : -1) * (10 + (i % 4) * 8),
			})),
		[count, width],
	);

	useEffect(() => {
		if (!visible) return;
		progress.setValue(0);
		Animated.timing(progress, {
			toValue: 1,
			duration: 1400,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: true,
		}).start(() => onDone?.());
	}, [visible, progress, onDone]);

	if (!visible) return null;

	return (
		<View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti">
			{pieces.map((p, i) => {
				const translateY = progress.interpolate({
					inputRange: [0, 1],
					outputRange: [-40, 320],
				});
				const translateX = progress.interpolate({
					inputRange: [0, 1],
					outputRange: [0, p.drift],
				});
				const opacity = progress.interpolate({
					inputRange: [0, 0.7, 1],
					outputRange: [1, 1, 0],
				});
				return (
					<Animated.View
						key={`${p.x}-${i}`}
						style={[
							styles.piece,
							{
								left: p.x,
								backgroundColor: p.color,
								opacity,
								transform: [{ translateX }, { translateY }],
							},
						]}
					/>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	piece: {
		position: "absolute",
		top: 0,
		width: 8,
		height: 8,
		borderRadius: 2,
	},
});
