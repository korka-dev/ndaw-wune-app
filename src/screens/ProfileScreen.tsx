import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, TextInput, ActivityIndicator } from "react-native";
import { useStore } from "../store/useStore";
import { useRouter } from "expo-router";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import { getFailedActions, clearFailedQueue, FailedQueueItem } from "../services/db";
import { openAppGuide } from "../components/AppGuide";
import { remplacementsApi } from "../services/api";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

export default function ProfileScreen() {
  const { user, syncData, lastSync, logout, isOnline } = useStore();
  const router = useRouter();
  const [failedActions, setFailedActions] = useState<FailedQueueItem[]>([]);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? "—";

  const handleCheckForUpdate = async () => {
    if (!Updates.isEnabled) {
      Alert.alert("Indisponible", "Les mises à jour ne sont pas disponibles dans cette version de développement.");
      return;
    }
    setCheckingUpdate(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert("À jour", "Vous utilisez déjà la dernière version de l'application.");
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert(
        "Mise à jour disponible",
        "Une nouvelle version a été téléchargée. Redémarrer l'application maintenant ?",
        [
          { text: "Plus tard", style: "cancel" },
          { text: "Redémarrer", onPress: () => Updates.reloadAsync() },
        ]
      );
    } catch {
      Alert.alert("Erreur", "Impossible de vérifier les mises à jour. Vérifiez votre connexion.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  // ── Remplacement élève ──────────────────────────────────────────────────
  const [remplacementOpen, setRemplacementOpen] = useState(false);
  const [selectedEleveId, setSelectedEleveId] = useState<string | null>(null);
  const [nouveauNom, setNouveauNom] = useState("");
  const [motif, setMotif] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const eleves = syncData?.eleves ?? [];
  const selectedEleve = eleves.find(e => e.id === selectedEleveId) ?? null;

  const resetRemplacementForm = () => {
    setSelectedEleveId(null);
    setNouveauNom("");
    setMotif("");
  };

  const submitRemplacement = async () => {
    if (!selectedEleve) { Alert.alert("Élève requis", "Choisissez l'élève à remplacer."); return; }
    if (!nouveauNom.trim()) { Alert.alert("Nom requis", "Indiquez le nom du nouvel élève."); return; }
    if (!motif.trim()) { Alert.alert("Motif requis", "Indiquez le motif du remplacement."); return; }
    setSubmitting(true);
    try {
      await remplacementsApi.create({
        ancien_eleve_id: selectedEleve.id,
        ancien_eleve_nom: [selectedEleve.nom, selectedEleve.prenom].filter(Boolean).join(" "),
        nouveau_eleve_nom: nouveauNom.trim(),
        classe: selectedEleve.classe,
        motif: motif.trim(),
      });
      Alert.alert("Remplacement enregistré", "Le nouvel élève a été ajouté à votre classe.");
      resetRemplacementForm();
      setRemplacementOpen(false);
    } catch {
      Alert.alert("Erreur", "Impossible d'enregistrer le remplacement. Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    setFailedActions(getFailedActions());
  }, []);

  const handleClearFailed = () => {
    Alert.alert(
      "Effacer les erreurs",
      "Ces actions n'ont pas pu être synchronisées. Voulez-vous les effacer définitivement ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Effacer",
          style: "destructive",
          onPress: () => {
            clearFailedQueue();
            setFailedActions([]);
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Déconnexion", style: "destructive", onPress: async () => { await logout(); router.replace("/login"); } },
    ]);
  };

  if (!user) return null;
  const initials = user.name.split(" ").map((p: string) => p[0] ?? "").join("").slice(0, 2).toUpperCase();

  const rows: [string, string][] = [
    ["E-mail",    user.email    ?? "—"],
    ["Téléphone", user.phone    ?? "—"],
    ["Rôle",      user.role === "coordonnateur" ? "Coordonnateur" : "Administrateur"],
    ["École",     syncData?.school?.name ?? "—"],
    ["Langue",    syncData?.school?.langue ?? "—"],
    ["Classes",   user.classes?.join(", ") ?? "—"],
    ["Session",   syncData?.active_session?.name ?? "Aucune session active"],
  ];

  const syncLabel = lastSync
    ? new Date(lastSync).toLocaleTimeString("fr", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      {/* Avatar */}
      <View style={s.avatarWrap}>
        <View style={s.avatar}>
          <Text style={s.avatarTxt}>{initials}</Text>
        </View>
        <Text style={s.name}>{user.name}</Text>
        {user.title && <Text style={s.subtitle}>{user.title}</Text>}
      </View>

      {/* Statut réseau */}
      <View style={[s.networkBadge, isOnline ? s.online : s.offline]}>
        <Text style={s.networkTxt}>
          {isOnline ? "🟢 En ligne" : "🔴 Hors-ligne"}
          {syncLabel ? `   ·   Sync ${syncLabel}` : ""}
        </Text>
      </View>

      {/* Infos */}
      <View style={s.infoCard}>
        {rows.map(([label, value], i) => (
          <View key={label} style={[s.row, i < rows.length - 1 && s.rowBorder]}>
            <Text style={s.rowLabel}>{label}</Text>
            <Text style={s.rowValue} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </View>

      {/* Erreurs de synchronisation */}
      {failedActions.length > 0 && (
        <View style={s.errorCard}>
          <Text style={s.errorTitle}>⚠️ {failedActions.length} action{failedActions.length > 1 ? "s" : ""} non synchronisée{failedActions.length > 1 ? "s" : ""}</Text>
          <Text style={s.errorBody}>
            {failedActions.map((a) => {
              const label = a.action === "FINISH_SEANCE"
                ? "Fin de séance"
                : a.action === "SUBMIT_RAPPORT"
                  ? "Rapport de séance"
                  : "Rapport journalier";
              return `• ${label} (${new Date(a.failed_at).toLocaleDateString("fr")})`;
            }).join("\n")}
          </Text>
          <Text style={s.errorHint}>Ces données n'ont pas pu être envoyées au serveur. Contactez l'administrateur si nécessaire.</Text>
          <TouchableOpacity style={s.errorClear} onPress={handleClearFailed} activeOpacity={0.8}>
            <Text style={s.errorClearTxt}>Effacer</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={s.tutorialBtn} onPress={openAppGuide} activeOpacity={0.8}>
        <Text style={s.tutorialTxt}>Revoir le guide</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.updateBtn}
        onPress={handleCheckForUpdate}
        disabled={checkingUpdate}
        activeOpacity={0.8}
      >
        {checkingUpdate
          ? <ActivityIndicator size="small" color={C.text} />
          : <Text style={s.updateTxt}>Vérifier les mises à jour · v{appVersion}</Text>}
      </TouchableOpacity>

      {eleves.length > 0 && (
        <TouchableOpacity style={s.remplacementBtn} onPress={() => setRemplacementOpen(true)} activeOpacity={0.8}>
          <Text style={s.remplacementTxt}>Remplacement élève</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={s.logoutTxt}>Se déconnecter</Text>
      </TouchableOpacity>

      <Modal
        visible={remplacementOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setRemplacementOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Remplacement élève</Text>
            <Text style={s.modalSub}>
              Sélectionnez l&apos;élève à remplacer, indiquez le nom du nouvel élève et le motif.
            </Text>

            <ScrollView style={s.eleveList} showsVerticalScrollIndicator={false}>
              {eleves.map(e => {
                const sel = selectedEleveId === e.id;
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={[s.eleveRow, sel && s.eleveRowSel]}
                    onPress={() => setSelectedEleveId(e.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.eleveRowTxt, sel && s.eleveRowTxtSel]}>
                      {[e.nom, e.prenom].filter(Boolean).join(" ")} · {e.classe}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              style={s.input}
              placeholder="Nom du nouvel élève"
              placeholderTextColor={C.textMuted}
              value={nouveauNom}
              onChangeText={setNouveauNom}
            />
            <TextInput
              style={[s.input, s.inputMultiline]}
              placeholder="Motif du remplacement"
              placeholderTextColor={C.textMuted}
              value={motif}
              onChangeText={setMotif}
              multiline
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => { setRemplacementOpen(false); resetRemplacementForm(); }}
                activeOpacity={0.8}
              >
                <Text style={s.modalCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSubmitBtn, submitting && { opacity: 0.6 }]}
                onPress={submitRemplacement}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.modalSubmitTxt}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: C.bg },
  container:   { alignItems: "center", paddingTop: rs(32), paddingBottom: rs(48), paddingHorizontal: rs(20) },
  avatarWrap:  { alignItems: "center", marginBottom: rs(16) },
  avatar:      { width: rs(80), height: rs(80), borderRadius: rs(40), backgroundColor: C.brand, alignItems: "center", justifyContent: "center", marginBottom: rs(12) },
  avatarTxt:   { color: "#fff", fontSize: rf(28), fontWeight: "700" },
  name:        { fontSize: rf(22), fontWeight: "700", color: C.text },
  subtitle:    { fontSize: rf(14), color: C.textMuted, marginTop: rs(2) },
  networkBadge:{ borderRadius: rs(10), paddingHorizontal: rs(16), paddingVertical: rs(8), marginBottom: rs(16) },
  online:      { backgroundColor: C.successSoft },
  offline:     { backgroundColor: C.warnSoft },
  networkTxt:  { fontSize: rf(13), fontWeight: "500", color: C.text },
  infoCard:    { backgroundColor: C.surface, borderRadius: rs(16), width: "100%", maxWidth: 480, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginBottom: rs(24), borderWidth: 1, borderColor: C.border },
  row:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: rs(12), paddingHorizontal: rs(16) },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel:    { fontSize: rf(13), color: C.textMuted, fontWeight: "500", flex: 1 },
  rowValue:    { fontSize: rf(13), color: C.text, fontWeight: "600", flex: 2, textAlign: "right" },
  tutorialBtn: { backgroundColor: C.primarySoft, borderRadius: rs(14), paddingVertical: rs(14), paddingHorizontal: rs(40), marginBottom: rs(12) },
  tutorialTxt: { color: C.primaryDark, fontWeight: "700", fontSize: rf(15) },
  remplacementBtn: { backgroundColor: C.warnSoft, borderRadius: rs(14), paddingVertical: rs(14), paddingHorizontal: rs(40), marginBottom: rs(12) },
  remplacementTxt: { color: C.text, fontWeight: "700", fontSize: rf(15) },
  updateBtn:   { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14), paddingVertical: rs(12), paddingHorizontal: rs(40), marginBottom: rs(12), minHeight: rs(44), alignItems: "center", justifyContent: "center" },
  updateTxt:   { color: C.textMuted, fontWeight: "600", fontSize: rf(13) },
  logoutBtn:   { backgroundColor: C.dangerSoft, borderRadius: rs(14), paddingVertical: rs(14), paddingHorizontal: rs(40) },
  logoutTxt:   { color: C.danger, fontWeight: "700", fontSize: rf(15) },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: rs(20) },
  modalCard:    { backgroundColor: C.surface, borderRadius: rs(18), padding: rs(20), width: "100%", maxWidth: 480, maxHeight: "85%" },
  modalTitle:   { fontSize: rf(18), fontWeight: "700", color: C.text, marginBottom: rs(4) },
  modalSub:     { fontSize: rf(13), color: C.textMuted, marginBottom: rs(14), lineHeight: rf(18) },
  eleveList:    { maxHeight: rs(160), marginBottom: rs(12) },
  eleveRow:     { paddingVertical: rs(10), paddingHorizontal: rs(12), borderRadius: rs(10), backgroundColor: C.bg, marginBottom: rs(6) },
  eleveRowSel:  { backgroundColor: C.brand },
  eleveRowTxt:  { fontSize: rf(13), color: C.text, fontWeight: "600" },
  eleveRowTxtSel: { color: "#fff" },
  input:        { backgroundColor: C.bg, borderRadius: rs(10), borderWidth: 1, borderColor: C.border, paddingHorizontal: rs(14), paddingVertical: rs(10), fontSize: rf(14), color: C.text, marginBottom: rs(10) },
  inputMultiline: { minHeight: rs(70), textAlignVertical: "top" },
  modalActions: { flexDirection: "row", gap: rs(10), marginTop: rs(6) },
  modalCancelBtn: { flex: 1, paddingVertical: rs(12), borderRadius: rs(12), borderWidth: 1, borderColor: C.border, alignItems: "center" },
  modalCancelTxt: { fontSize: rf(14), fontWeight: "600", color: C.textMuted },
  modalSubmitBtn: { flex: 1, paddingVertical: rs(12), borderRadius: rs(12), backgroundColor: C.brand, alignItems: "center" },
  modalSubmitTxt: { fontSize: rf(14), fontWeight: "700", color: "#fff" },
  errorCard:   { backgroundColor: "#FFF3CD", borderRadius: rs(14), width: "100%", maxWidth: 480, padding: rs(16), marginBottom: rs(20), borderWidth: 1, borderColor: "#FFCA28" },
  errorTitle:  { fontSize: rf(14), fontWeight: "700", color: "#7B5A00", marginBottom: rs(8) },
  errorBody:   { fontSize: rf(12), color: "#5D4400", lineHeight: 20, marginBottom: rs(8) },
  errorHint:   { fontSize: rf(11), color: "#7B5A00", fontStyle: "italic", marginBottom: rs(12) },
  errorClear:  { alignSelf: "flex-end", paddingVertical: rs(6), paddingHorizontal: rs(16), backgroundColor: "#FFE082", borderRadius: rs(8) },
  errorClearTxt: { fontSize: rf(12), fontWeight: "600", color: "#5D4400" },
});
