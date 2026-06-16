/**
 * Écran Nouveau mot de passe.
 * Structure et styles identiques à LoginScreen.
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
import { api } from "../services/api";
import { clearCache } from "../services/cache";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import AredLogo from "../components/AredLogo";

export default function ChangePasswordScreen() {
  const router  = useRouter();
  const confRef = useRef<TextInput>(null);

  const [newPwd,   setNewPwd]   = useState("");
  const [confPwd,  setConfPwd]  = useState("");
  const [showNew,  setShowNew]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const isValid = newPwd.length > 0 && newPwd === confPwd;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        new_password:     newPwd,
        confirm_password: confPwd,
      });
      await AsyncStorage.multiRemove(["access_token", "refresh_token"]);
      await clearCache();
      Alert.alert(
        "Mot de passe modifié",
        "Votre mot de passe a été mis à jour. Veuillez vous reconnecter.",
        [{ text: "Se connecter", onPress: () => router.replace("/login") }],
      );
    } catch (err: any) {
      Alert.alert("Erreur", err?.response?.data?.detail ?? "Une erreur est survenue.");
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
        {/* ── Bouton retour ── identique au login ── */}
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={rf(20)} color={C.text} />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Logo + titre ── identique au login ── */}
          <View style={s.header}>
            <AredLogo size={80} />
            <Text style={s.title}>Nouveau mot de passe</Text>
            <Text style={s.subtitle}>Choisissez un mot de passe personnel{"\n"}pour sécuriser votre compte.</Text>
          </View>

          {/* ── Nouveau mot de passe ── */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Nouveau mot de passe</Text>
            <View style={s.pwdRow}>
              <TextInput
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

          {/* ── Confirmer le mot de passe ── */}
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
                onSubmitEditing={handleSubmit}
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

          {/* ── Bouton ── identique au login ── */}
          <TouchableOpacity
            style={[s.btn, (!isValid || loading) && s.btnDisabled]}
            onPress={handleSubmit}
            disabled={!isValid || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnTxt}>Enregistrer et se reconnecter</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ── Styles — copie exacte de LoginScreen ── */
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

  /* En-tête — remonté par rapport au login (écran avec moins de contenu,
     on évite que le logo/titre paraissent trop bas sur l'écran) */
  header: {
    alignItems: "center",
    marginTop: 0,
    marginBottom: rs(20),
  },
  title:    { marginTop: rs(12), fontSize: rf(26), fontWeight: "800", color: C.text },
  subtitle: { marginTop: rs(6),  fontSize: rf(16), color: C.textMuted, textAlign: "center", lineHeight: rf(23) },

  /* Champs */
  fieldWrap: { marginBottom: rs(16) },
  label:     { fontSize: rf(16), fontWeight: "600", color: C.text, marginBottom: rs(8) },

  /* Mot de passe — identique au pwdRow du login */
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

  /* Règles de sécurité */
  rules:    { marginTop: rs(10), paddingLeft: rs(2) },
  ruleRow:  { flexDirection: "row", alignItems: "center", marginBottom: rs(5) },
  ruleLabel:{ fontSize: rf(14) },
  errorText:{ color: C.danger, fontSize: rf(14), marginTop: rs(5) },

  /* Bouton — identique au login */
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
});
