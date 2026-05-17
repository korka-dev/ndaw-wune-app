/**
 * Barre d'en-tête commune — logo ARED + "Ndaw Wune" + avatar utilisateur.
 * Absorbe elle-même le top inset (notch / barre de statut) pour coller
 * au haut de l'écran sans espace vide, quelle que soit l'appareil.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AredLogo from "./AredLogo";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";

interface Props {
  userName?: string;
  onAvatarPress?: () => void;
  onSyncPress?: () => void;
  syncing?: boolean;
  isOnline?: boolean;
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

export default function AppHeader({ userName = "", onAvatarPress, onSyncPress, syncing = false, isOnline = true }: Props) {
  const insets = useSafeAreaInsets();
  const ini = initials(userName);

  return (
    <View style={[s.wrap, { paddingTop: (insets.top > 0 ? insets.top : rs(14)) + rs(4) }]}>
      <View style={s.left}>
        <AredLogo size={36} />
        <Text style={s.title}>Ndaw Wune</Text>
      </View>

      <View style={s.right}>
        {/* Indicateur hors-ligne */}
        {!isOnline && (
          <View style={s.offlineBadge}>
            <Feather name="wifi-off" size={rf(11)} color={C.warn} />
            <Text style={s.offlineTxt}>Hors-ligne</Text>
          </View>
        )}

        {/* Bouton sync manuelle */}
        <TouchableOpacity
          style={s.syncBtn}
          onPress={onSyncPress}
          disabled={syncing || !isOnline}
          activeOpacity={0.7}
        >
          {syncing
            ? <ActivityIndicator size="small" color={C.brand} />
            : <Feather name="refresh-cw" size={rf(16)} color={isOnline ? C.brand : C.textMuted} />
          }
        </TouchableOpacity>

        {/* Avatar */}
        <TouchableOpacity style={s.avatar} onPress={onAvatarPress} activeOpacity={0.75}>
          <Text style={s.avatarTxt}>{ini || "?"}</Text>
        </TouchableOpacity>
      </View>
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
  left:  { flexDirection: "row", alignItems: "center" },
  right: { flexDirection: "row", alignItems: "center", gap: rs(8) },
  title: { marginLeft: rs(10), fontSize: rf(17), fontWeight: "700", color: C.text },

  offlineBadge: {
    flexDirection: "row", alignItems: "center", gap: rs(4),
    backgroundColor: "#FFF8E6", borderRadius: rs(20),
    paddingHorizontal: rs(8), paddingVertical: rs(3),
    borderWidth: 1, borderColor: "#F5D87A",
  },
  offlineTxt: { fontSize: rf(10), fontWeight: "600", color: C.warn },

  syncBtn: {
    width: rs(34), height: rs(34), borderRadius: rs(17),
    backgroundColor: C.brandSoft,
    alignItems: "center", justifyContent: "center",
  },
  avatar: {
    width: rs(38), height: rs(38), borderRadius: rs(19),
    backgroundColor: C.brandSoft,
    alignItems: "center", justifyContent: "center",
  },
  avatarTxt: { fontSize: rf(14), fontWeight: "700", color: C.brand },
});
