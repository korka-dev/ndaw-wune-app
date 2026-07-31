/**
 * Page Profil — écran plein accessible depuis le tab (href: null).
 * Styles optimisés pour lisibilité Android maximale.
 */
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Switch, Alert,
  TouchableOpacity, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../src/store/useStore";
import { rs, rf } from "../../src/utils/responsive";
import { C } from "../../src/utils/theme";

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase();
}

export default function ProfileScreen() {
  const { user, syncData, logout } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [darkMode, setDarkMode] = useState(false);

  if (!user) return null;

  const ini       = initials(user.name);
  const school    = syncData?.school?.name ?? "—";
  const classe    = user.classes?.join(", ") ?? "—";
  const phone     = user.phone ?? "—";
  const langue    = syncData?.school?.langue ?? "—";
  const nbEleves  = syncData?.stats?.nb_eleves  ?? 0;
  const nbTests   = syncData?.stats?.nb_tests   ?? 0;
  const nbFiches  = syncData?.stats?.nb_fiches  ?? 0;

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter", style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <View style={[s.container, { paddingTop: insets.top + rs(16) }]}>
      <Text style={s.screenTitle}>Mon Profil</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {/* ── Carte utilisateur dorée ── */}
        <View style={s.userCard}>
          <View style={s.userAvatar}>
            <Text style={s.userAvatarTxt}>{ini}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{user.name}</Text>
            <Text style={s.userMeta}>{school}{classe ? ` · ${classe}` : ""}</Text>
            <Text style={s.userPhone}>{phone}</Text>
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={s.statsRow}>
          {[
            { val: nbEleves, label: "Élèves"  },
            { val: nbTests,  label: "Tests"   },
            { val: nbFiches, label: "Fiches"  },
          ].map(({ val, label }) => (
            <View key={label} style={s.statCard}>
              <Text style={s.statVal}>{val}</Text>
              <Text style={s.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Menu ── */}
        <View style={s.menuCard}>
          {/* Mes informations */}
          <TouchableOpacity style={[s.menuRow, s.menuBorder]} activeOpacity={0.6}>
            <View style={s.menuIconBox}>
              <Feather name="user" size={22} color={C.brand} />
            </View>
            <Text style={s.menuLabel}>Mes informations</Text>
            <Feather name="chevron-right" size={20} color="#999" />
          </TouchableOpacity>

          {/* Ma classe */}
          <TouchableOpacity style={[s.menuRow, s.menuBorder]} activeOpacity={0.6}>
            <View style={s.menuIconBox}>
              <Feather name="users" size={22} color={C.brand} />
            </View>
            <View style={s.menuTextWrap}>
              <Text style={s.menuLabel}>Ma classe</Text>
              {nbEleves > 0 && <Text style={s.menuSub}>{nbEleves} élèves</Text>}
            </View>
            <Feather name="chevron-right" size={20} color="#999" />
          </TouchableOpacity>

          {/* Langue d'enseignement (déterminée par l'école, non modifiable) */}
          <View style={[s.menuRow, s.menuBorder]}>
            <View style={s.menuIconBox}>
              <Feather name="globe" size={22} color={C.brand} />
            </View>
            <View style={s.menuTextWrap}>
              <Text style={s.menuLabel}>Langue d'enseignement</Text>
              <Text style={s.menuSub}>{langue}</Text>
            </View>
          </View>

          {/* Mode sombre */}
          <View style={[s.menuRow, s.menuBorder]}>
            <View style={s.menuIconBox}>
              <Feather name="moon" size={22} color={C.brand} />
            </View>
            <Text style={[s.menuLabel, { flex: 1 }]}>Mode sombre</Text>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: "#D1D1D1", true: C.brand }}
              thumbColor={darkMode ? "#fff" : "#f4f4f4"}
            />
          </View>

          {/* Aide et tutoriels */}
          <TouchableOpacity style={s.menuRow} activeOpacity={0.6}>
            <View style={s.menuIconBox}>
              <Feather name="help-circle" size={22} color={C.brand} />
            </View>
            <Text style={s.menuLabel}>Aide et tutoriels</Text>
            <Feather name="chevron-right" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* ── Bouton Déconnexion ── */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Feather name="log-out" size={20} color="#C0392B" />
          <Text style={s.logoutTxt}>Se déconnecter</Text>
        </TouchableOpacity>

        <View style={{ height: rs(60) }} />
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════
   Styles — lisibilité maximale sur Android
   ═══════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAF7F1",
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#1A1A1A",
    paddingHorizontal: 20,
    marginBottom: 18,
    ...(Platform.OS === "android" && { fontFamily: "sans-serif-medium" }),
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 80,
  },

  /* ── Carte utilisateur dorée ── */
  userCard: {
    backgroundColor: C.brand,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  userAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center", justifyContent: "center",
    marginRight: 14,
  },
  userAvatarTxt: {
    color: "#fff", fontWeight: "800", fontSize: 24,
  },
  userName: {
    color: "#fff", fontWeight: "800",
    fontSize: 21, marginBottom: 3,
  },
  userMeta: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 16, fontWeight: "600",
  },
  userPhone: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15, fontWeight: "500", marginTop: 2,
  },

  /* ── Stats ── */
  statsRow: {
    flexDirection: "row", marginBottom: 16, gap: 8,
  },
  statCard: {
    flex: 1, backgroundColor: "#F5F0E4",
    borderRadius: 14, paddingVertical: 14,
    alignItems: "center",
  },
  statVal: {
    fontSize: 26, fontWeight: "900", color: "#1A1A1A",
  },
  statLabel: {
    fontSize: 14, fontWeight: "600", color: "#555", marginTop: 3,
  },

  /* ── Menu ── */
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5, borderColor: "#E8E0CC",
    marginBottom: 20,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 68,
  },
  menuBorder: {
    borderBottomWidth: 1, borderBottomColor: "#F0EBE0",
  },
  menuIconBox: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: "#F5EDDA",
    alignItems: "center", justifyContent: "center",
    marginRight: 14,
  },
  menuTextWrap: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    flex: 1,
    ...(Platform.OS === "android" && { fontFamily: "sans-serif-medium" }),
  },
  menuSub: {
    fontSize: 15,
    fontWeight: "500",
    color: "#666",
    marginTop: 3,
  },

  /* ── Bouton Déconnexion ── */
  logoutBtn: {
    backgroundColor: "#FDECEC",
    borderRadius: 14, paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#F5D5D5",
  },
  logoutTxt: {
    color: "#C0392B",
    fontWeight: "800",
    fontSize: 18,
    marginLeft: 10,
  },
});
