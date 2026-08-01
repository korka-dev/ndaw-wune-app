import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View } from "react-native";
import { C } from "../../src/utils/theme";
import { rf, rs } from "../../src/utils/responsive";
import AppGuide from "../../src/components/AppGuide";
import { useAndroidBack } from "../../src/hooks/useAndroidBack";

export default function SupervisorTabsLayout() {
  const insets = useSafeAreaInsets();

  // Le bouton retour matériel ne doit jamais dépiler hors des onglets : l\'écran
  // « Tuteur / Superviseur » reste sous eux dans la pile, et y revenir donne
  // l\'impression d\'une déconnexion. Les écrans à étapes internes enregistrent
  // leur propre handler, appelé en priorité (dernier enregistré = premier servi).
  useAndroidBack(() => true);
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

    <AppGuide role="superviseur" />
    </View>
  );
}
