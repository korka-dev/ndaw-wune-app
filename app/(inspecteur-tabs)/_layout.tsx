/**
 * Lot L8 — Espace inspecteur d'IEF (consultation seule) :
 * Accueil (résumé), Écoles, Rapports. Les détails sont des routes masquées.
 */
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { C } from "../../src/utils/theme";
import { rf, rs } from "../../src/utils/responsive";
import { useAndroidBack } from "../../src/hooks/useAndroidBack";

export default function InspecteurTabsLayout() {
  const insets = useSafeAreaInsets();
  // Comme pour les autres espaces : le retour matériel ne sort jamais des
  // onglets (les écrans de détail enregistrent leur propre retour, prioritaire).
  useAndroidBack(() => true);
  const TAB_BAR_HEIGHT = rs(58) + insets.bottom;

  return (
    <Tabs
      backBehavior="history"
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
        name="accueil"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size ?? 22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="ecoles"
        options={{
          title: "Écoles",
          tabBarIcon: ({ color, size }) => <Feather name="map-pin" size={size ?? 22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="rapports-ief"
        options={{
          title: "Rapports",
          tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size ?? 22} color={color as string} />,
        }}
      />
      <Tabs.Screen name="ecole-ief" options={{ href: null }} />
      <Tabs.Screen name="rapport-ief" options={{ href: null }} />
    </Tabs>
  );
}
