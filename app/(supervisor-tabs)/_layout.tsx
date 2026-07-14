import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View } from "react-native";
import { C } from "../../src/utils/theme";
import { rf, rs } from "../../src/utils/responsive";
import FeatureTour from "../../src/components/FeatureTour";

export default function SupervisorTabsLayout() {
  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = rs(58) + insets.bottom;

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      safeAreaInsets={{ top: 0 }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: C.bg },
        tabBarActiveTintColor:   C.brand,
        tabBarInactiveTintColor: C.text,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor:  C.border,
          borderTopWidth:  1,
          height:          TAB_BAR_HEIGHT,
          paddingBottom:   insets.bottom > 0 ? insets.bottom : rs(6),
          paddingTop:      rs(4),
          elevation:       8,
          shadowColor:     "#000",
          shadowOpacity:   0.06,
          shadowRadius:    8,
          shadowOffset:    { width: 0, height: -2 },
        },
        tabBarLabelStyle: {
          fontSize:     rf(12),
          fontWeight:   "600",
          marginBottom: Platform.OS === "ios" ? 0 : rs(2),
        },
      }}
    >
      <Tabs.Screen
        name="presences"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="evaluation"
        options={{
          title: "Évaluation",
          tabBarIcon: ({ color, size }) => (
            <Feather name="list" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="difficultes"
        options={{
          title: "Difficultés",
          tabBarIcon: ({ color, size }) => (
            <Feather name="alert-triangle" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rapports"
        options={{
          title: "Rapports",
          tabBarIcon: ({ color, size }) => (
            <Feather name="send" size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tabs>

    {/* Visite guidée des fonctionnalités (première connexion) */}
    <FeatureTour role="superviseur" tabCount={4} />
    </View>
  );
}
