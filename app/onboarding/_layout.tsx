import { Stack } from "expo-router";
import { useTheme } from "@/theme";

/** Stack de l'onboarding (§4) — sans tabs, plein écran, un seul écran contrôleur. */
export default function OnboardingLayout() {
	const theme = useTheme();
	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: theme.colors.background },
			}}
		/>
	);
}
