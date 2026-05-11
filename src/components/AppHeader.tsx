/**
 * Barre d'en-tête commune — logo ARED + "Ndaw Wune" + avatar utilisateur.
 * Absorbe elle-même le top inset (notch / barre de statut) pour coller
 * au haut de l'écran sans espace vide, quelle que soit l'appareil.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AredLogo from "./AredLogo";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";

interface Props {
  userName?: string;
  onAvatarPress?: () => void;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map(p => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AppHeader({ userName = "", onAvatarPress }: Props) {
  const insets = useSafeAreaInsets();
  const ini = initials(userName);

  return (
    <View style={[s.wrap, { paddingTop: insets.top > 0 ? insets.top : rs(12) }]}>
      <View style={s.left}>
        <AredLogo size={36} />
        <Text style={s.title}>Ndaw Wune</Text>
      </View>
      <TouchableOpacity style={s.avatar} onPress={onAvatarPress} activeOpacity={0.75}>
        <Text style={s.avatarTxt}>{ini || "?"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: rs(16),
    paddingBottom: rs(10),
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  left:      { flexDirection: "row", alignItems: "center" },
  title:     { marginLeft: rs(10), fontSize: rf(17), fontWeight: "700", color: C.text },
  avatar: {
    width: rs(38), height: rs(38), borderRadius: rs(19),
    backgroundColor: C.brandSoft,
    alignItems: "center", justifyContent: "center",
  },
  avatarTxt: { fontSize: rf(14), fontWeight: "700", color: C.brand },
});
