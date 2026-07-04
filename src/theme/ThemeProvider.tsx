/**
 * ThemeProvider + useTheme() — branché sur useColorScheme() (§3, dark mode V1).
 *
 * Expose la palette résolue, les tokens (spacing, radii, shadows, typography)
 * et le nom du thème courant. Un override manuel pourra être branché plus tard
 * depuis les réglages ; pour l'instant on suit le système.
 */

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import {
	hitTarget,
	palettes,
	radii,
	shadows,
	spacing,
	type ThemeColors,
	type ThemeName,
} from "./tokens";
import { fontWeight, typography } from "./typography";

export interface Theme {
	name: ThemeName;
	isDark: boolean;
	colors: ThemeColors;
	spacing: typeof spacing;
	radii: typeof radii;
	shadows: typeof shadows;
	typography: typeof typography;
	fontWeight: typeof fontWeight;
	hitTarget: number;
}

function buildTheme(name: ThemeName): Theme {
	return {
		name,
		isDark: name === "dark",
		colors: palettes[name],
		spacing,
		radii,
		shadows,
		typography,
		fontWeight,
		hitTarget,
	};
}

const ThemeContext = createContext<Theme>(buildTheme("light"));

export function ThemeProvider({ children }: { children: ReactNode }) {
	const scheme = useColorScheme();
	const theme = useMemo(() => buildTheme(scheme === "dark" ? "dark" : "light"), [scheme]);
	return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Accès au thème courant depuis n'importe quel composant. */
export function useTheme(): Theme {
	return useContext(ThemeContext);
}
