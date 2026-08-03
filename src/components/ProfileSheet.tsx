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
  ScrollView, Alert, Platform, useWindowDimensions, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import RemplacementSheet from "./RemplacementSheet";
import Constants from "expo-constants";
import { useStore } from "../store/useStore";
import { openAppGuide } from "./AppGuide";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

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

function cap(v?: string | null): string {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : "—";
}

export default function ProfileSheet({ visible, onClose }: Props) {
  const { user, syncData, isOnline, syncOffline, logout } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [remplacementOpen, setRemplacementOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? "—";

  if (!user) return null;

  const isEnseignant = user.role === "enseignant";

  const ini      = initials(user.name);
  const school   = syncData?.school;
  const classe   = user.classes?.join(", ") ?? "—";
  const phone    = user.phone ?? "—";
  const nbEleves = syncData?.stats?.nb_eleves ?? syncData?.eleves?.length ?? 0;

  const schoolLieu = [school?.city, school?.region].filter(Boolean).join(", ");

  const handleRefresh = async () => {
    if (!isOnline) {
      Alert.alert("Hors-ligne", "Impossible d'actualiser sans connexion Internet.");
      return;
    }
    setRefreshing(true);
    try { await syncOffline(true); } finally { setRefreshing(false); }
  };

  const handleCheckForUpdate = async () => {
    if (!Updates.isEnabled) {
      Alert.alert("Indisponible", "Les mises à jour ne sont pas disponibles dans cette version de développement.");
      return;
    }
    setCheckingUpdate(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert("À jour", "Vous utilisez déjà la dernière version de l'application.");
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert(
        "Mise à jour disponible",
        "Une nouvelle version a été téléchargée. Redémarrer l'application maintenant ?",
        [
          { text: "Plus tard", style: "cancel" },
          { text: "Redémarrer", onPress: () => Updates.reloadAsync() },
        ]
      );
    } catch (e) {
      // Ne JAMAIS attribuer l'échec à la connexion sans le savoir : la plupart
      // des erreurs ici sont des problèmes de configuration côté serveur de
      // mises à jour (canal non relié à une branche, runtime incompatible…),
      // et le message trompeur envoie chercher un problème réseau inexistant.
      const detail = e instanceof Error ? e.message : String(e);
      Alert.alert(
        "Mise à jour indisponible",
        `La vérification a échoué.\n\nDétail : ${detail}\n\nSi votre connexion fonctionne, transmettez ce message à l'administrateur.`,
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Se déconnecter",
        style: "destructive",
        onPress: async () => {
          onClose();
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const infoRows: { icon: keyof typeof Feather.glyphMap; label: string; value: string }[] = [
    { icon: "home",      label: "École",   value: school?.name ? `${school.name}${schoolLieu ? ` · ${schoolLieu}` : ""}` : "—" },
    ...(isEnseignant ? [{ icon: "book-open" as const, label: "Classe", value: classe }] : []),
    { icon: "globe",     label: "Langue d'enseignement", value: cap(school?.langue) },
  ];

  return (
    <>
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
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, rs(20)), maxHeight: screenH * 0.85 }]}>

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
                  {school?.name ?? "—"}{isEnseignant && classe !== "—" ? ` · ${classe}` : ""}
                </Text>
                <Text style={s.userPhone}>{phone}</Text>
              </View>
            </View>

            {/* Stats */}
            {isEnseignant && (
              <View style={s.statsRow}>
                <View style={s.statCard}>
                  <Text style={s.statVal}>{nbEleves}</Text>
                  <Text style={s.statLabel}>Élèves</Text>
                </View>
              </View>
            )}

            {/* ── Informations ── */}
            <View style={s.menuCard}>
              {infoRows.map(({ icon, label, value }, i) => (
                <View key={label} style={[s.menuRow, i < infoRows.length - 1 && s.menuBorder]}>
                  <View style={s.menuIconBox}>
                    <Feather name={icon} size={rf(22)} color={C.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.menuLabel}>{label}</Text>
                    <Text style={s.menuSub}>{value}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Remplacement d'élève — tuteurs uniquement ── */}
            {isEnseignant && (
              <View style={s.menuCard}>
                <TouchableOpacity
                  style={s.menuRow}
                  activeOpacity={0.6}
                  onPress={() => {
                    // Android n'affiche qu'une Modal à la fois : il faut fermer
                    // celle du profil AVANT d'ouvrir celle du remplacement,
                    // sinon la seconde ne s'affiche jamais. Le délai laisse
                    // l'animation de fermeture se terminer.
                    onClose();
                    setTimeout(() => setRemplacementOpen(true), 320);
                  }}
                >
                  <View style={s.menuIconBox}>
                    <Feather name="repeat" size={rf(22)} color={C.brand} />
                  </View>
                  <Text style={s.menuLabel}>Remplacer un élève</Text>
                  <Feather name="chevron-right" size={rf(20)} color="#AAA" />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Aide ── */}
            <View style={s.menuCard}>
              <TouchableOpacity
                style={s.menuRow}
                activeOpacity={0.6}
                onPress={() => { onClose(); openAppGuide(); }}
              >
                <View style={s.menuIconBox}>
                  <Feather name="help-circle" size={rf(22)} color={C.brand} />
                </View>
                <Text style={s.menuLabel}>Aide et tutoriels</Text>
                <Feather name="chevron-right" size={rf(20)} color="#AAA" />
              </TouchableOpacity>
            </View>

            {/* ── Bouton actualiser ── */}
            <TouchableOpacity
              style={s.refreshBtn}
              onPress={handleRefresh}
              disabled={refreshing}
              activeOpacity={0.7}
            >
              {refreshing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.refreshTxt}>Actualiser les données</Text>}
            </TouchableOpacity>

            {/* ── Bouton mise à jour ── */}
            <TouchableOpacity
              style={s.updateBtn}
              onPress={handleCheckForUpdate}
              disabled={checkingUpdate}
              activeOpacity={0.7}
            >
              {checkingUpdate
                ? <ActivityIndicator size="small" color={C.brand} />
                : <Text style={s.updateTxt}>Vérifier les mises à jour · v{appVersion}</Text>}
            </TouchableOpacity>

            {/* ── Bouton Déconnexion ── */}
            <TouchableOpacity
              style={s.logoutBtn}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Feather name="log-out" size={rf(20)} color="#C0392B" />
              <Text style={s.logoutTxt}>Se déconnecter</Text>
            </TouchableOpacity>

            {/* Marge basse pour scroll confortable */}
            <View style={{ height: rs(30) }} />
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* Feuille de remplacement — rendue en frère du Modal du profil, jamais
        en même temps que lui (voir le onPress du bouton). */}
    <RemplacementSheet
      visible={remplacementOpen}
      onClose={() => setRemplacementOpen(false)}
    />
    </>
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
    flex: 1,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
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
    paddingTop: rs(14),
    paddingBottom: rs(6),
  },
  handle: {
    width: rs(44), height: rs(5), borderRadius: rs(3),
    backgroundColor: "#CCC",
  },

  /* ── ScrollView ── */
  scrollContent: {
    paddingHorizontal: rs(18),
    paddingTop: rs(8),
  },

  /* ── Carte utilisateur ── */
  userCard: {
    backgroundColor: C.brand,
    borderRadius: rs(16),
    padding: rs(18),
    flexDirection: "row",
    alignItems: "center",
    marginBottom: rs(10),
  },
  userAvatar: {
    width: rs(56), height: rs(56), borderRadius: rs(28),
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center", justifyContent: "center",
    marginRight: rs(14),
  },
  userAvatarTxt: { color: "#fff", fontWeight: "800", fontSize: rf(24) },
  userName:      { color: "#fff", fontWeight: "800", fontSize: rf(21), marginBottom: rs(3) },
  userMeta:      { color: "rgba(255,255,255,0.92)", fontSize: rf(16), fontWeight: "600" },
  userPhone:     { color: "rgba(255,255,255,0.85)", fontSize: rf(15), marginTop: rs(2), fontWeight: "500" },

  /* ── Stats ── */
  statsRow: { flexDirection: "row", marginBottom: rs(14), gap: rs(8) },
  statCard: {
    flex: 1, backgroundColor: "#F5F0E4",
    borderRadius: rs(14), paddingVertical: rs(14), alignItems: "center",
  },
  statVal:   { fontSize: rf(26), fontWeight: "900", color: "#1A1A1A" },
  statLabel: { fontSize: rf(14), fontWeight: "600", color: "#555", marginTop: rs(3) },

  /* ── Menu ── */
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: rs(16),
    borderWidth: 1.5, borderColor: "#E8E0CC",
    marginBottom: rs(14),
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: rs(16), paddingVertical: rs(14),
    minHeight: rs(60),
  },
  menuBorder: {
    borderBottomWidth: 1, borderBottomColor: "#F0EBE0",
  },
  menuIconBox: {
    width: rs(46), height: rs(46), borderRadius: rs(12),
    backgroundColor: "#F5EDDA",
    alignItems: "center", justifyContent: "center",
    marginRight: rs(14),
  },
  menuLabel: {
    fontSize: rf(16), fontWeight: "700", color: "#1A1A1A", flex: 1,
    ...(IS_ANDROID && { fontFamily: "sans-serif-medium" }),
  },
  menuSub: {
    fontSize: rf(15), fontWeight: "500", color: "#666", marginTop: rs(3),
  },

  /* ── Actualiser ── */
  refreshBtn: {
    backgroundColor: C.brand,
    borderRadius: rs(14), paddingVertical: rs(14),
    alignItems: "center", justifyContent: "center", marginBottom: rs(12),
    minHeight: rs(48),
  },
  refreshTxt: { color: "#fff", fontWeight: "700", fontSize: rf(15) },

  /* ── Mise à jour ── */
  updateBtn: {
    backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#E8E0CC",
    borderRadius: rs(14), paddingVertical: rs(14),
    alignItems: "center", justifyContent: "center", marginBottom: rs(12),
  },
  updateTxt: { color: C.brand, fontWeight: "700", fontSize: rf(15) },

  /* ── Déconnexion ── */
  logoutBtn: {
    backgroundColor: "#FDECEC",
    borderRadius: rs(14), paddingVertical: rs(18),
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#F5D5D5",
  },
  logoutTxt: {
    color: "#C0392B", fontWeight: "800", fontSize: rf(18), marginLeft: rs(10),
  },
});
