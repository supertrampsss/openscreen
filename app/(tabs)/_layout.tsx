import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { type ColorValue, Text } from "react-native";
import { useTheme } from "@/theme";

function TabIcon({ emoji, color }: { emoji: string; color: ColorValue }) {
	return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function TabsLayout() {
	const { t } = useTranslation("common");
	const theme = useTheme();

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
					tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="journal"
				options={{
					title: t("tabs.journal"),
					tabBarIcon: ({ color }) => <TabIcon emoji="📓" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="trends"
				options={{
					title: t("tabs.trends"),
					tabBarIcon: ({ color }) => <TabIcon emoji="📈" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="settings"
				options={{
					title: t("tabs.settings"),
					tabBarIcon: ({ color }) => <TabIcon emoji="⚙️" color={color} />,
				}}
			/>
		</Tabs>
	);
}
