/**
 * ProfileSheet — Bottom sheet profil enseignant.
 * Ouvert depuis l'avatar dans AppHeader.
 */
import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, Switch, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useStore } from "../store/useStore";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase();
}

export default function ProfileSheet({ visible, onClose }: Props) {
  const { user, syncData, logout } = useStore();
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);

  if (!user) return null;

  const ini       = initials(user.name);
  const school    = syncData?.school?.name ?? "—";
  const classe    = user.classes?.join(", ") ?? "—";
  const phone     = user.phone ?? "—";
  const langue    = user.langue_enseignement ?? "Wolof";
  const nbEleves  = syncData?.stats?.nb_eleves  ?? 0;
  const nbTests   = syncData?.stats?.nb_tests   ?? 0;
  const nbFiches  = syncData?.stats?.nb_fiches  ?? 0;

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter", style: "destructive",
        onPress: async () => {
          onClose();
          await logout();
          router.replace("/welcome");
        },
      },
    ]);
  };

  const menuItems = [
    { icon: "👤", label: "Mes informations", sub: null, action: null },
    { icon: "📦", label: "Ma classe",         sub: classe ? `${classe}` : null, action: null },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {/* Fond semi-transparent */}
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={() => {}}>
          {/* Handle */}
          <View style={s.handle} />

          <ScrollView showsVerticalScrollIndicator={false}>
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
              <TouchableOpacity style={[s.menuRow, s.menuBorder]} activeOpacity={0.65}>
                <View style={s.menuIcon}><Text style={s.menuIconTxt}>👤</Text></View>
                <Text style={s.menuLabel}>Mes informations</Text>
              </TouchableOpacity>

              {/* Ma classe */}
              <TouchableOpacity style={[s.menuRow, s.menuBorder]} activeOpacity={0.65}>
                <View style={s.menuIcon}><Text style={s.menuIconTxt}>📦</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.menuLabel}>Ma classe</Text>
                  {nbEleves > 0 && <Text style={s.menuSub}>{nbEleves} élèves</Text>}
                </View>
              </TouchableOpacity>

              {/* Langue d'enseignement */}
              <View style={[s.menuRow, s.menuBorder]}>
                <View style={s.menuIcon}><Text style={s.menuIconTxt}>🌐</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.menuLabel}>Langue d'enseignement</Text>
                  <Text style={s.menuSub}>{langue}</Text>
                </View>
                <TouchableOpacity style={s.changerBtn} activeOpacity={0.75}>
                  <Text style={s.changerTxt}>Changer</Text>
                </TouchableOpacity>
              </View>

              {/* Mode sombre */}
              <View style={[s.menuRow, s.menuBorder]}>
                <View style={s.menuIcon}><Text style={s.menuIconTxt}>🌙</Text></View>
                <Text style={[s.menuLabel, { flex: 1 }]}>Mode sombre</Text>
                <Switch
                  value={darkMode}
                  onValueChange={setDarkMode}
                  trackColor={{ false: C.border, true: C.brand }}
                  thumbColor="#fff"
                />
              </View>

              {/* Aide */}
              <TouchableOpacity style={s.menuRow} activeOpacity={0.65}>
                <View style={s.menuIcon}><Text style={s.menuIconTxt}>📄</Text></View>
                <Text style={s.menuLabel}>Aide et tutoriels</Text>
              </TouchableOpacity>
            </View>

            {/* ── Déconnexion ── */}
            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
              <Text style={s.logoutTxt}>Se déconnecter</Text>
            </TouchableOpacity>

            <View style={{ height: rs(24) }} />
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: rs(28),
    borderTopRightRadius: rs(28),
    paddingTop: rs(12),
    paddingHorizontal: rs(16),
    maxHeight: "90%",
  },
  handle: {
    width: rs(40), height: rs(4), borderRadius: rs(2),
    backgroundColor: C.border, alignSelf: "center", marginBottom: rs(20),
  },

  /* Carte utilisateur dorée */
  userCard: {
    backgroundColor: C.brand,
    borderRadius: rs(18),
    padding: rs(18),
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rs(14),
  },
  userAvatar: {
    width: rs(52), height: rs(52), borderRadius: rs(26),
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
    marginRight: rs(14),
  },
  userAvatarTxt: { color: "#fff", fontWeight: "700", fontSize: rf(20) },
  userName:      { color: "#fff", fontWeight: "700", fontSize: rf(17), marginBottom: rs(2) },
  userMeta:      { color: "rgba(255,255,255,0.82)", fontSize: rf(13) },
  userPhone:     { color: "rgba(255,255,255,0.72)", fontSize: rf(13), marginTop: rs(2) },

  /* Stats */
  statsRow: { flexDirection: "row", marginBottom: rs(14) },
  statCard: {
    flex: 1, backgroundColor: C.surfaceAlt,
    borderRadius: rs(14), padding: rs(12),
    alignItems: "center", marginHorizontal: rs(3),
  },
  statVal:   { fontSize: rf(22), fontWeight: "800", color: C.text },
  statLabel: { fontSize: rf(12), color: C.textMuted, marginTop: rs(2) },

  /* Menu */
  menuCard: {
    backgroundColor: C.surface,
    borderRadius: rs(18),
    borderWidth: 1, borderColor: C.border,
    overflow: "hidden",
    marginBottom: rs(14),
  },
  menuRow:   {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: rs(16), paddingVertical: rs(14),
  },
  menuBorder:{ borderBottomWidth: 1, borderBottomColor: C.border },
  menuIcon:  {
    width: rs(36), height: rs(36), borderRadius: rs(10),
    backgroundColor: C.brandSoft,
    alignItems: "center", justifyContent: "center",
    marginRight: rs(12),
  },
  menuIconTxt:  { fontSize: rf(17) },
  menuLabel:    { fontSize: rf(15), fontWeight: "600", color: C.text },
  menuSub:      { fontSize: rf(12), color: C.textMuted, marginTop: rs(1) },

  changerBtn: {
    borderWidth: 1.5, borderColor: C.brand,
    borderRadius: rs(10), paddingHorizontal: rs(12), paddingVertical: rs(5),
  },
  changerTxt: { fontSize: rf(13), fontWeight: "700", color: C.brand },

  /* Déconnexion */
  logoutBtn: {
    backgroundColor: C.dangerSoft,
    borderRadius: rs(16), paddingVertical: rs(16),
    alignItems: "center",
  },
  logoutTxt: { color: C.danger, fontWeight: "700", fontSize: rf(16) },
});
