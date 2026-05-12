/**
 * Écran de connexion — Compatible Android 7+ / iOS 15.1+.
 * Numéro formaté automatiquement · Icône œil Feather
 */
import React, { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useStore } from "../store/useStore";
import { useRouter } from "expo-router";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import AredLogo from "../components/AredLogo";

/* ── Formatage automatique du numéro sénégalais ────────────────
   Format affiché : XX XXX XX XX  (9 chiffres max)
   Exemple        : 77 000 00 00
──────────────────────────────────────────────────────────────── */
function formatPhone(raw: string): string {
  // Garde uniquement les chiffres, limite à 9
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length === 0) return "";
  // Groupes : 2 · 3 · 2 · 2
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 5);
  const p3 = digits.slice(5, 7);
  const p4 = digits.slice(7, 9);
  return [p1, p2, p3, p4].filter(Boolean).join(" ");
}

export default function LoginScreen() {
  const { login, loading } = useStore();
  const router = useRouter();

  const [phone,    setPhone]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const pwdRef = useRef<TextInput>(null);

  const handlePhoneChange = (text: string) => {
    setPhone(formatPhone(text));
  };

  const handleLogin = async () => {
    // Numéro brut sans espaces pour l'API
    const rawPhone = phone.replace(/\s/g, "");
    if (!rawPhone || !password) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs.");
      return;
    }
    try {
      const { mustChangePassword } = await login(rawPhone, password);
      if (mustChangePassword) {
        router.replace("/change-password");
      } else {
        router.replace("/(tabs)/home");
      }
    } catch (e: any) {
      // Pas de réponse = problème réseau (serveur injoignable)
      if (!e?.response) {
        Alert.alert(
          "Serveur introuvable",
          `Impossible de joindre le serveur.\nVérifiez que vous êtes sur le bon réseau Wi-Fi.\n\n(${e?.message ?? "Network Error"})`,
        );
      } else {
        Alert.alert(
          "Connexion refusée",
          e.response.data?.detail ?? "Identifiant ou mot de passe incorrect.",
        );
      }
    }
  };

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Bouton retour */}
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={rf(20)} color={C.text} />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo + titre */}
          <View style={s.header}>
            <AredLogo size={80} />
            <Text style={s.title}>Bon retour !</Text>
            <Text style={s.subtitle}>Connectez-vous à votre compte</Text>
          </View>

          {/* ── Champ téléphone ── */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Numéro de téléphone</Text>
            <View style={s.phoneRow}>
              {/* Indicatif pays */}
              <View style={s.countryPrefix}>
                <Text style={s.countryFlag}>🇸🇳</Text>
                <Text style={s.countryCode}>+221</Text>
              </View>
              <View style={s.separator} />
              {/* Saisie formatée */}
              <TextInput
                style={s.phoneInput}
                placeholder="77 000 00 00"
                value={phone}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                placeholderTextColor={C.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => pwdRef.current?.focus()}
                autoCorrect={false}
              />
            </View>
          </View>

          {/* ── Champ mot de passe ── */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>Mot de passe</Text>
            <View style={s.pwdRow}>
              <TextInput
                ref={pwdRef}
                style={s.pwdInput}
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPwd}
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPwd(v => !v)}
                style={s.eyeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather
                  name={showPwd ? "eye-off" : "eye"}
                  size={rf(20)}
                  color={C.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mot de passe oublié */}
          <TouchableOpacity style={s.forgotWrap} activeOpacity={0.7}>
            <Text style={s.forgotTxt}>Mot de passe oublié ?</Text>
          </TouchableOpacity>

          {/* Bouton connexion */}
          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnTxt}>Se connecter</Text>
            }
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
  header: {
    alignItems: "center",
    marginTop: rs(8),
    marginBottom: rs(32),
  },
  title:    { marginTop: rs(16), fontSize: rf(26), fontWeight: "800", color: C.text },
  subtitle: { marginTop: rs(6),  fontSize: rf(14), color: C.textMuted },

  /* Champs */
  fieldWrap: { marginBottom: rs(16) },
  label:     { fontSize: rf(14), fontWeight: "600", color: C.text, marginBottom: rs(8) },

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
  countryCode: { fontSize: rf(14), fontWeight: "600", color: C.text },
  separator:   { width: 1, height: rs(26), backgroundColor: C.border },
  phoneInput:  {
    flex: 1,
    paddingHorizontal: rs(14), paddingVertical: rs(14),
    fontSize: rf(16), color: C.text,
    letterSpacing: 1,            // petit espacement visuel entre les groupes
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
    fontSize: rf(15), color: C.text,
  },
  eyeBtn: { paddingHorizontal: rs(14), paddingVertical: rs(14) },

  /* Mot de passe oublié */
  forgotWrap: { alignSelf: "flex-end", marginBottom: rs(28) },
  forgotTxt:  { fontSize: rf(13), color: C.primary, fontWeight: "600" },

  /* Bouton */
  btn: {
    backgroundColor: C.primary,
    borderRadius: rs(16), paddingVertical: rs(16),
    alignItems: "center",
    shadowColor: C.primary, shadowOpacity: 0.3,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnTxt:      { color: "#fff", fontWeight: "700", fontSize: rf(16), letterSpacing: 0.3 },
});
