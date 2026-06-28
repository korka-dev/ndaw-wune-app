import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated, Easing, Modal, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { rs, rf } from "../src/utils/responsive";
import { C } from "../src/utils/theme";
import AredLogo from "../src/components/AredLogo";
import { setupNotifications, getNotificationPermissionStatus } from "../src/services/notifications";

const NOTIF_PERM_KEY = "notif_permission_asked";

export default function WelcomeScreen() {
  const router = useRouter();
  const [showPermModal, setShowPermModal] = useState(false);
  const [permLoading,   setPermLoading]   = useState(false);

  /* ── Animations logo + textes ── */
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOp    = useRef(new Animated.Value(0)).current;
  const titleTY   = useRef(new Animated.Value(30)).current;
  const titleOp   = useRef(new Animated.Value(0)).current;
  const subTY     = useRef(new Animated.Value(20)).current;
  const subOp     = useRef(new Animated.Value(0)).current;
  const btnTY     = useRef(new Animated.Value(24)).current;
  const btnOp     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    /* Séquence d'entrée : logo → titre → sous-titre → bouton */
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 55, friction: 6, useNativeDriver: true }),
        Animated.timing(logoOp,   { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(titleTY, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(titleOp, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
      Animated.delay(60),
      Animated.parallel([
        Animated.timing(subTY, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(subOp, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]),
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(btnTY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(btnOp, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(() => {
      // Après l'animation : vérifier si on a déjà demandé la permission
      checkAndPromptPermission();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Affiche le modal de permission si :
   *   • jamais demandé (première entrée)
   *   • ET permission pas encore accordée
   */
  async function checkAndPromptPermission() {
    const alreadyAsked = await AsyncStorage.getItem(NOTIF_PERM_KEY);
    if (alreadyAsked) return; // Déjà traité — ne plus afficher

    const status = await getNotificationPermissionStatus();
    if (status === "granted") {
      // Permission déjà accordée (rare au premier lancement, possible après réinstall)
      await AsyncStorage.setItem(NOTIF_PERM_KEY, "granted");
      return;
    }

    // Première fois, permission non accordée → afficher le modal explicatif
    setShowPermModal(true);
  }

  /** L'utilisateur tape "Autoriser" */
  async function handleAllow() {
    setPermLoading(true);
    try {
      const granted = await setupNotifications();
      await AsyncStorage.setItem(NOTIF_PERM_KEY, granted ? "granted" : "denied");
    } catch {
      await AsyncStorage.setItem(NOTIF_PERM_KEY, "error");
    } finally {
      setPermLoading(false);
      setShowPermModal(false);
    }
  }

  /** L'utilisateur tape "Pas maintenant" */
  async function handleSkip() {
    await AsyncStorage.setItem(NOTIF_PERM_KEY, "skipped");
    setShowPermModal(false);
  }

  return (
    <View style={s.screen}>
      <SafeAreaView style={s.safe}>
        {/* ── Corps centré ── */}
        <View style={s.body}>

          {/* Logo animé */}
          <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOp }}>
            <AredLogo size={120} />
          </Animated.View>

          {/* Titre */}
          <Animated.Text style={[s.title, { opacity: titleOp, transform: [{ translateY: titleTY }] }]}>
            Ndaw Wune
          </Animated.Text>

          {/* Sous-titre */}
          <Animated.Text style={[s.subtitle, { opacity: subOp, transform: [{ translateY: subTY }] }]}>
            L'application des enseignants{"\n"}du programme ARED
          </Animated.Text>
        </View>

        {/* ── Bouton bas de page ── */}
        <Animated.View style={[s.footer, { opacity: btnOp, transform: [{ translateY: btnTY }] }]}>
          <TouchableOpacity
            style={s.btn}
            onPress={() => router.push("/user-type")}
            activeOpacity={0.85}
          >
            <Text style={s.btnTxt}>Commencer</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      {/* ══════════════════════════════════════════════
          Modal permission notifications (1ère fois)
          ══════════════════════════════════════════════ */}
      <Modal
        visible={showPermModal}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={s.overlay}>
          <Animated.View style={s.card}>

            {/* Icône cloche */}
            <View style={s.iconBg}>
              <Text style={s.iconEmoji}>🔔</Text>
            </View>

            {/* Titre */}
            <Text style={s.cardTitle}>Activer les notifications</Text>

            {/* Description */}
            <Text style={s.cardDesc}>
              Pour ne jamais manquer une séance, Ndaw Wune vous enverra des{" "}
              <Text style={s.cardDescBold}>alertes vocales</Text> :
            </Text>

            {/* Points */}
            <View style={s.pointsBox}>
              <View style={s.point}>
                <View style={[s.dot, { backgroundColor: "#f59e0b" }]} />
                <Text style={s.pointTxt}>
                  <Text style={s.pointBold}>30 minutes avant</Text> — « Êtes-vous prêt ? Votre programme commence bientôt »
                </Text>
              </View>
              <View style={s.point}>
                <View style={[s.dot, { backgroundColor: C.primary }]} />
                <Text style={s.pointTxt}>
                  <Text style={s.pointBold}>5 minutes avant</Text> — « Votre cours commence dans 5 minutes ! »
                </Text>
              </View>
            </View>

            <Text style={s.cardNote}>
              Ces alertes fonctionnent même si votre téléphone est verrouillé.
            </Text>

            {/* Boutons */}
            <TouchableOpacity
              style={[s.allowBtn, permLoading && { opacity: 0.7 }]}
              onPress={handleAllow}
              disabled={permLoading}
              activeOpacity={0.85}
            >
              <Text style={s.allowTxt}>
                {permLoading ? "Autorisation en cours…" : "🔔  Autoriser les notifications"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.skipBtn}
              onPress={handleSkip}
              activeOpacity={0.7}
            >
              <Text style={s.skipTxt}>Pas maintenant</Text>
            </TouchableOpacity>

          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  safe:   { flex: 1 },

  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: rs(32),
    paddingBottom: rs(20),
  },

  title: {
    marginTop: rs(28),
    fontSize: rf(36),
    fontWeight: "800",
    color: C.text,
    letterSpacing: 0.5,
  },
  subtitle: {
    marginTop: rs(12),
    fontSize: rf(15),
    color: C.textMuted,
    textAlign: "center",
    lineHeight: rf(23),
  },

  footer: {
    paddingHorizontal: rs(24),
    paddingBottom: rs(140),
  },
  btn: {
    backgroundColor: C.primary,
    borderRadius: rs(16),
    paddingVertical: rs(17),
    alignItems: "center",
    shadowColor: C.primary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  btnTxt: {
    color: "#fff",
    fontSize: rf(16),
    fontWeight: "700",
    letterSpacing: 0.4,
  },

  /* ── Modal ── */
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",       // bottom sheet feel
    paddingHorizontal: rs(16),
    paddingBottom: Platform.OS === "ios" ? rs(36) : rs(24),
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: rs(24),
    padding: rs(24),
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },

  iconBg: {
    width: rs(72),
    height: rs(72),
    borderRadius: rs(36),
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: rs(16),
  },
  iconEmoji: { fontSize: rf(34) },

  cardTitle: {
    fontSize: rf(20),
    fontWeight: "800",
    color: C.text,
    marginBottom: rs(10),
    textAlign: "center",
  },
  cardDesc: {
    fontSize: rf(14),
    color: C.textMuted,
    textAlign: "center",
    lineHeight: rf(21),
    marginBottom: rs(16),
  },
  cardDescBold: {
    fontWeight: "700",
    color: C.text,
  },

  pointsBox: {
    alignSelf: "stretch",
    gap: rs(10),
    marginBottom: rs(14),
  },
  point: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: rs(10),
  },
  dot: {
    width: rs(8),
    height: rs(8),
    borderRadius: rs(4),
    marginTop: rs(5),
    flexShrink: 0,
  },
  pointTxt: {
    flex: 1,
    fontSize: rf(13),
    color: C.textMuted,
    lineHeight: rf(19),
  },
  pointBold: {
    fontWeight: "700",
    color: C.text,
  },

  cardNote: {
    fontSize: rf(12),
    color: C.textMuted,
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: rs(22),
    opacity: 0.8,
  },

  allowBtn: {
    alignSelf: "stretch",
    backgroundColor: C.primary,
    borderRadius: rs(14),
    paddingVertical: rs(15),
    alignItems: "center",
    shadowColor: C.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    marginBottom: rs(10),
  },
  allowTxt: {
    color: "#fff",
    fontSize: rf(15),
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  skipBtn: {
    paddingVertical: rs(10),
    paddingHorizontal: rs(24),
  },
  skipTxt: {
    fontSize: rf(13),
    color: C.textMuted,
    textAlign: "center",
  },
});
