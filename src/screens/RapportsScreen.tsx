/**
 * Écran Rapports — Vue principale
 * - Statistiques des 4 derniers rapports
 * - Bouton "Envoyer un rapport"
 * - Historique des derniers rapports
 *   → synced = 0 : "En cours" (pas "En attente")
 *   → synced = 1 : "Envoyé"
 *   → Envoi automatique dès reconnexion
 */
import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import { useStore } from "../store/useStore";
import { getRapportsJournalier, RapportJournalierLocal } from "../services/db";
import AppHeader from "../components/AppHeader";
import ProfileSheet from "../components/ProfileSheet";
import RapportJournalierScreen from "./RapportJournalierScreen";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try { return format(parseISO(iso), "EEEE d MMMM yyyy", { locale: fr }); }
  catch { return iso; }
}

function getDiffs(json: string): string {
  try {
    const arr: string[] = JSON.parse(json);
    if (!arr.length || arr[0] === "Aucune") return "Aucune difficulté";
    return arr.slice(0, 2).join(", ") + (arr.length > 2 ? "…" : "");
  } catch { return "—"; }
}

// ── Carte statistique ──────────────────────────────────────────────────────

function StatCard({
  icon, value, label, color,
}: { icon: React.ComponentProps<typeof Feather>["name"]; value: string | number; label: string; color: string }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIconWrap, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={rf(18)} color={color} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ── Modal détail rapport (lecture seule) ──────────────────────────────────


function RapportDetailModal({
  item, onClose,
}: { item: RapportJournalierLocal | null; onClose: () => void }) {
  if (!item) return null;
  const synced = item.synced === 1;

  let diffs: string[] = [];
  try { diffs = JSON.parse(item.difficultes); } catch {}
  const diffsLabel = diffs.length && diffs[0] !== "Aucune"
    ? diffs.join(", ") : "Aucune";

  return (
    <Modal visible={!!item} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />

          {/* En-tête */}
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle} numberOfLines={1}>
                {fmtDate(item.date_rapport)}
              </Text>
              <Text style={s.modalSub}>
                Semaine {item.semaine}  ·  Jour {item.jour_cours}
              </Text>
            </View>
            <View style={[s.badge, synced ? s.badgeOk : s.badgeProgress]}>
              <Feather name={synced ? "check-circle" : "loader"} size={rf(10)} color={synced ? C.success : C.brand} />
              <Text style={[s.badgeTxt, { color: synced ? C.success : C.brand }]}>
                {synced ? "Envoyé" : "En cours"}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <Feather name="x" size={rf(20)} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>

            {/* Lieu */}
            <View style={s.detailBlock}>
              <InfoLine label="École"      value={item.ecole} />
              <InfoLine label="Commune"    value={item.commune} />
              <InfoLine label="IEF"        value={item.ief} />
              <InfoLine label="Superviseur" value={item.superviseur} />
            </View>

            {/* Absences */}
            <View style={s.detailBlock}>
              <InfoLine label="Absences"   value={`${item.nb_absences} élève${item.nb_absences > 1 ? "s" : ""}`} />
              {item.absents ? <InfoLine label="Absents" value={item.absents} /> : null}
            </View>

            {/* Difficultés */}
            <View style={s.detailBlock}>
              <InfoLine label="Difficultés" value={diffsLabel} />
              {item.description_difficultes
                ? <InfoLine label="Description" value={item.description_difficultes} />
                : null}
            </View>

            {/* Suivi */}
            <View style={s.detailBlock}>
              <InfoLine label="Directeur venu"  value={item.directeur_venu ? "Oui" : "Non"} />
              <InfoLine label="Besoin d'appui"  value={item.besoin_appui  ? "Oui" : "Non"} />
            </View>

            {/* Commentaires */}
            {item.has_observations === 1 && item.commentaires ? (
              <View style={s.detailBlock}>
                <InfoLine label="Commentaires" value={item.commentaires} />
              </View>
            ) : null}

            {/* Photo */}
            {item.photo_classe ? (
              <Image
                source={{ uri: item.photo_classe }}
                style={s.photoPreview}
                resizeMode="cover"
              />
            ) : null}

            <View style={{ height: rs(24) }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoLine}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

// ── Carte rapport ──────────────────────────────────────────────────────────

function RapportCard({ item, onPress }: { item: RapportJournalierLocal; onPress: () => void }) {
  const synced = item.synced === 1;
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.75}>
      {/* Date + badge */}
      <View style={s.cardTop}>
        <Text style={s.cardDate} numberOfLines={1}>
          {fmtDate(item.date_rapport)}
        </Text>
        <View style={[s.badge, synced ? s.badgeOk : s.badgeProgress]}>
          <Feather
            name={synced ? "check-circle" : "loader"}
            size={rf(10)}
            color={synced ? C.success : C.brand}
          />
          <Text style={[s.badgeTxt, { color: synced ? C.success : C.brand }]}>
            {synced ? "Envoyé" : "En cours"}
          </Text>
        </View>
      </View>

      {/* Semaine · Jour */}
      <View style={s.cardRow}>
        <Feather name="book-open" size={rf(13)} color={C.brand} />
        <Text style={s.cardMeta}>Semaine {item.semaine}  ·  Jour {item.jour_cours}</Text>
      </View>

      {/* IEF / Commune */}
      <View style={s.cardRow}>
        <Feather name="map-pin" size={rf(13)} color={C.brand} />
        <Text style={s.cardMeta} numberOfLines={1}>{item.ief}  ·  {item.commune}</Text>
      </View>

      {/* Difficultés */}
      <View style={[s.cardRow, { marginTop: rs(2) }]}>
        <Feather name="alert-circle" size={rf(13)} color={C.textMuted} />
        <Text style={[s.cardMeta, { color: C.textMuted }]} numberOfLines={1}>
          {getDiffs(item.difficultes)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Écran principal ────────────────────────────────────────────────────────

export default function RapportsScreen() {
  const { isOnline, user, syncOffline } = useStore();
  const [showForm,        setShowForm]        = useState(false);
  const [profileOpen,     setProfileOpen]     = useState(false);
  const [history,         setHistory]         = useState<RapportJournalierLocal[]>([]);
  const [selectedRapport, setSelectedRapport] = useState<RapportJournalierLocal | null>(null);

  // ── Charger + auto-sync si nécessaire ─────────────────────────────────
  const loadAndSync = useCallback(async () => {
    try {
      const all = getRapportsJournalier();
      setHistory(all.slice(0, 4));

      // Vérifier TOUS les rapports (pas seulement les 4 affichés)
      const hasPending = all.some(r => r.synced === 0);
      if (isOnline && hasPending) {
        await syncOffline(true);
        // Recharger après sync pour mettre à jour les badges
        const updated = getRapportsJournalier();
        setHistory(updated.slice(0, 4));
      }
    } catch (e) {
      console.warn("[Rapports] Erreur lecture SQLite :", e);
    }
  }, [isOnline, syncOffline]);

  // Recharger + syncer à chaque fois que l'écran prend le focus
  useFocusEffect(
    useCallback(() => { loadAndSync(); }, [loadAndSync])
  );

  // ── Envoi automatique dès que la connexion revient ─────────────────────
  useEffect(() => {
    if (!isOnline) return;
    // Vérifier TOUS les rapports, pas uniquement les 4 affichés
    const allReports = getRapportsJournalier();
    const hasPending = allReports.some(r => r.synced === 0);
    if (!hasPending) return;
    syncOffline(true)
      .then(() => {
        try {
          const updated = getRapportsJournalier();
          setHistory(updated.slice(0, 4));
        } catch {}
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // ── Statistiques calculées sur les 4 derniers rapports ────────────────
  const stats = useMemo(() => {
    if (!history.length) return null;
    const valide    = history.filter(r => r.synced === 1).length;
    const nonValide = history.filter(r => r.synced === 0).length;
    return { valide, nonValide };
  }, [history]);

  // ── Vue formulaire ─────────────────────────────────────────────────────
  if (showForm) {
    return (
      <RapportJournalierScreen
        onBack={() => setShowForm(false)}
        onSuccess={() => {
          try {
            const all = getRapportsJournalier();
            setHistory(all.slice(0, 4));
          } catch {}
          setShowForm(false);
        }}
      />
    );
  }

  // ── Vue liste ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root} edges={["bottom"]}>

      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
      />
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />

      <RapportDetailModal
        item={selectedRapport}
        onClose={() => setSelectedRapport(null)}
      />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Statistiques ── */}
        {stats && (
          <View style={s.statsSection}>
            <View style={s.statsGrid}>
              <StatCard icon="check-circle" value={stats.valide}    label="Validé"      color={C.success} />
              <StatCard icon="clock"        value={stats.nonValide} label="Non validé"  color={C.warn}    />
            </View>
          </View>
        )}

        {/* ── Bouton Envoyer ── */}
        <TouchableOpacity
          style={s.sendBtn}
          onPress={() => setShowForm(true)}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={rf(18)} color="#fff" style={{ marginRight: rs(8) }} />
          <Text style={s.sendBtnTxt}>Envoyer un rapport</Text>
        </TouchableOpacity>

        {/* ── Historique ── */}
        <View style={s.histSection}>
          <Text style={s.sectionTitle}>Derniers rapports</Text>

          {history.length === 0 ? (
            <View style={s.emptyWrap}>
              <Feather name="inbox" size={rf(36)} color={C.border} />
              <Text style={s.emptyTxt}>Aucun rapport envoyé pour le moment</Text>
            </View>
          ) : (
            history.map(item => (
              <RapportCard
                key={item.id}
                item={item}
                onPress={() => setSelectedRapport(item)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { padding: rs(16), paddingBottom: rs(40) },

  sectionTitle: {
    fontSize: rf(12), fontWeight: "800", color: C.brand,
    textTransform: "uppercase", letterSpacing: 0.6,
    marginBottom: rs(12),
  },

  /* Statistiques */
  statsSection: { marginBottom: rs(20) },
  statsGrid:    { flexDirection: "row", flexWrap: "wrap", gap: rs(10) },
  statCard: {
    flex: 1, minWidth: "45%",
    backgroundColor: C.surface,
    borderRadius: rs(14), borderWidth: 1, borderColor: C.border,
    padding: rs(14), alignItems: "center",
  },
  statIconWrap: {
    width: rs(40), height: rs(40), borderRadius: rs(12),
    alignItems: "center", justifyContent: "center",
    marginBottom: rs(8),
  },
  statValue: { fontSize: rf(22), fontWeight: "800", color: C.text, marginBottom: rs(2) },
  statLabel: { fontSize: rf(11), color: C.textMuted, fontWeight: "600", textAlign: "center" },

  /* Bouton envoyer */
  sendBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: C.brand, borderRadius: rs(14),
    paddingVertical: rs(16),
    marginBottom: rs(28),
    shadowColor: C.brand, shadowOpacity: 0.3,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  sendBtnTxt: { color: "#fff", fontWeight: "800", fontSize: rf(15), letterSpacing: 0.3 },

  /* Historique */
  histSection: {},

  /* Carte rapport */
  card: {
    backgroundColor: C.surface,
    borderRadius: rs(14), borderWidth: 1, borderColor: C.border,
    padding: rs(14), marginBottom: rs(10),
  },
  cardTop: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: rs(8),
  },
  cardDate: {
    fontSize: rf(13), fontWeight: "700", color: C.text,
    flex: 1, textTransform: "capitalize", marginRight: rs(8),
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: rs(4),
    borderRadius: rs(20), paddingHorizontal: rs(8), paddingVertical: rs(3),
  },
  badgeOk:       { backgroundColor: C.successSoft },
  badgeProgress: { backgroundColor: C.brandSoft },
  badgeTxt:      { fontSize: rf(10), fontWeight: "700" },

  cardRow: {
    flexDirection: "row", alignItems: "center", gap: rs(6),
    marginBottom: rs(4),
  },
  cardMeta: { fontSize: rf(12), color: C.textMuted, flex: 1 },

  /* Modal détail */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet:   { backgroundColor: C.surface, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), padding: rs(20), maxHeight: "88%" },
  modalHandle:  { width: rs(40), height: rs(4), borderRadius: rs(2), backgroundColor: C.border, alignSelf: "center", marginBottom: rs(16) },
  modalHeader:  { flexDirection: "row", alignItems: "center", marginBottom: rs(16) },
  modalTitle:   { fontSize: rf(15), fontWeight: "700", color: C.text, textTransform: "capitalize" },
  modalSub:     { fontSize: rf(12), color: C.textMuted, marginTop: rs(2) },
  modalClose:   { padding: rs(6), marginLeft: rs(8) },

  /* Blocs d'info */
  detailBlock:  { backgroundColor: C.bg, borderRadius: rs(12), borderWidth: 1, borderColor: C.border, marginBottom: rs(10), overflow: "hidden" },
  infoLine:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: rs(14), paddingVertical: rs(11) },
  infoLabel:    { fontSize: rf(13), color: C.textMuted, fontWeight: "500" },
  infoValue:    { fontSize: rf(13), color: C.text, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: rs(16) },

  photoPreview: { width: "100%", height: rs(180), borderRadius: rs(12), backgroundColor: C.border, marginBottom: rs(10) },

  /* Vide */
  emptyWrap: {
    alignItems: "center", paddingVertical: rs(32),
    backgroundColor: C.surface, borderRadius: rs(14),
    borderWidth: 1, borderColor: C.border,
  },
  emptyTxt: {
    marginTop: rs(10), fontSize: rf(13), color: C.textMuted, textAlign: "center",
  },
});
