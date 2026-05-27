/**
 * Écran Rapports — Statistiques globales + Historique complet
 * ─────────────────────────────────────────────────────────────
 * Structure :
 *   1. Statistiques sur TOUS les rapports de l'utilisateur
 *   2. Bouton "Envoyer un rapport"
 *   3. Historique complet (du plus récent au plus ancien)
 *
 * Badges :
 *   synced = 1 → "Envoyé"    (vert)
 *   synced = 0 → "En cours"  (orange)
 *
 * Sync auto : dès que la connexion revient, les rapports en attente
 * sont soumis automatiquement.
 */
import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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

function fmtDateShort(iso: string): string {
  try { return format(parseISO(iso), "d MMM yyyy", { locale: fr }); }
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
  icon, value, label, color, sub,
}: {
  icon:  React.ComponentProps<typeof Feather>["name"];
  value: string | number;
  label: string;
  color: string;
  sub?:  string;
}) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIconWrap, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={rf(18)} color={color} />
      </View>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Modal détail rapport (lecture seule) ──────────────────────────────────

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
            color={synced ? C.success : C.warn}
          />
          <Text style={[s.badgeTxt, { color: synced ? C.success : C.warn }]}>
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
  const router = useRouter();
  const { isOnline, user, syncOffline } = useStore();
  const [showForm,    setShowForm]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [history,     setHistory]     = useState<RapportJournalierLocal[]>([]);

  // ── Charger TOUS les rapports + auto-sync si nécessaire ───────────────
  const loadAndSync = useCallback(async () => {
    try {
      const all = getRapportsJournalier(); // tous, pas de slice
      setHistory(all);

      const hasPending = all.some(r => r.synced === 0);
      if (isOnline && hasPending) {
        await syncOffline(true);
        const updated = getRapportsJournalier();
        setHistory(updated);
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
    const allReports = getRapportsJournalier();
    const hasPending = allReports.some(r => r.synced === 0);
    if (!hasPending) return;
    syncOffline(true)
      .then(() => {
        try {
          const updated = getRapportsJournalier();
          setHistory(updated);
        } catch {}
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // ── Statistiques globales sur TOUS les rapports ───────────────────────
  const stats = useMemo(() => {
    const total          = history.length;
    const envoyes        = history.filter(r => r.synced === 1).length;
    const enCours        = history.filter(r => r.synced === 0).length;
    const dernierRapport = total > 0 ? history[0].date_rapport : null;
    return { total, envoyes, enCours, dernierRapport };
  }, [history]);

  // ── Vue formulaire ─────────────────────────────────────────────────────
  if (showForm) {
    return (
      <RapportJournalierScreen
        onBack={() => setShowForm(false)}
        onSuccess={() => {
          try {
            const all = getRapportsJournalier();
            setHistory(all);
          } catch {}
          setShowForm(false);
        }}
      />
    );
  }

  // ── Vue principale ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root} edges={[]}>

      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
      />
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* ── En-tête page ── */}
        <View style={s.pageHeader}>
          <Text style={s.pageTitle}>Mes rapports</Text>
          {stats.dernierRapport && (
            <Text style={s.pageSubtitle}>
              Dernier envoi : {fmtDateShort(stats.dernierRapport)}
            </Text>
          )}
        </View>

        {/* ── Statistiques globales ── */}
        {stats.total > 0 ? (
          <View style={s.statsSection}>
            {/* Validés + En attente */}
            <View style={s.statsRow}>
              <StatCard
                icon="check-circle"
                value={stats.envoyes}
                label="Validés"
                color={C.success}
                sub={stats.envoyes > 0 ? "synchronisés" : undefined}
              />
              <StatCard
                icon="clock"
                value={stats.enCours}
                label="En attente"
                color={stats.enCours > 0 ? C.warn : C.textMuted}
                sub={stats.enCours > 0 ? "sync auto" : "aucun"}
              />
            </View>

          </View>
        ) : (
          /* Aucun rapport — message d'invitation */
          <View style={s.emptyStats}>
            <Feather name="bar-chart-2" size={rf(36)} color={C.border} />
            <Text style={s.emptyStatsTxt}>Aucune statistique pour l'instant</Text>
            <Text style={s.emptyStatsSub}>Envoyez votre premier rapport pour voir vos données ici.</Text>
          </View>
        )}

        {/* ── Bouton Envoyer un rapport ── */}
        <TouchableOpacity
          style={s.sendBtn}
          onPress={() => setShowForm(true)}
          activeOpacity={0.85}
        >
          <View style={s.sendBtnInner}>
            <View style={s.sendBtnIcon}>
              <Feather name="plus" size={rf(20)} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.sendBtnTitle}>Envoyer un rapport</Text>
              <Text style={s.sendBtnSub}>
                {isOnline ? "Envoi immédiat" : "Mode hors-ligne — envoi auto à la reconnexion"}
              </Text>
            </View>
            <Feather name="chevron-right" size={rf(20)} color={C.brand} />
          </View>
        </TouchableOpacity>

        {/* ── Historique complet ── */}
        {history.length > 0 && (
          <View style={s.histSection}>
            <View style={s.histHeader}>
              <Text style={s.sectionTitle}>Historique</Text>
              <Text style={s.histCount}>{history.length} rapport{history.length > 1 ? "s" : ""}</Text>
            </View>

            {history.map(item => (
              <RapportCard
                key={item.id}
                item={item}
                onPress={() => router.push(`/rapport-detail?id=${item.id}`)}
              />
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { padding: rs(16), paddingBottom: rs(48) },

  /* En-tête page */
  pageHeader: {
    marginBottom: rs(20),
  },
  pageTitle: {
    fontSize: rf(22),
    fontWeight: "800",
    color: C.text,
    marginBottom: rs(2),
  },
  pageSubtitle: {
    fontSize: rf(14),
    color: C.textMuted,
    fontWeight: "500",
    textTransform: "capitalize",
  },

  sectionTitle: {
    fontSize: rf(14), fontWeight: "800", color: C.brand,
    textTransform: "uppercase", letterSpacing: 0.6,
  },

  /* Statistiques */
  statsSection: { marginBottom: rs(24) },
  statsRow:     { flexDirection: "row", gap: rs(10), marginBottom: rs(10) },

  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: rs(14),
    borderWidth: 1,
    borderColor: C.border,
    padding: rs(14),
    alignItems: "center",
  },
  statIconWrap: {
    width: rs(40), height: rs(40), borderRadius: rs(12),
    alignItems: "center", justifyContent: "center",
    marginBottom: rs(8),
  },
  statValue: { fontSize: rf(24), fontWeight: "800", marginBottom: rs(2) },
  statLabel: { fontSize: rf(12), color: C.textMuted, fontWeight: "600", textAlign: "center" },
  statSub:   { fontSize: rf(11), color: C.textMuted, marginTop: rs(2), textAlign: "center" },

  /* Bannière absences */
  absenceBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: rs(14),
    borderWidth: 1,
    borderColor: C.border,
    padding: rs(14),
    gap: rs(12),
  },
  absenceIconWrap: {
    width: rs(44),
    height: rs(44),
    borderRadius: rs(12),
    backgroundColor: C.danger + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  absenceValue: { fontSize: rf(22), fontWeight: "800", color: C.danger },
  absenceLabel: { fontSize: rf(12), color: C.textMuted, fontWeight: "600" },
  absenceAvg:   { fontSize: rf(12), color: C.textMuted, fontWeight: "600", textAlign: "right" },

  /* Empty stats */
  emptyStats: {
    alignItems: "center",
    paddingVertical: rs(28),
    backgroundColor: C.surface,
    borderRadius: rs(14),
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: rs(24),
    gap: rs(8),
  },
  emptyStatsTxt: { fontSize: rf(16), fontWeight: "700", color: C.textMuted },
  emptyStatsSub: { fontSize: rf(14), color: C.textMuted, textAlign: "center", paddingHorizontal: rs(24) },

  /* Bouton envoyer */
  sendBtn: {
    backgroundColor: C.surface,
    borderRadius: rs(16),
    borderWidth: 2,
    borderColor: C.brand,
    marginBottom: rs(28),
    overflow: "hidden",
  },
  sendBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: rs(16),
    gap: rs(14),
  },
  sendBtnIcon: {
    width: rs(46),
    height: rs(46),
    borderRadius: rs(13),
    backgroundColor: C.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnTitle: {
    fontSize: rf(17),
    fontWeight: "800",
    color: C.brand,
    marginBottom: rs(2),
  },
  sendBtnSub: {
    fontSize: rf(13),
    color: C.textMuted,
    fontWeight: "500",
  },

  /* Historique */
  histSection: {},
  histHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: rs(12),
  },
  histCount: {
    fontSize: rf(13),
    color: C.textMuted,
    fontWeight: "600",
  },

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
    fontSize: rf(15), fontWeight: "700", color: C.text,
    flex: 1, textTransform: "capitalize", marginRight: rs(8),
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: rs(4),
    borderRadius: rs(20), paddingHorizontal: rs(8), paddingVertical: rs(3),
  },
  badgeOk:       { backgroundColor: C.successSoft },
  badgeProgress: { backgroundColor: C.warnSoft },
  badgeTxt:      { fontSize: rf(12), fontWeight: "700" },

  cardRow: {
    flexDirection: "row", alignItems: "center", gap: rs(6),
    marginBottom: rs(4),
  },
  cardMeta: { fontSize: rf(14), color: C.textMuted, flex: 1 },

});
