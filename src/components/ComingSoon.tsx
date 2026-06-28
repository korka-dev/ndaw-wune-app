/**
 * Écran générique "bientôt disponible" pour les sections en cours de développement.
 */
import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import AppHeader from "./AppHeader";
import ProfileSheet from "./ProfileSheet";
import { useStore } from "../store/useStore";

interface Props {
  section: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}

export default function ComingSoon({ section, icon }: Props) {
  const { user } = useStore();
  const [showProfile, setShowProfile] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <View style={s.screen}>
      <AppHeader userName={user?.name ?? ""} onAvatarPress={() => setShowProfile(true)} />

      <View style={[s.body, { paddingBottom: insets.bottom + rs(16) }]}>
        <View style={s.iconWrap}>
          <Feather name={icon} size={rf(48)} color={C.brand} />
        </View>
        <Text style={s.title}>{section}</Text>
        <Text style={s.message}>
          Cette section sera disponible bientôt.{"\n"}
          Nous y travaillons activement ! 🚀
        </Text>
      </View>

      <ProfileSheet visible={showProfile} onClose={() => setShowProfile(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(32),
  },
  iconWrap: {
    width: rs(90), height: rs(90), borderRadius: rs(24),
    backgroundColor: C.brandSoft,
    alignItems: "center", justifyContent: "center",
    marginBottom: rs(24),
  },
  title:   { fontSize: rf(22), fontWeight: "800", color: C.text, marginBottom: rs(12) },
  message: { fontSize: rf(15), color: C.textMuted, textAlign: "center", lineHeight: rf(24) },
});
