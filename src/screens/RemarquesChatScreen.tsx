/**
 * Assistant de signalement — style "chatbot" guidé (sans IA).
 *
 * Permet aux tuteurs et superviseurs de signaler des problèmes qui ne
 * relèvent pas du rapport journalier (manque de matériel, local, etc.).
 * L'assistant pose les questions étape par étape :
 *   1. Catégorie du problème (choix rapide)
 *   2. Description libre
 *   3. Confirmation puis envoi (offline → mis en file et envoyé plus tard)
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useStore } from "../store/useStore";
import { remarquesApi } from "../services/api";
import { enqueueAction } from "../services/db";
import { trackUsage } from "../services/usage";
import { rs, rf } from "../utils/responsive";
import BackButton from "../components/BackButton";
import { C } from "../utils/theme";
import AppHeader from "../components/AppHeader";
import ProfileSheet from "../components/ProfileSheet";

const CATEGORIES: { key: string; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "materiel", label: "Manque de matériel", icon: "box" },
  { key: "local",    label: "Problème de local",  icon: "home" },
  { key: "eleves",   label: "Problème d'élèves",  icon: "users" },
  { key: "securite", label: "Sécurité",           icon: "shield" },
  { key: "autre",    label: "Autre problème",     icon: "help-circle" },
];

type Step = "categorie" | "message" | "confirm" | "done";

interface ChatMsg {
  from: "bot" | "user";
  text: string;
}

export default function RemarquesChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, syncData, isOnline, syncOffline } = useStore();

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      from: "bot",
      text: `Bonjour ${user?.name?.split(" ")[0] ?? ""} 👋\nJe suis là pour recueillir les problèmes que vous rencontrez (hors rapport journalier).\n\nQuel type de problème souhaitez-vous signaler ?`,
    },
  ]);
  const [step, setStep] = useState<Step>("categorie");
  const [categorie, setCategorie] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { trackUsage("remarques").catch(() => {}); }, []);

  useEffect(() => {
    // Défilement automatique vers le dernier message
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages, step]);

  const pushBot = (text: string) =>
    setMessages(prev => [...prev, { from: "bot", text }]);
  const pushUser = (text: string) =>
    setMessages(prev => [...prev, { from: "user", text }]);

  /* ── Étape 1 : choix de la catégorie ── */
  const chooseCategorie = (key: string) => {
    const cat = CATEGORIES.find(c => c.key === key)!;
    setCategorie(key);
    pushUser(cat.label);
    setTimeout(() => {
      pushBot("Merci. Décrivez le problème en quelques mots (lieu, matériel concerné, depuis quand…).");
      setStep("message");
    }, 250);
  };

  /* ── Étape 2 : description libre ── */
  const sendMessageText = () => {
    const text = input.trim();
    if (!text) return;
    setPendingMessage(text);
    pushUser(text);
    setInput("");
    setTimeout(() => {
      const catLabel = CATEGORIES.find(c => c.key === categorie)?.label ?? categorie;
      pushBot(`Récapitulatif :\n• Catégorie : ${catLabel}\n• Description : ${text}\n\nVoulez-vous envoyer ce signalement ?`);
      setStep("confirm");
    }, 250);
  };

  /* ── Étape 3 : confirmation & envoi ── */
  const confirmSend = async () => {
    if (sending) return;
    setSending(true);
    pushUser("Oui, envoyer ✓");

    const payload = {
      categorie: categorie!,
      message:   pendingMessage,
      ecole:     syncData?.school?.name ?? null,
    };

    try {
      if (!isOnline) throw new Error("offline");
      await remarquesApi.submit(payload);
      pushBot("✅ Votre signalement a bien été transmis à l'équipe Ndaw Wune. Merci !\n\nVous pouvez signaler un autre problème si besoin.");
    } catch {
      // Hors-ligne ou erreur → file d'attente offline (renvoyé automatiquement)
      try { enqueueAction("SUBMIT_REMARQUE", payload); } catch { /* silencieux */ }
      pushBot("📥 Vous êtes hors-ligne : votre signalement a été enregistré et sera envoyé automatiquement dès le retour de la connexion.\n\nVous pouvez signaler un autre problème si besoin.");
    } finally {
      setSending(false);
      setStep("done");
    }
  };

  const cancelSend = () => {
    pushUser("Non, modifier");
    setTimeout(() => {
      pushBot("Pas de problème. Décrivez à nouveau le problème :");
      setStep("message");
    }, 250);
  };

  // ── En-tête commun de l'app ────────────────────────────────────────────
  const [profileOpen, setProfileOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try { await syncOffline(true); } catch {} finally { setSyncing(false); }
  };

  const restart = () => {
    setCategorie(null);
    setPendingMessage("");
    pushBot("Quel type de problème souhaitez-vous signaler ?");
    setStep("categorie");
  };

  return (
    <View style={s.screen}>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        onSyncPress={handleManualSync}
        syncing={syncing}
        isOnline={isOnline}
        sectionLabel="Espace Tuteur"
      />

      {/* En-tête contextuel de l'assistant */}
      <View style={s.header}>
        <BackButton onPress={() => router.back()} compact />
        <View style={s.headerIcon}>
          <Feather name="message-circle" size={rf(17)} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Assistant Ndaw Wune</Text>
          <Text style={s.headerSub}>Signalement de problèmes</Text>
        </View>
        {!isOnline && (
          <View style={s.offlineBadge}>
            <Text style={s.offlineTxt}>Hors-ligne</Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Fil de discussion */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.chatContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((m, i) => (
            <View
              key={i}
              style={[s.bubble, m.from === "bot" ? s.bubbleBot : s.bubbleUser]}
            >
              <Text style={[s.bubbleTxt, m.from === "user" && s.bubbleTxtUser]}>{m.text}</Text>
            </View>
          ))}

          {/* Choix de catégorie */}
          {step === "categorie" && (
            <View style={s.chipsWrap}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.key}
                  style={s.chip}
                  onPress={() => chooseCategorie(c.key)}
                  activeOpacity={0.75}
                >
                  <Feather name={c.icon} size={rf(14)} color={C.brand} />
                  <Text style={s.chipTxt}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Confirmation */}
          {step === "confirm" && !sending && (
            <View style={s.confirmRow}>
              <TouchableOpacity style={[s.confirmBtn, s.confirmYes]} onPress={confirmSend} activeOpacity={0.85}>
                <Feather name="send" size={rf(14)} color="#fff" />
                <Text style={s.confirmYesTxt}>Envoyer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, s.confirmNo]} onPress={cancelSend} activeOpacity={0.85}>
                <Text style={s.confirmNoTxt}>Modifier</Text>
              </TouchableOpacity>
            </View>
          )}
          {sending && (
            <View style={s.sendingRow}>
              <ActivityIndicator size="small" color={C.brand} />
              <Text style={s.sendingTxt}>Envoi en cours…</Text>
            </View>
          )}

          {/* Fin : proposer un nouveau signalement */}
          {step === "done" && !sending && (
            <View style={s.confirmRow}>
              <TouchableOpacity style={[s.confirmBtn, s.confirmYes]} onPress={restart} activeOpacity={0.85}>
                <Feather name="plus" size={rf(14)} color="#fff" />
                <Text style={s.confirmYesTxt}>Nouveau signalement</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, s.confirmNo]} onPress={() => router.back()} activeOpacity={0.85}>
                <Text style={s.confirmNoTxt}>Terminer</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Zone de saisie (étape description) */}
        {step === "message" && (
          <View style={[s.inputBar, { paddingBottom: rs(10) + insets.bottom }]}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Décrivez le problème…"
              placeholderTextColor={C.textMuted}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[s.sendBtn, !input.trim() && s.sendBtnDisabled]}
              onPress={sendMessageText}
              disabled={!input.trim()}
              activeOpacity={0.8}
            >
              <Feather name="send" size={rf(17)} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    paddingHorizontal: rs(14), paddingBottom: rs(12),
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerIcon: {
    width: rs(36), height: rs(36), borderRadius: rs(18),
    backgroundColor: C.brand, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: rf(16), fontWeight: "800", color: C.text },
  headerSub:   { fontSize: rf(12), color: C.textMuted, marginTop: rs(1) },
  offlineBadge: {
    backgroundColor: C.warnSoft, borderRadius: rs(8),
    paddingHorizontal: rs(8), paddingVertical: rs(3),
  },
  offlineTxt: { fontSize: rf(11), fontWeight: "700", color: C.warn },

  chatContent: { padding: rs(16), gap: rs(10), paddingBottom: rs(24) },
  bubble: {
    maxWidth: "85%", borderRadius: rs(16), paddingHorizontal: rs(14), paddingVertical: rs(10),
  },
  bubbleBot: {
    alignSelf: "flex-start", backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, borderTopLeftRadius: rs(4),
  },
  bubbleUser: {
    alignSelf: "flex-end", backgroundColor: C.brand, borderBottomRightRadius: rs(4),
  },
  bubbleTxt:     { fontSize: rf(14), color: C.text, lineHeight: rf(20) },
  bubbleTxtUser: { color: "#fff" },

  chipsWrap: { gap: rs(8), marginTop: rs(4) },
  chip: {
    flexDirection: "row", alignItems: "center", gap: rs(8),
    alignSelf: "flex-start",
    backgroundColor: C.brandSoft, borderRadius: rs(20),
    paddingHorizontal: rs(14), paddingVertical: rs(9),
    borderWidth: 1, borderColor: C.brand + "40",
  },
  chipTxt: { fontSize: rf(14), fontWeight: "700", color: C.brand },

  confirmRow: { flexDirection: "row", gap: rs(10), marginTop: rs(4) },
  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(6),
    borderRadius: rs(12), paddingHorizontal: rs(16), paddingVertical: rs(11),
  },
  confirmYes:    { backgroundColor: C.brand },
  confirmYesTxt: { fontSize: rf(14), fontWeight: "800", color: "#fff" },
  confirmNo:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  confirmNoTxt:  { fontSize: rf(14), fontWeight: "700", color: C.text },

  sendingRow: { flexDirection: "row", alignItems: "center", gap: rs(8), marginTop: rs(4) },
  sendingTxt: { fontSize: rf(13), color: C.textMuted },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: rs(8),
    paddingHorizontal: rs(14), paddingTop: rs(10),
    backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border,
  },
  input: {
    flex: 1, minHeight: rs(42), maxHeight: rs(110),
    backgroundColor: C.surfaceAlt, borderRadius: rs(14),
    paddingHorizontal: rs(14), paddingVertical: rs(10),
    fontSize: rf(14), color: C.text,
    borderWidth: 1, borderColor: C.border,
  },
  sendBtn: {
    width: rs(42), height: rs(42), borderRadius: rs(21),
    backgroundColor: C.brand, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.45 },
});
