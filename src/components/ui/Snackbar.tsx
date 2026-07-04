import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";

interface SnackOptions {
	message: string;
	/** Libellé d'action (ex. « Annuler »). */
	actionLabel?: string;
	onAction?: () => void;
	durationMs?: number;
}

interface SnackbarApi {
	show: (opts: SnackOptions) => void;
	hide: () => void;
}

/**
 * Défaut hors `SnackbarProvider` : no-op explicite. Le provider est monté à la
 * racine (`app/_layout.tsx`), donc ce défaut ne sert qu'au typage / aux tests
 * de composants isolés — afficher un toast sans provider est silencieusement ignoré.
 */
const noopSnackbar: SnackbarApi = {
	show: () => undefined,
	hide: () => undefined,
};

const SnackbarContext = createContext<SnackbarApi>(noopSnackbar);

/** Snackbar/toast global : message discret + action optionnelle (undo). */
export function SnackbarProvider({ children }: { children: ReactNode }) {
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const [state, setState] = useState<SnackOptions | null>(null);
	const opacity = useRef(new Animated.Value(0)).current;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const hide = useCallback(() => {
		Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
			setState(null);
		});
	}, [opacity]);

	const show = useCallback(
		(opts: SnackOptions) => {
			if (timer.current) clearTimeout(timer.current);
			setState(opts);
			Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
			timer.current = setTimeout(hide, opts.durationMs ?? 3200);
		},
		[opacity, hide],
	);

	useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

	return (
		<SnackbarContext.Provider value={{ show, hide }}>
			{children}
			{state ? (
				<Animated.View
					pointerEvents="box-none"
					style={[styles.wrap, { bottom: insets.bottom + 72, opacity }]}
				>
					<View
						style={[
							styles.bar,
							{
								backgroundColor: theme.colors.text,
								borderRadius: theme.radii.md,
							},
						]}
					>
						<Text style={[theme.typography.body, styles.msg, { color: theme.colors.background }]}>
							{state.message}
						</Text>
						{state.actionLabel ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={state.actionLabel}
								onPress={() => {
									state.onAction?.();
									hide();
								}}
								hitSlop={8}
							>
								<Text style={[theme.typography.label, { color: theme.colors.stool }]}>
									{state.actionLabel}
								</Text>
							</Pressable>
						) : null}
					</View>
				</Animated.View>
			) : null}
		</SnackbarContext.Provider>
	);
}

export function useSnackbar(): SnackbarApi {
	return useContext(SnackbarContext);
}

const styles = StyleSheet.create({
	wrap: {
		position: "absolute",
		left: 16,
		right: 16,
		alignItems: "center",
	},
	bar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
		paddingVertical: 12,
		paddingHorizontal: 16,
		minHeight: 48,
		width: "100%",
	},
	msg: {
		flex: 1,
	},
});
