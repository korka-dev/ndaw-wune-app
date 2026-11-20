/**
 * Écran Mot de passe oublié.
 *
 * La réinitialisation en libre-service est fermée (rapport V2, APP-01) : elle
 * changeait le mot de passe de n'importe quel compte à partir du seul numéro
 * de téléphone. Le tuteur ou le superviseur contacte désormais son superviseur
 * ou l'administrateur, qui lui attribue un mot de passe temporaire depuis le
 * dashboard (changement imposé à la connexion suivante).
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import AredLogo from "../components/AredLogo";
import BackButton from "../components/BackButton";

export default function ForgotPasswordScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <BackButton onPress={() => router.back()} style={{ alignSelf: "flex-start" }} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <AredLogo size={70} />
          <Text style={s.title}>Mot de passe oublié</Text>
          <Text style={s.subtitle}>
            Pour protéger vos données et celles des élèves, le mot de passe ne
            peut pas être réinitialisé depuis l'application.
          </Text>
        </View>

        <View style={s.card}>
          <View style={s.stepRow}>
            <Feather name="phone-call" size={rf(20)} color={C.primary} />
            <Text style={s.stepTxt}>
              Contactez votre superviseur ou l'administrateur du programme.
            </Text>
          </View>
          <View style={s.stepRow}>
            <Feather name="key" size={rf(20)} color={C.primary} />
            <Text style={s.stepTxt}>
              Il vous communiquera un mot de passe temporaire.
            </Text>
          </View>
          <View style={s.stepRow}>
            <Feather name="lock" size={rf(20)} color={C.primary} />
            <Text style={s.stepTxt}>
              À la connexion, l'application vous demandera d'en choisir un nouveau.
            </Text>
          </View>
        </View>

        <Text style={s.note}>
          Vos saisies non envoyées restent conservées sur ce téléphone en attendant.
        </Text>

        <TouchableOpacity
          style={s.btn}
          onPress={() => router.replace("/login")}
          activeOpacity={0.85}
        >
          <Text style={s.btnTxt}>Retour à la connexion</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },


  scroll: {
    flexGrow: 1,
    paddingHorizontal: rs(24),
    paddingBottom: rs(48),
  },

  /* En-tête */
  header:   { alignItems: "center", marginTop: rs(4), marginBottom: rs(32) },
  title:    { marginTop: rs(12), fontSize: rf(24), fontWeight: "800", color: C.text, textAlign: "center" },
  subtitle: { marginTop: rs(6), fontSize: rf(15), color: C.textMuted, textAlign: "center", lineHeight: rf(22) },

  /* Carte d'explication */
  card: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(16), padding: rs(18), gap: rs(14),
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: rs(12) },
  stepTxt: { flex: 1, fontSize: rf(16), color: C.text, lineHeight: rf(23) },
  note:    { marginTop: rs(16), fontSize: rf(14), color: C.textMuted, textAlign: "center" },

  /* Champs */
  fieldWrap: { marginBottom: rs(16) },
  label:     { fontSize: rf(16), fontWeight: "600", color: C.text, marginBottom: rs(8) },

  /* Téléphone */
  phoneRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, borderRadius: rs(14),
    overflow: "hidden",
  },
  countryPrefix: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: rs(14), paddingVertical: rs(14),
  },
  countryFlag: { fontSize: rf(18), marginRight: rs(6) },
  countryCode: { fontSize: rf(16), fontWeight: "600", color: C.text },
  separator:   { width: 1, height: rs(26), backgroundColor: C.border },
  phoneInput:  {
    flex: 1,
    paddingHorizontal: rs(14), paddingVertical: rs(14),
    fontSize: rf(18), color: C.text, letterSpacing: 1,
  },

  /* Mot de passe */
  pwdRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, borderRadius: rs(14),
  },
  pwdInput: {
    flex: 1,
    paddingHorizontal: rs(16), paddingVertical: rs(14),
    fontSize: rf(17), color: C.text,
  },
  eyeBtn: { paddingHorizontal: rs(14), paddingVertical: rs(14) },

  /* Règles */
  rules:     { marginTop: rs(10), paddingLeft: rs(2) },
  ruleRow:   { flexDirection: "row", alignItems: "center", marginBottom: rs(5) },
  ruleLabel: { fontSize: rf(14) },
  errorText: { color: C.danger, fontSize: rf(14), marginTop: rs(5) },

  /* Bouton principal */
  btn: {
    backgroundColor: C.primary,
    borderRadius: rs(16), paddingVertical: rs(16),
    alignItems: "center", marginTop: rs(8),
    shadowColor: C.primary, shadowOpacity: 0.3,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnDisabled: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
  btnTxt:      { color: "#fff", fontWeight: "700", fontSize: rf(18), letterSpacing: 0.3 },

  /* Lien retour */
  backLink:    { alignItems: "center", marginTop: rs(20) },
  backLinkTxt: { fontSize: rf(15), color: C.textMuted },
});
