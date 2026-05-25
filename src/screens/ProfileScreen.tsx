import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useStore } from "../store/useStore";
import { useRouter } from "expo-router";
import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import { getFailedActions, clearFailedQueue, FailedQueueItem } from "../services/db";

export default function ProfileScreen() {
  const { user, syncData, lastSync, logout, isOnline } = useStore();
  const router = useRouter();
  const [failedActions, setFailedActions] = useState<FailedQueueItem[]>([]);

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

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={s.logoutTxt}>Se déconnecter</Text>
      </TouchableOpacity>
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
  logoutBtn:   { backgroundColor: C.dangerSoft, borderRadius: rs(14), paddingVertical: rs(14), paddingHorizontal: rs(40) },
  logoutTxt:   { color: C.danger, fontWeight: "700", fontSize: rf(15) },
  errorCard:   { backgroundColor: "#FFF3CD", borderRadius: rs(14), width: "100%", maxWidth: 480, padding: rs(16), marginBottom: rs(20), borderWidth: 1, borderColor: "#FFCA28" },
  errorTitle:  { fontSize: rf(14), fontWeight: "700", color: "#7B5A00", marginBottom: rs(8) },
  errorBody:   { fontSize: rf(12), color: "#5D4400", lineHeight: 20, marginBottom: rs(8) },
  errorHint:   { fontSize: rf(11), color: "#7B5A00", fontStyle: "italic", marginBottom: rs(12) },
  errorClear:  { alignSelf: "flex-end", paddingVertical: rs(6), paddingHorizontal: rs(16), backgroundColor: "#FFE082", borderRadius: rs(8) },
  errorClearTxt: { fontSize: rf(12), fontWeight: "600", color: "#5D4400" },
});
