/**
 * Page Profil — écran plein accessible depuis le tab (href: null).
 * Affiche les données synchronisées depuis le serveur (profil, école,
 * session, stats) avec rafraîchissement par tirage vers le bas.
 */
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Alert,
  TouchableOpacity, Platform, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useStore } from "../../src/store/useStore";
import { openAppGuide } from "../../src/components/AppGuide";
import { rs, rf } from "../../src/utils/responsive";
import { C } from "../../src/utils/theme";

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function cap(v?: string | null): string {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : "—";
}

export default function ProfileScreen() {
  const { user, syncData, lastSync, isOnline, syncOffline, logout } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  if (!user) return null;

  const ini = initials(user.name);
  const school = syncData?.school;
  const classe = user.classes?.join(", ") ?? "—";
  const phone = user.phone ?? "—";
  const nbEleves = syncData?.stats?.nb_eleves ?? syncData?.eleves?.length ?? 0;
  const nbTests = syncData?.stats?.nb_tests ?? 0;
  const nbFiches = syncData?.stats?.nb_fiches ?? 0;
  const appVersion = Constants.expoConfig?.version ?? "—";

  const schoolLieu = [school?.city, school?.region].filter(Boolean).join(", ");
  const syncLabel = lastSync
    ? new Date(lastSync).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

  const handleRefresh = async () => {
    if (!isOnline) {
      Alert.alert("Hors-ligne", "Impossible d'actualiser sans connexion Internet.");
      return;
    }
    setRefreshing(true);
    try { await syncOffline(true); } finally { setRefreshing(false); }
  };

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

  const infoRows: { icon: keyof typeof Feather.glyphMap; label: string; value: string }[] = [
    { icon: "briefcase", label: "Rôle",   value: cap(user.role) },
    { icon: "phone",     label: "Téléphone", value: phone },
    { icon: "home",      label: "École",  value: school?.name ? `${school.name}${schoolLieu ? ` · ${schoolLieu}` : ""}` : "—" },
    { icon: "book-open", label: "Classe", value: classe },
    { icon: "globe",     label: "Langue d'enseignement", value: cap(school?.langue) },
    { icon: "calendar",  label: "Session", value: syncData?.active_session?.name ?? "Aucune session active" },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top + rs(16) }]}>
      <Text style={s.screenTitle}>Mon Profil</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.brand} colors={[C.brand]} />
        }
      >
        {/* ── Carte utilisateur dorée ── */}
        <View style={s.userCard}>
          <View style={s.userAvatar}>
            <Text style={s.userAvatarTxt}>{ini}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{user.name}</Text>
            <Text style={s.userMeta}>{school?.name ?? "—"}{classe !== "—" ? ` · ${classe}` : ""}</Text>
            <Text style={s.userPhone}>{phone}</Text>
          </View>
        </View>

        {/* ── Statut réseau + dernière sync ── */}
        <View style={[s.syncBadge, isOnline ? s.syncOnline : s.syncOffline]}>
          <Text style={s.syncTxt}>
            {isOnline ? "🟢 En ligne" : "🔴 Hors-ligne"} · Dernière sync : {syncLabel}
          </Text>
        </View>

        {/* ── Stats ── */}
        <View style={s.statsRow}>
          {[
            { val: nbEleves, label: "Élèves" },
            { val: nbTests, label: "Tests" },
            { val: nbFiches, label: "Fiches" },
          ].map(({ val, label }) => (
            <View key={label} style={s.statCard}>
              <Text style={s.statVal}>{val}</Text>
              <Text style={s.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Informations ── */}
        <View style={s.menuCard}>
          {infoRows.map(({ icon, label, value }, i) => (
            <View key={label} style={[s.menuRow, i < infoRows.length - 1 && s.menuBorder]}>
              <View style={s.menuIconBox}>
                <Feather name={icon} size={22} color={C.brand} />
              </View>
              <View style={s.menuTextWrap}>
                <Text style={s.menuLabel}>{label}</Text>
                <Text style={s.menuSub}>{value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Aide ── */}
        <View style={s.menuCard}>
          <TouchableOpacity style={s.menuRow} activeOpacity={0.6} onPress={openAppGuide}>
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

        <Text style={s.versionTxt}>Version {appVersion}</Text>

        <View style={{ height: rs(40) }} />
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
    marginBottom: 12,
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

  /* ── Badge réseau / sync ── */
  syncBadge: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    alignItems: "center",
  },
  syncOnline: { backgroundColor: "#E8F5E9" },
  syncOffline: { backgroundColor: "#FFF3E0" },
  syncTxt: {
    fontSize: 14, fontWeight: "600", color: "#333",
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

  /* ── Cartes info / menu ── */
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5, borderColor: "#E8E0CC",
    marginBottom: 16,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 60,
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
    fontSize: 16,
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

  versionTxt: {
    textAlign: "center",
    fontSize: 13,
    color: "#999",
    marginTop: 16,
    fontWeight: "500",
  },
});
