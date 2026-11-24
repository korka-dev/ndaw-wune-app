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
import React, { useEffect, useRef, useState, type ComponentRef } from "react";
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
import { categoriesPour, destinatairePour } from "../utils/remarques";

// Catégories et destinataires selon le rôle (lot L8 : options réduites pour l'inspecteur).
interface Echange {
  id: string; categorie: string; message: string; statut: string; created_at: string;
  destinataire?: string; reponse?: string | null; reponse_le?: string | null; reponse_par_nom?: string | null;
}

type Step = "categorie" | "message" | "confirm" | "done";

interface ChatMsg {
  from: "bot" | "user";
  text: string;
}

export default function RemarquesChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, syncData, isOnline, syncOffline } = useStore();
  // Lot L8 : l'inspecteur n'a pas de file hors ligne ni d'école propre
  // (le serveur renseigne « IEF <nom> »), et seulement deux catégories.
  const inspecteur = user?.role === "inspecteur";
  const CATEGORIES = categoriesPour(user?.role);

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
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // RET13 : échanges précédents et réponses reçues.
  const [echanges, setEchanges] = useState<Echange[]>([]);
  const [voirEchanges, setVoirEchanges] = useState(false);
  useEffect(() => {
    if (!isOnline) return;
    remarquesApi.list().then(r => setEchanges(r.data ?? [])).catch(() => {});
  }, [isOnline]);
  const nbReponses = echanges.filter(e => !!e.reponse).length;

  useEffect(() => { if (!inspecteur) trackUsage("remarques").catch(() => {}); }, [inspecteur]);

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
      const dest = destinatairePour(categorie, user?.role);
      pushBot(`Récapitulatif :\n• Catégorie : ${catLabel}\n• Destinataire : ${dest.libelle}\n• Description : ${text}\n\nVoulez-vous envoyer ce message ?`);
      setStep("confirm");
    }, 250);
  };

  /* ── Étape 3 : confirmation & envoi ── */
  const confirmSend = async () => {
    if (sending) return;
    setSending(true);
    pushUser("Oui, envoyer ✓");

    const dest = destinatairePour(categorie, user?.role);
    const payload = {
      categorie: categorie!,
      message:   pendingMessage,
      ecole:     inspecteur ? null : (syncData?.school?.name ?? null),
      destinataire: dest.code,
      ...(dest.code === "superviseur" && user?.classes?.length ? { contexte_type: "classe", contexte_id: user.classes[0] } : {}),
    };

    let aReessayer = false;
    try {
      if (!isOnline) throw new Error("offline");
      await remarquesApi.submit(payload);
      pushBot(`✅ Votre message a bien été reçu et transmis à ${dest.libelle}. La réponse apparaîtra dans « Mes échanges ».\n\nVous pouvez envoyer un autre message si besoin.`);
      remarquesApi.list().then(r => setEchanges(r.data ?? [])).catch(() => {});
    } catch {
      if (inspecteur) {
        // Pas de file hors ligne pour l'inspecteur : rien n'est stocké.
        pushBot(isOnline
          ? "⚠️ Votre signalement n'a pas pu être envoyé. Réessayez dans un instant."
          : "📵 Pas de connexion : votre signalement n'a pas été envoyé. Réessayez une fois connecté.");
        aReessayer = true;
        return;
      }
      // Hors-ligne ou erreur → file d'attente offline (renvoyé automatiquement)
      try {
        enqueueAction("SUBMIT_REMARQUE", payload);
        pushBot("📥 Votre signalement n'a pas pu partir tout de suite : il est enregistré sur le téléphone et sera envoyé automatiquement (voir Profil → Synchronisation).\n\nVous pouvez signaler un autre problème si besoin.");
      } catch {
        // APP-47 : jamais d'échec muet.
        pushBot("⚠️ Votre signalement n'a pas pu être envoyé ni enregistré. Réessayez dans un instant ou prévenez votre superviseur.");
      }
    } finally {
      setSending(false);
      setStep(aReessayer ? "confirm" : "done");
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
        sectionLabel={inspecteur ? "Espace Inspecteur" : "Espace Tuteur"}
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

          {/* RET13 : échanges précédents et réponses */}
          {echanges.length > 0 && (
            <TouchableOpacity style={s.chip} onPress={() => setVoirEchanges(v => !v)} activeOpacity={0.75}>
              <Feather name="inbox" size={rf(14)} color={C.brand} />
              <Text style={s.chipTxt}>
                {voirEchanges ? "Masquer mes échanges" : `Mes échanges (${echanges.length})${nbReponses ? ` · ${nbReponses} réponse${nbReponses > 1 ? "s" : ""}` : ""}`}
              </Text>
            </TouchableOpacity>
          )}
          {voirEchanges && echanges.map(e => (
            <View key={e.id} style={[s.bubble, s.bubbleBot]}>
              <Text style={s.bubbleTxt}>
                {new Date(e.created_at).toLocaleDateString("fr-FR")} — {e.message}
                {e.reponse
                  ? `\n\n↳ Réponse${e.reponse_par_nom ? ` de ${e.reponse_par_nom}` : ""} : ${e.reponse}`
                  : "\n\n↳ En attente de réponse"}
              </Text>
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
