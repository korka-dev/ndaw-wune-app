/**
 * Centre de synchronisation (rapport V2, lot L2).
 *
 * Montre au tuteur / superviseur, sans jargon :
 *   - ce qui attend d'être envoyé (et pourquoi, si un envoi a échoué) ;
 *   - les saisies refusées ou en conflit, avec « Réessayer » ou « Supprimer »
 *     (suppression confirmée, effet annoncé exactement) ;
 *   - les saisies d'anciennes versions sans auteur (quarantaine, APP-20) et
 *     celles d'autres comptes sur ce téléphone (nombre seulement) ;
 *   - la date de la dernière synchronisation et un bouton « Synchroniser ».
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import BackButton from "../components/BackButton";
import { useStore } from "../store/useStore";
import {
  getPendingActions, getFailedActions, requeueFailedAction, deleteFailedAction,
  countQuarantined, countOtherOwnersUnsent, QueueItem, FailedQueueItem,
} from "../services/db";
import { MAX_ATTEMPTS } from "../services/queue";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

const LIBELLES: Record<string, string> = {
  FINISH_SEANCE:             "Fin de séance",
  SUBMIT_RAPPORT:            "Rapport de séance",
  SUBMIT_RAPPORT_JOURNALIER: "Rapport journalier",
  REPORT_MISSED_SEANCE:      "Séance manquée",
  SUBMIT_PRESENCE_CHECK:     "Pointage des tuteurs",
  SUBMIT_EVALUATIONS:        "Évaluations",
  SUBMIT_REMARQUE:           "Remarque",
};

function libelle(action: string): string {
  return LIBELLES[action] ?? action;
}

function precision(payload: string): string | null {
  try {
    const p = JSON.parse(payload);
    const d = p.date_rapport ?? p.date_jour ?? p.finished_at ?? p.date_seance ?? p.start_payload?.started_at;
    return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
  } catch {
    return null;
  }
}

function quand(iso: string | null | undefined): string {
  if (!iso) return "jamais";
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SyncCenterScreen() {
  const router = useRouter();
  const { isOnline, lastSync, syncOffline } = useStore();

  const [pending, setPending]       = useState<QueueItem[]>([]);
  const [failed, setFailed]         = useState<FailedQueueItem[]>([]);
  const [quarantine, setQuarantine] = useState(0);
  const [others, setOthers]         = useState(0);
  const [syncing, setSyncing]       = useState(false);
  const [message, setMessage]       = useState<string | null>(null);

  const reload = useCallback(() => {
    try {
      setPending(getPendingActions());
      setFailed(getFailedActions());
      setQuarantine(countQuarantined());
      setOthers(countOtherOwnersUnsent());
    } catch (e) {
      setMessage("Lecture des données locales impossible. Redémarrez l'application.");
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const syncNow = async () => {
    if (!isOnline) {
      setMessage("Pas de connexion : vos saisies restent sur le téléphone et partiront automatiquement au retour du réseau.");
      return;
    }
    setSyncing(true);
    setMessage(null);
    const avant = getPendingActions().length;
    try {
      await syncOffline(true);
      const apres = getPendingActions().length;
      setMessage(
        apres === 0
          ? "Tout est envoyé."
          : `${avant - apres} envoyée(s), ${apres} encore en attente (voir le détail ci-dessous).`,
      );
    } catch {
      setMessage("La synchronisation n'a pas abouti. Vos saisies sont conservées.");
    } finally {
      setSyncing(false);
      reload();
    }
  };

  const retry = (item: FailedQueueItem) => {
    if (requeueFailedAction(item.id)) {
      reload();
      if (isOnline) syncNow();
      else setMessage("Remise en file : elle partira au retour du réseau.");
    }
  };

  const remove = (item: FailedQueueItem) => {
    Alert.alert(
      "Supprimer définitivement ?",
      `« ${libelle(item.action)}${precision(item.payload) ? ` du ${precision(item.payload)}` : ""} » sera effacé de ce téléphone ` +
      "et ne sera jamais envoyé. Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => { deleteFailedAction(item.id); reload(); } },
      ],
    );
  };

  const enErreur = pending.filter((p) => p.attempts > 0 || p.last_error);

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <View style={s.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.title}>Synchronisation</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
      >
        {/* ── Résumé ── */}
        <View style={s.card}>
          <View style={s.row}>
            <Feather name={isOnline ? "wifi" : "wifi-off"} size={rf(18)} color={isOnline ? C.success : C.danger} />
            <Text style={s.rowTxt}>{isOnline ? "Connecté" : "Hors ligne"}</Text>
          </View>
          <Text style={s.muted}>Dernière synchronisation : {quand(lastSync)}</Text>
          <Text style={s.big}>
            {pending.length === 0 ? "Aucune saisie en attente" : `${pending.length} saisie(s) en attente d'envoi`}
          </Text>
          {message && <Text style={s.message}>{message}</Text>}
          <TouchableOpacity style={[s.primaryBtn, syncing && { opacity: 0.7 }]} onPress={syncNow} disabled={syncing}>
            {syncing
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryTxt}>Synchroniser maintenant</Text>}
          </TouchableOpacity>
        </View>

        {/* ── En attente ── */}
        {pending.length > 0 && (
          <View style={s.card}>
            <Text style={s.section}>En attente</Text>
            {pending.map((p) => (
              <View key={p.id} style={s.item}>
                <Text style={s.itemTitle}>
                  {libelle(p.action)}{precision(p.payload) ? ` · ${precision(p.payload)}` : ""}
                </Text>
                {p.last_error ? (
                  <Text style={s.itemErr}>
                    {p.last_error}
                    {p.attempts > 0 ? ` (essai ${p.attempts}/${MAX_ATTEMPTS})` : ""}
                    {p.next_retry_at ? ` — nouvel essai vers ${quand(p.next_retry_at)}` : ""}
                  </Text>
                ) : (
                  <Text style={s.muted}>Partira à la prochaine connexion</Text>
                )}
              </View>
            ))}
            {enErreur.length > 0 && (
              <Text style={s.hint}>
                Les envois en erreur sont réessayés automatiquement. Après {MAX_ATTEMPTS} refus,
                la saisie passe dans « À vérifier » ci-dessous : elle n'est jamais effacée sans vous.
              </Text>
            )}
          </View>
        )}

        {/* ── À vérifier (refusées / conflits) ── */}
        {failed.length > 0 && (
          <View style={s.card}>
            <Text style={s.section}>À vérifier ({failed.length})</Text>
            {failed.map((f) => (
              <View key={f.id} style={s.item}>
                <Text style={s.itemTitle}>
                  {libelle(f.action)}{precision(f.payload) ? ` · ${precision(f.payload)}` : ""}
                </Text>
                <Text style={s.itemErr}>{f.last_error ?? "Refusée par le serveur"}</Text>
                <View style={s.actions}>
                  <TouchableOpacity style={s.smallBtn} onPress={() => retry(f)}>
                    <Feather name="refresh-cw" size={rf(14)} color={C.brand} />
                    <Text style={s.smallTxt}>Réessayer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.smallBtn} onPress={() => remove(f)}>
                    <Feather name="trash-2" size={rf(14)} color={C.danger} />
                    <Text style={[s.smallTxt, { color: C.danger }]}>Supprimer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <Text style={s.hint}>
              En cas de doute, contactez votre superviseur ou l'administrateur avant de supprimer.
            </Text>
          </View>
        )}

        {/* ── Quarantaine / autres comptes ── */}
        {(quarantine > 0 || others > 0) && (
          <View style={s.card}>
            <Text style={s.section}>Autres saisies sur ce téléphone</Text>
            {quarantine > 0 && (
              <Text style={s.muted}>
                {quarantine} saisie(s) d'une ancienne version de l'application, sans auteur identifié.
                Elles ne sont envoyées sous aucun compte. Signalez-les à l'administrateur.
              </Text>
            )}
            {others > 0 && (
              <Text style={[s.muted, { marginTop: rs(6) }]}>
                {others} saisie(s) d'un autre compte : elles partiront quand cette personne se reconnectera.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  header:    { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(12), gap: rs(8) },
  title:     { fontSize: rf(20), fontWeight: "800", color: C.text },
  scroll:    { padding: rs(16), gap: rs(14), paddingBottom: rs(40) },
  card:      { backgroundColor: C.surface, borderRadius: rs(16), padding: rs(16), borderWidth: 1, borderColor: C.border },
  row:       { flexDirection: "row", alignItems: "center", gap: rs(8) },
  rowTxt:    { fontSize: rf(15), fontWeight: "700", color: C.text },
  big:       { fontSize: rf(17), fontWeight: "800", color: C.text, marginTop: rs(10) },
  muted:     { fontSize: rf(13.5), color: C.textMuted, marginTop: rs(4), lineHeight: rf(19) },
  message:   { fontSize: rf(14), color: C.text, marginTop: rs(10), backgroundColor: C.brandSoft, padding: rs(10), borderRadius: rs(10) },
  primaryBtn:{ backgroundColor: C.brand, borderRadius: rs(12), paddingVertical: rs(14), alignItems: "center", marginTop: rs(14) },
  primaryTxt:{ color: "#fff", fontSize: rf(15.5), fontWeight: "800" },
  section:   { fontSize: rf(15), fontWeight: "800", color: C.text, marginBottom: rs(6) },
  item:      { paddingVertical: rs(10), borderBottomWidth: 1, borderBottomColor: C.border },
  itemTitle: { fontSize: rf(14.5), fontWeight: "700", color: C.text },
  itemErr:   { fontSize: rf(13), color: C.danger, marginTop: rs(3), lineHeight: rf(18) },
  hint:      { fontSize: rf(12.5), color: C.textMuted, marginTop: rs(10), lineHeight: rf(17) },
  actions:   { flexDirection: "row", gap: rs(10), marginTop: rs(8) },
  smallBtn:  { flexDirection: "row", alignItems: "center", gap: rs(6), paddingVertical: rs(6), paddingHorizontal: rs(10), borderRadius: rs(8), backgroundColor: C.surfaceAlt },
  smallTxt:  { fontSize: rf(13), fontWeight: "700", color: C.brand },
});
