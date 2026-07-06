import { useQuickActionRouting } from "expo-quick-actions/router";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ColorValue } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { useTheme } from "@/theme";

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
	return <Icon name={name} color={color as string} size={23} />;
}

export default function TabsLayout() {
	const { t } = useTranslation("common");
	const theme = useTheme();

	// Quick actions (§5.12) : navigue vers le href de l'action tapée. Doit vivre
	// dans un sous-layout (pas le root) — no-op sur web.
	useQuickActionRouting();

	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarActiveTintColor: theme.colors.text,
				tabBarInactiveTintColor: theme.colors.textFaint,
				tabBarStyle: {
					backgroundColor: theme.colors.card,
					borderTopColor: theme.colors.border,
				},
				tabBarLabelStyle: { fontSize: 11 },
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: t("tabs.home"),
					tabBarButtonTestID: "tab-home",
					tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="journal"
				options={{
					title: t("tabs.journal"),
					tabBarButtonTestID: "tab-journal",
					tabBarIcon: ({ color }) => <TabIcon name="journal" color={color} />,
				}}
			/>
			{/* Urgence (§5.10) au CENTRE = accès pouce (ordre final §5.1 :
			    Accueil · Journal · Urgence · Tendances · Réglages). */}
			<Tabs.Screen
				name="toilets"
				options={{
					title: t("tabs.urgence"),
					tabBarButtonTestID: "tab-urgence",
					tabBarIcon: ({ color }) => <TabIcon name="pin" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="trends"
				options={{
					title: t("tabs.trends"),
					tabBarButtonTestID: "tab-trends",
					tabBarIcon: ({ color }) => <TabIcon name="activity" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="settings"
				options={{
					title: t("tabs.settings"),
					tabBarButtonTestID: "tab-settings",
					tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
				}}
			/>
		</Tabs>
	);
}
