import React from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { rs, rf } from "../src/utils/responsive";
import { C } from "../src/utils/theme";
import AredLogo from "../src/components/AredLogo";

export default function UserTypeScreen() {
  const router = useRouter();

  return (
    <View style={s.screen}>
      <SafeAreaView style={s.safe}>

        {/* ── Bouton retour ── */}
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={rf(20)} color={C.text} />
        </TouchableOpacity>

        {/* ── Logo en haut ── */}
        <View style={s.logoWrap}>
          <AredLogo size={90} />
          <Text style={s.appName}>Ndaw Wune</Text>
        </View>

        {/* ── Corps ── */}
        <View style={s.body}>
          <Text style={s.title}>Première connexion ?</Text>
          <Text style={s.subtitle}>
            Dites-nous si vous utilisez l'application pour la première fois.
          </Text>

          {/* ── Nouvel utilisateur ── */}
          <TouchableOpacity
            style={[s.card, s.cardPrimary]}
            onPress={() => router.push("/forgot-password")}
            activeOpacity={0.85}
          >
            <View style={[s.cardIconWrap, { backgroundColor: C.primarySoft }]}>
              <Feather name="user-plus" size={rf(24)} color={C.primary} />
            </View>
            <View style={s.cardText}>
              <Text style={[s.cardTitle, { color: C.primary }]}>Nouvel utilisateur</Text>
              <Text style={s.cardSub}>
                Initialisez votre mot de passe pour accéder à l'application
              </Text>
            </View>
            <Feather name="chevron-right" size={rf(18)} color={C.primary} />
          </TouchableOpacity>

          {/* ── Ancien utilisateur ── */}
          <TouchableOpacity
            style={[s.card, s.cardBrand]}
            onPress={() => router.push("/login")}
            activeOpacity={0.85}
          >
            <View style={[s.cardIconWrap, { backgroundColor: C.brandSoft }]}>
              <Feather name="log-in" size={rf(24)} color={C.brand} />
            </View>
            <View style={s.cardText}>
              <Text style={[s.cardTitle, { color: C.brand }]}>J'ai déjà un compte</Text>
              <Text style={s.cardSub}>
                Connectez-vous avec vos identifiants habituels
              </Text>
            </View>
            <Feather name="chevron-right" size={rf(18)} color={C.brand} />
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  safe:   { flex: 1 },

  backBtn: {
    marginTop: rs(12),
    marginLeft: rs(16),
    width: rs(40),
    height: rs(40),
    borderRadius: rs(12),
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  logoWrap: {
    alignItems: "center",
    marginTop: rs(28),
    marginBottom: rs(8),
    gap: rs(10),
  },
  appName: {
    fontSize: rf(22),
    fontWeight: "800",
    color: C.text,
    letterSpacing: 0.4,
  },

  body: {
    flex: 1,
    paddingHorizontal: rs(24),
    justifyContent: "center",
    paddingBottom: rs(60),
  },

  title: {
    fontSize: rf(24),
    fontWeight: "800",
    color: C.text,
    marginBottom: rs(8),
  },
  subtitle: {
    fontSize: rf(14),
    color: C.textMuted,
    lineHeight: rf(22),
    marginBottom: rs(32),
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: rs(18),
    borderWidth: 1.5,
    borderColor: C.border,
    padding: rs(18),
    flexDirection: "row",
    alignItems: "center",
    gap: rs(14),
    marginBottom: rs(14),
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardPrimary: {
    borderColor: C.primary + "55",
    backgroundColor: C.primarySoft + "55",
  },
  cardBrand: {
    borderColor: C.brand + "44",
    backgroundColor: C.brandSoft + "55",
  },

  cardIconWrap: {
    width: rs(52),
    height: rs(52),
    borderRadius: rs(14),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontSize: rf(16),
    fontWeight: "800",
    marginBottom: rs(4),
  },
  cardSub: {
    fontSize: rf(13),
    color: C.textMuted,
    lineHeight: rf(19),
  },
});
