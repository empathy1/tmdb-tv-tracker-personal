import { colors } from "@/styles/global";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.surface,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="home"
              size={size}
              color={focused ? colors.primary : colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="search"
              size={size}
              color={focused ? colors.primary : colors.textSecondary}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="hub"
        options={{
          title: "Hub",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="list"
              size={size}
              color={focused ? colors.primary : colors.textSecondary}
            />
          ),
        }}
      />
    </Tabs>
  );
}
