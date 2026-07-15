import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, ScrollView, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";

type Page = {
  icon: keyof typeof Feather.glyphMap;
  color: string;
  colorSoft: string;
  title: string;
  desc: string;
};

const TEACHER_PAGES: Page[] = [
  {
    icon: "home",
    color: C.primary,
    colorSoft: C.primarySoft,
    title: "Accueil",
    desc: "Votre planning du jour : séances, horaires et classes. Démarrez et terminez chaque activité depuis cet écran.",
  },
  {
    icon: "send",
    color: C.brand,
    colorSoft: C.brandSoft,
    title: "Rapports",
    desc: "Envoyez votre rapport journalier après chaque séance et consultez l'historique de vos envois.",
  },
  {
    icon: "award",
    color: C.success,
    colorSoft: C.successSoft,
    title: "Évaluations",
    desc: "Consultez les résultats de vos élèves aux évaluations ASER en lecture et en calcul.",
  },
  {
    icon: "book-open",
    color: C.warn,
    colorSoft: C.warnSoft,
    title: "Ressources",
    desc: "Accédez à tous vos supports de cours et documents pédagogiques ARED, téléchargeables hors-ligne.",
  },
  {
    icon: "user",
    color: C.textMuted,
    colorSoft: C.surfaceAlt,
    title: "Profil",
    desc: "Vos informations personnelles, le statut de connexion et la déconnexion.",
  },
];

const SUPERVISOR_PAGES: Page[] = [
  {
    icon: "home",
    color: C.primary,
    colorSoft: C.primarySoft,
    title: "Accueil — Présences",
    desc: "Pointez les présences de vos enseignants chaque jour. Confirmez la liste une fois tout le monde pointé.",
  },
  {
    icon: "list",
    color: C.brand,
    colorSoft: C.brandSoft,
    title: "Évaluation",
    desc: "Faites passer les tests ASER aux élèves et enregistrez leurs résultats directement depuis votre téléphone.",
  },
  {
    icon: "alert-triangle",
    color: C.warn,
    colorSoft: C.warnSoft,
    title: "Difficultés",
    desc: "Consultez les difficultés signalées par vos enseignants dans leurs rapports, filtrées par enseignant.",
  },
  {
    icon: "send",
    color: C.success,
    colorSoft: C.successSoft,
    title: "Rapports",
    desc: "Envoyez vos rapports de supervision et suivez l'historique de vos envois.",
  },
  {
    icon: "user",
    color: C.textMuted,
    colorSoft: C.surfaceAlt,
    title: "Profil",
    desc: "Vos informations personnelles, le statut de connexion et la déconnexion.",
  },
];

/* ── Ouverture manuelle (depuis le profil) ──────────────────── */
type Listener = () => void;
const listeners = new Set<Listener>();

export function openAppGuide() {
  listeners.forEach(l => l());
}

/* ── Composant ───────────────────────────────────────────────── */
interface Props {
  role: "enseignant" | "superviseur";
}

const STORAGE_KEY_PREFIX = "app_guide_done_";

export default function AppGuide({ role }: Props) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const slideY = useRef(new Animated.Value(60)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const pages = role === "superviseur" ? SUPERVISOR_PAGES : TEACHER_PAGES;
  const accent = role === "superviseur" ? C.brand : C.primary;
  const storageKey = STORAGE_KEY_PREFIX + role;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await AsyncStorage.getItem(storageKey);
      if (!done && !cancelled) {
        setTimeout(() => { if (!cancelled) open(); }, 600);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const l: Listener = () => open();
    listeners.add(l);
    return () => { listeners.delete(l); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open() {
    setVisible(true);
    slideY.setValue(60);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  }

  async function close() {
    await AsyncStorage.setItem(storageKey, "1");
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 60, duration: 180, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  }

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={close}>
      <Animated.View style={[s.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} activeOpacity={1} />

        <Animated.View
          style={[
            s.sheet,
            { paddingBottom: Math.max(insets.bottom, rs(16)) + rs(8) },
            { transform: [{ translateY: slideY }] },
          ]}
        >
          {/* En-tête */}
          <View style={s.header}>
            <View style={[s.headerIcon, { backgroundColor: accent + "1A" }]}>
              <Feather name="map" size={rf(20)} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>Guide de l'application</Text>
              <Text style={s.headerSub}>Ce que vous trouverez dans chaque page</Text>
            </View>
            <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={rf(20)} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={s.divider} />

          {/* Liste des pages */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={s.list}
          >
            {pages.map((page, i) => (
              <View key={i} style={s.card}>
                <View style={[s.cardIcon, { backgroundColor: page.colorSoft }]}>
                  <Feather name={page.icon} size={rf(22)} color={page.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>{page.title}</Text>
                  <Text style={s.cardDesc}>{page.desc}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={[s.closeBtn, { backgroundColor: accent }]} onPress={close} activeOpacity={0.85}>
            <Text style={s.closeBtnTxt}>Compris !</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,12,5,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    paddingTop: rs(20),
    paddingHorizontal: rs(20),
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: rs(12),
    marginBottom: rs(14),
  },
  headerIcon: {
    width: rs(42),
    height: rs(42),
    borderRadius: rs(12),
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: rf(17),
    fontWeight: "800",
    color: C.text,
  },
  headerSub: {
    fontSize: rf(12),
    color: C.textMuted,
    marginTop: rs(2),
  },

  divider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: rs(14),
  },

  list: {
    gap: rs(10),
    paddingBottom: rs(16),
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(14),
    backgroundColor: C.bg,
    borderRadius: rs(14),
    padding: rs(14),
    borderWidth: 1,
    borderColor: C.border,
  },
  cardIcon: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(12),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: rf(14),
    fontWeight: "700",
    color: C.text,
    marginBottom: rs(3),
  },
  cardDesc: {
    fontSize: rf(12.5),
    color: C.textMuted,
    lineHeight: rf(18),
  },

  closeBtn: {
    borderRadius: rs(14),
    paddingVertical: rs(15),
    alignItems: "center",
    marginTop: rs(6),
  },
  closeBtnTxt: {
    color: "#fff",
    fontSize: rf(15),
    fontWeight: "700",
  },
});
