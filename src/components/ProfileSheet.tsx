/**
 * ProfileSheet — Bottom sheet profil enseignant.
 * Ouvert depuis l'avatar dans AppHeader.
 *
 * Architecture simplifiée (zéro conflit de gestes) :
 *  - L'overlay (zone sombre en haut) et le sheet (zone blanche en bas)
 *    sont des FRÈRES dans le layout, pas imbriqués.
 *  - Pas de PanResponder → le ScrollView reçoit 100 % des gestes de scroll.
 *  - Fermeture : tap sur l'overlay OU bouton retour Android.
 */
import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, Switch, Alert, Platform, Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../store/useStore";
import { C } from "../utils/theme";

const SCREEN_H = Dimensions.get("window").height;

interface Props {
  visible: boolean;
  onClose: () => void;
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

export default function ProfileSheet({ visible, onClose }: Props) {
  const { user, syncData, logout } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [darkMode, setDarkMode] = useState(false);

  if (!user) return null;

  const ini      = initials(user.name);
  const school   = syncData?.school?.name ?? "—";
  const classe   = user.classes?.join(", ") ?? "—";
  const phone    = user.phone ?? "—";
  const langue   = user.langue_enseignement ?? "Wolof";
  const nbEleves = syncData?.stats?.nb_eleves ?? 0;
  const nbTests  = syncData?.stats?.nb_tests  ?? 0;
  const nbFiches = syncData?.stats?.nb_fiches ?? 0;

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter",
        style: "destructive",
        onPress: async () => {
          onClose();
          await logout();
          router.replace("/welcome");
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Conteneur plein écran avec fond sombre */}
      <View style={s.root}>

        {/* ── Zone overlay : tap pour fermer ── */}
        {/* C'est un frère du sheet, pas un parent → aucun conflit */}
        <TouchableOpacity
          style={s.overlay}
          onPress={onClose}
          activeOpacity={1}
        />

        {/* ── Sheet blanc en bas ── */}
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>

          {/* Barre handle visuelle */}
          <View style={s.handleArea}>
            <View style={s.handle} />
          </View>

          {/* ── Contenu scrollable — reçoit 100% des gestes ── */}
          <ScrollView
            showsVerticalScrollIndicator={true}
            bounces={false}
            overScrollMode="always"
            nestedScrollEnabled
            contentContainerStyle={s.scrollContent}
          >
            {/* Carte utilisateur */}
            <View style={s.userCard}>
              <View style={s.userAvatar}>
                <Text style={s.userAvatarTxt}>{ini}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.userName}>{user.name}</Text>
                <Text style={s.userMeta}>
                  {school}{classe ? ` · ${classe}` : ""}
                </Text>
                <Text style={s.userPhone}>{phone}</Text>
              </View>
            </View>

            {/* Stats */}
            <View style={s.statsRow}>
              {[
                { val: nbEleves, label: "Élèves" },
                { val: nbTests,  label: "Tests" },
                { val: nbFiches, label: "Fiches" },
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
                <Feather name="chevron-right" size={20} color="#AAA" />
              </TouchableOpacity>

              {/* Ma classe */}
              <TouchableOpacity style={[s.menuRow, s.menuBorder]} activeOpacity={0.6}>
                <View style={s.menuIconBox}>
                  <Feather name="users" size={22} color={C.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.menuLabel}>Ma classe</Text>
                  {nbEleves > 0 && (
                    <Text style={s.menuSub}>{nbEleves} élèves</Text>
                  )}
                </View>
                <Feather name="chevron-right" size={20} color="#AAA" />
              </TouchableOpacity>

              {/* Langue d'enseignement */}
              <TouchableOpacity style={[s.menuRow, s.menuBorder]} activeOpacity={0.6}>
                <View style={s.menuIconBox}>
                  <Feather name="globe" size={22} color={C.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.menuLabel}>Langue d'enseignement</Text>
                  <Text style={s.menuSub}>{langue}</Text>
                </View>
                <View style={s.changerBtn}>
                  <Text style={s.changerTxt}>Changer</Text>
                </View>
              </TouchableOpacity>

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

              {/* Aide */}
              <TouchableOpacity style={s.menuRow} activeOpacity={0.6}>
                <View style={s.menuIconBox}>
                  <Feather name="help-circle" size={22} color={C.brand} />
                </View>
                <Text style={s.menuLabel}>Aide et tutoriels</Text>
                <Feather name="chevron-right" size={20} color="#AAA" />
              </TouchableOpacity>
            </View>

            {/* ── Bouton Déconnexion ── */}
            <TouchableOpacity
              style={s.logoutBtn}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Feather name="log-out" size={20} color="#C0392B" />
              <Text style={s.logoutTxt}>Se déconnecter</Text>
            </TouchableOpacity>

            {/* Marge basse pour scroll confortable */}
            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════ */
const IS_ANDROID = Platform.OS === "android";

const s = StyleSheet.create({
  /* ── Layout racine ── */
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  overlay: {
    // Occupe tout l'espace au-dessus du sheet
    flex: 1,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Le sheet prend au max 85% de l'écran → le reste est l'overlay cliquable
    maxHeight: SCREEN_H * 0.85,
    ...(IS_ANDROID
      ? { elevation: 24 }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
        }),
  },

  /* ── Handle ── */
  handleArea: {
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 6,
  },
  handle: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: "#CCC",
  },

  /* ── ScrollView ── */
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },

  /* ── Carte utilisateur ── */
  userCard: {
    backgroundColor: C.brand,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  userAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center", justifyContent: "center",
    marginRight: 14,
  },
  userAvatarTxt: { color: "#fff", fontWeight: "800", fontSize: 24 },
  userName:      { color: "#fff", fontWeight: "800", fontSize: 21, marginBottom: 3 },
  userMeta:      { color: "rgba(255,255,255,0.92)", fontSize: 16, fontWeight: "600" },
  userPhone:     { color: "rgba(255,255,255,0.85)", fontSize: 15, marginTop: 2, fontWeight: "500" },

  /* ── Stats ── */
  statsRow: { flexDirection: "row", marginBottom: 14, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: "#F5F0E4",
    borderRadius: 14, paddingVertical: 14, alignItems: "center",
  },
  statVal:   { fontSize: 26, fontWeight: "900", color: "#1A1A1A" },
  statLabel: { fontSize: 14, fontWeight: "600", color: "#555", marginTop: 3 },

  /* ── Menu ── */
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5, borderColor: "#E8E0CC",
    marginBottom: 18,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 18,
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
  menuLabel: {
    fontSize: 18, fontWeight: "700", color: "#1A1A1A", flex: 1,
    ...(IS_ANDROID && { fontFamily: "sans-serif-medium" }),
  },
  menuSub: {
    fontSize: 15, fontWeight: "500", color: "#666", marginTop: 3,
  },
  changerBtn: {
    borderWidth: 2, borderColor: C.brand,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7,
  },
  changerTxt: { fontSize: 15, fontWeight: "800", color: C.brand },

  /* ── Déconnexion ── */
  logoutBtn: {
    backgroundColor: "#FDECEC",
    borderRadius: 14, paddingVertical: 18,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#F5D5D5",
  },
  logoutTxt: {
    color: "#C0392B", fontWeight: "800", fontSize: 18, marginLeft: 10,
  },
});
