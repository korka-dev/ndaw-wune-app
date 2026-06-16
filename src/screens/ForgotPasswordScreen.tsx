/**
 * Écran Mot de passe oublié — formulaire direct
 * Numéro de téléphone + nouveau mot de passe + confirmation → reset immédiat
 */
import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { authApi } from "../services/api";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import AredLogo from "../components/AredLogo";

/* ── Formatage numéro sénégalais (identique LoginScreen) ─────────────────── */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (!digits.length) return "";
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 5);
  const p3 = digits.slice(5, 7);
  const p4 = digits.slice(7, 9);
  return [p1, p2, p3, p4].filter(Boolean).join(" ");
}

/* ══════════════════════════════════════════════════════════════════════════
   Écran principal
══════════════════════════════════════════════════════════════════════════ */
export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [phone,    setPhone]    = useState("");
  const [newPwd,   setNewPwd]   = useState("");
  const [confPwd,  setConfPwd]  = useState("");
  const [showNew,  setShowNew]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const confRef   = useRef<TextInput>(null);
  const newPwdRef = useRef<TextInput>(null);

  const rawPhone   = phone.replace(/\s/g, "");
  const isFormOk   = rawPhone.length >= 9 && newPwd.length > 0 && newPwd === confPwd;

  const handleReset = async () => {
    if (!isFormOk) return;
    setLoading(true);
    try {
      await authApi.resetPassword(rawPhone, newPwd, confPwd);
      Alert.alert(
        "Mot de passe réinitialisé",
        "Votre mot de passe a été mis à jour avec succès.\nVous pouvez vous connecter.",
        [{ text: "Se connecter", onPress: () => router.replace("/login") }],
      );
    } catch (err: any) {
      if (!err?.response) {
        Alert.alert(
          "Serveur injoignable",
          `Impossible de joindre le serveur.\nVérifiez votre connexion Wi-Fi.\n\n(${err?.message ?? "Network Error"})`,
        );
      } else {
        const detail = err?.response?.data?.detail ?? "Une erreur est survenue. Réessayez.";
        Alert.alert("Erreur", detail);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Bouton retour */}
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={rf(20)} color={C.text} />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* En-tête */}
          <View style={s.header}>
            <AredLogo size={70} />
            <Text style={s.title}>Réinitialiser le mot de passe</Text>
            <Text style={s.subtitle}>
              Entrez votre numéro de téléphone et choisissez{"\n"}un nouveau mot de passe.
            </Text>
          </View>

          {/* ── Numéro de téléphone ── */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Numéro de téléphone</Text>
            <View style={s.phoneRow}>
              <View style={s.countryPrefix}>
                <Text style={s.countryFlag}>🇸🇳</Text>
                <Text style={s.countryCode}>+221</Text>
              </View>
              <View style={s.separator} />
              <TextInput
                style={s.phoneInput}
                placeholder="77 000 00 00"
                value={phone}
                onChangeText={t => setPhone(formatPhone(t))}
                keyboardType="phone-pad"
                placeholderTextColor={C.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => newPwdRef.current?.focus()}
                autoCorrect={false}
              />
            </View>
          </View>

          {/* ── Nouveau mot de passe ── */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Nouveau mot de passe</Text>
            <View style={s.pwdRow}>
              <TextInput
                ref={newPwdRef}
                style={s.pwdInput}
                value={newPwd}
                onChangeText={setNewPwd}
                secureTextEntry={!showNew}
                placeholder="Nouveau mot de passe"
                placeholderTextColor={C.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => confRef.current?.focus()}
              />
              <TouchableOpacity
                onPress={() => setShowNew(v => !v)}
                style={s.eyeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name={showNew ? "eye-off" : "eye"} size={rf(20)} color={C.textMuted} />
              </TouchableOpacity>
            </View>

          </View>

          {/* ── Confirmation ── */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Confirmer le mot de passe</Text>
            <View style={s.pwdRow}>
              <TextInput
                ref={confRef}
                style={s.pwdInput}
                value={confPwd}
                onChangeText={setConfPwd}
                secureTextEntry={!showConf}
                placeholder="Répétez le mot de passe"
                placeholderTextColor={C.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleReset}
              />
              <TouchableOpacity
                onPress={() => setShowConf(v => !v)}
                style={s.eyeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name={showConf ? "eye-off" : "eye"} size={rf(20)} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {confPwd.length > 0 && newPwd !== confPwd && (
              <Text style={s.errorText}>Les mots de passe ne correspondent pas.</Text>
            )}
          </View>

          {/* ── Bouton ── */}
          <TouchableOpacity
            style={[s.btn, (!isFormOk || loading) && s.btnDisabled]}
            onPress={handleReset}
            disabled={!isFormOk || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnTxt}>Réinitialiser le mot de passe</Text>
            }
          </TouchableOpacity>

          {/* Retour connexion */}
          <TouchableOpacity onPress={() => router.back()} style={s.backLink}>
            <Text style={s.backLinkTxt}>← Retour à la connexion</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  backBtn: {
    margin: rs(16),
    width: rs(40), height: rs(40),
    borderRadius: rs(12),
    backgroundColor: C.surfaceAlt,
    alignItems: "center", justifyContent: "center",
    alignSelf: "flex-start",
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: rs(24),
    paddingBottom: rs(48),
  },

  /* En-tête */
  header:   { alignItems: "center", marginTop: rs(4), marginBottom: rs(32) },
  title:    { marginTop: rs(12), fontSize: rf(24), fontWeight: "800", color: C.text, textAlign: "center" },
  subtitle: { marginTop: rs(6), fontSize: rf(15), color: C.textMuted, textAlign: "center", lineHeight: rf(22) },

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
