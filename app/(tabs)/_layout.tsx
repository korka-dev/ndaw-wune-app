import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View } from "react-native";
import { C } from "../../src/utils/theme";
import { rf, rs } from "../../src/utils/responsive";
import AppGuide from "../../src/components/AppGuide";
import { useStore } from "../../src/store/useStore";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const user = useStore(state => state.user);
  // Accès restreint : le tuteur "timer_only" ne voit que l'accueil (planning + timer)
  const timerOnly = (user as any)?.app_access === "timer_only";

  // Hauteur de la tab bar : safe area bottom + contenu de la bar
  const TAB_BAR_HEIGHT = rs(58) + insets.bottom;

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      safeAreaInsets={{ top: 0 }}
      screenOptions={{
        headerShown: false,
        // Chaque écran gère son propre inset top via AppHeader
        sceneStyle: { backgroundColor: C.bg },
        tabBarActiveTintColor:   C.primary,
        tabBarInactiveTintColor: C.text,
        tabBarStyle: {
          backgroundColor:  C.surface,
          borderTopColor:   C.border,
          borderTopWidth:   1,
          height:           TAB_BAR_HEIGHT,
          paddingBottom:    insets.bottom > 0 ? insets.bottom : rs(6),
          paddingTop:       rs(4),
          elevation:        8,
          shadowColor:      "#000",
          shadowOpacity:    0.06,
          shadowRadius:     8,
          shadowOffset:     { width: 0, height: -2 },
        },
        tabBarLabelStyle: {
          fontSize:     rf(12),
          fontWeight:   "600",
          marginBottom: Platform.OS === "ios" ? 0 : rs(2),
        },
        tabBarIconStyle: {
          marginTop: rs(2),
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rapports"
        options={{
          href: timerOnly ? null : undefined,
          title: "Rapports",
          tabBarIcon: ({ color, size }) => (
            <Feather name="send" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="evaluations"
        options={{
          href: timerOnly ? null : undefined,
          title: "Évaluations",
          tabBarIcon: ({ color, size }) => (
            <Feather name="award" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ressources"
        options={{
          href: timerOnly ? null : undefined,
          title: "Ressources",
          tabBarIcon: ({ color, size }) => (
            <Feather name="book-open" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="rapport-detail"
        options={{ href: null }}
      />
    </Tabs>

    {!timerOnly && <AppGuide role="enseignant" />}
    </View>
  );
}
