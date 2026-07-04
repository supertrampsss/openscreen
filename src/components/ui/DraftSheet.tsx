import { type ReactNode, useEffect, useRef } from "react";
import {
	Animated,
	BackHandler,
	Easing,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { PillButton } from "./PillButton";

interface DraftSheetProps {
	visible: boolean;
	onClose: () => void;
	children: ReactNode;
	title?: string;
	/** Libellé du bouton de confirmation. Masqué si absent. */
	confirmLabel?: string;
	onConfirm?: () => void;
	confirmDisabled?: boolean;
	confirmAccessibilityLabel?: string;
	/** testID du bouton de confirmation (E2E). */
	confirmTestID?: string;
}

/**
 * Bottom-sheet maison (§3, PAS de lib externe) : Modal + View animée translateY,
 * scrim tappable, poignée, contenu scrollable + bouton de confirmation.
 */
export function DraftSheet({
	visible,
	onClose,
	children,
	title,
	confirmLabel,
	onConfirm,
	confirmDisabled = false,
	confirmAccessibilityLabel,
	confirmTestID,
}: DraftSheetProps) {
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const translateY = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		Animated.timing(translateY, {
			toValue: visible ? 0 : 1,
			duration: visible ? 260 : 200,
			easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
			useNativeDriver: true,
		}).start();
	}, [visible, translateY]);

	useEffect(() => {
		if (!visible) return;
		const sub = BackHandler.addEventListener("hardwareBackPress", () => {
			onClose();
			return true;
		});
		return () => sub.remove();
	}, [visible, onClose]);

	const sheetTranslate = translateY.interpolate({
		inputRange: [0, 1],
		outputRange: [0, 600],
	});

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
			<View style={styles.fill}>
				<Pressable
					style={[styles.scrim, { backgroundColor: theme.colors.scrim }]}
					accessibilityRole="button"
					accessibilityLabel="Fermer"
					onPress={onClose}
				/>
				<Animated.View
					style={[
						styles.sheet,
						{
							backgroundColor: theme.colors.card,
							borderTopLeftRadius: theme.radii.lg,
							borderTopRightRadius: theme.radii.lg,
							paddingBottom: insets.bottom + theme.spacing.lg,
							transform: [{ translateY: sheetTranslate }],
						},
					]}
				>
					<View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
					{title ? (
						<Text style={[theme.typography.heading, styles.title, { color: theme.colors.text }]}>
							{title}
						</Text>
					) : null}
					<ScrollView
						style={styles.body}
						contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.md }}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
					>
						{children}
					</ScrollView>
					{confirmLabel && onConfirm ? (
						<View style={styles.footer}>
							<PillButton
								label={confirmLabel}
								onPress={onConfirm}
								disabled={confirmDisabled}
								accessibilityLabel={confirmAccessibilityLabel ?? confirmLabel}
								testID={confirmTestID}
							/>
						</View>
					) : null}
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	fill: {
		flex: 1,
		justifyContent: "flex-end",
	},
	scrim: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	sheet: {
		paddingHorizontal: 20,
		paddingTop: 8,
		maxHeight: "88%",
	},
	handle: {
		width: 40,
		height: 5,
		borderRadius: 999,
		alignSelf: "center",
		marginBottom: 12,
	},
	title: {
		marginBottom: 12,
	},
	body: {
		flexGrow: 0,
	},
	footer: {
		paddingTop: 12,
	},
});
