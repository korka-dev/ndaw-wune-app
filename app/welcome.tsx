import React, { useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated, Easing,
} from "react-native";
import { useRouter } from "expo-router";
import { rs, rf } from "../src/utils/responsive";
import { C } from "../src/utils/theme";
import AredLogo from "../src/components/AredLogo";

export default function WelcomeScreen() {
  const router = useRouter();

  /* ── Animations logo + textes ── */
  const logoScale  = useRef(new Animated.Value(0.5)).current;
  const logoOp     = useRef(new Animated.Value(0)).current;
  const titleTY    = useRef(new Animated.Value(30)).current;
  const titleOp    = useRef(new Animated.Value(0)).current;
  const subTY      = useRef(new Animated.Value(20)).current;
  const subOp      = useRef(new Animated.Value(0)).current;
  const btnTY      = useRef(new Animated.Value(24)).current;
  const btnOp      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    /* Séquence d'entrée : logo → titre → sous-titre → bouton */
    Animated.sequence([
      /* Logo : spring après 100ms */
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 55, friction: 6, useNativeDriver: true }),
        Animated.timing(logoOp,   { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      /* Titre */
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(titleTY, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(titleOp, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
      /* Sous-titre */
      Animated.delay(60),
      Animated.parallel([
        Animated.timing(subTY, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(subOp, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]),
      /* Bouton */
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(btnTY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(btnOp, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

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
            onPress={() => router.push("/login")}
            activeOpacity={0.85}
          >
            <Text style={s.btnTxt}>Se connecter</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  safe:   { flex: 1 },

  /* Corps */
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

  /* Pied de page */
  footer: {
    paddingHorizontal: rs(24),
    paddingBottom: rs(40),
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
});
