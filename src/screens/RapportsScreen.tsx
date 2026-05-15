/**
 * Écran Rapports — Vue principale
 * - Bouton "Envoyer un rapport"
 * - Historique des 4 derniers rapports envoyés
 * - Navigation vers le formulaire
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
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
  try {
    return format(parseISO(iso), "EEEE d MMMM yyyy", { locale: fr });
  } catch {
    return iso;
  }
}

function getDiffs(json: string): string {
  try {
    const arr: string[] = JSON.parse(json);
    if (!arr.length) return "Aucune";
    if (arr[0] === "Aucune") return "Aucune difficulté";
    return arr.slice(0, 2).join(", ") + (arr.length > 2 ? `…` : "");
  } catch {
    return "—";
  }
}

// ── Carte d'un rapport dans l'historique ──────────────────────────────────

function RapportCard({ item }: { item: RapportJournalierLocal }) {
  const synced = item.synced === 1;
  return (
    <View style={s.card}>
      {/* Ligne date + badge sync */}
      <View style={s.cardTop}>
        <Text style={s.cardDate} numberOfLines={1}>
          {fmtDate(item.date_rapport)}
        </Text>
        <View style={[s.badge, synced ? s.badgeOk : s.badgePend]}>
          <Feather
            name={synced ? "check-circle" : "clock"}
            size={rf(10)}
            color={synced ? C.success : C.warn}
          />
          <Text style={[s.badgeTxt, { color: synced ? C.success : C.warn }]}>
            {synced ? "Envoyé" : "En attente"}
          </Text>
        </View>
      </View>

      {/* Semaine · Jour */}
      <View style={s.cardRow}>
        <Feather name="book-open" size={rf(13)} color={C.brand} />
        <Text style={s.cardMeta}>
          Semaine {item.semaine}  ·  Jour {item.jour_cours}
        </Text>
      </View>

      {/* IEF / Commune */}
      <View style={s.cardRow}>
        <Feather name="map-pin" size={rf(13)} color={C.brand} />
        <Text style={s.cardMeta} numberOfLines={1}>
          {item.ief}  ·  {item.commune}
        </Text>
      </View>

      {/* Difficultés */}
      <View style={[s.cardRow, { marginTop: rs(2) }]}>
        <Feather name="alert-circle" size={rf(13)} color={C.textMuted} />
        <Text style={[s.cardMeta, { color: C.textMuted }]} numberOfLines={1}>
          {getDiffs(item.difficultes)}
        </Text>
      </View>
    </View>
  );
}

// ── Écran principal ────────────────────────────────────────────────────────

export default function RapportsScreen() {
  const { isOnline, user } = useStore();
  const [showForm,    setShowForm]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [history,     setHistory]     = useState<RapportJournalierLocal[]>([]);

  // Recharger l'historique chaque fois que l'onglet est focalisé
  useFocusEffect(
    useCallback(() => {
      try {
        const all = getRapportsJournalier();
        setHistory(all.slice(0, 4));   // max 4 derniers
      } catch (e) {
        console.warn("[Rapports] Erreur lecture SQLite :", e);
      }
    }, [])
  );

  // ── Vue formulaire ────────────────────────────────────────────────────

  if (showForm) {
    return (
      <RapportJournalierScreen
        onBack={() => setShowForm(false)}
        onSuccess={() => {
          // Rafraîchir l'historique puis revenir
          try {
            const all = getRapportsJournalier();
            setHistory(all.slice(0, 4));
          } catch {}
          setShowForm(false);
        }}
      />
    );
  }

  // ── Vue liste ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={["bottom"]}>

      {/* Header identique à l'écran Accueil */}
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
      />

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Bloc principal : bouton Envoyer ── */}
        <View style={s.heroCard}>
          <View style={s.heroIconWrap}>
            <Feather name="send" size={rf(32)} color={C.brand} />
          </View>
          <Text style={s.heroTitle}>Rapport du jour</Text>
          <Text style={s.heroSub}>
            {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
          </Text>

          <TouchableOpacity
            style={s.sendBtn}
            onPress={() => setShowForm(true)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={rf(18)} color="#fff" style={{ marginRight: rs(8) }} />
            <Text style={s.sendBtnTxt}>Envoyer un rapport</Text>
          </TouchableOpacity>
        </View>

        {/* ── Historique des 4 derniers rapports ── */}
        <View style={s.histSection}>
          <Text style={s.histTitle}>Derniers rapports</Text>

          {history.length === 0 ? (
            <View style={s.emptyWrap}>
              <Feather name="inbox" size={rf(36)} color={C.border} />
              <Text style={s.emptyTxt}>Aucun rapport envoyé pour le moment</Text>
            </View>
          ) : (
            history.map(item => (
              <RapportCard key={item.id} item={item} />
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
  scroll: { padding: rs(18), paddingBottom: rs(40) },

  /* Hero card */
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: rs(20), borderWidth: 1, borderColor: C.border,
    padding: rs(24), alignItems: "center",
    marginBottom: rs(24),
    shadowColor: "#000", shadowOpacity: 0.04,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  heroIconWrap: {
    width: rs(72), height: rs(72), borderRadius: rs(20),
    backgroundColor: C.brandSoft,
    alignItems: "center", justifyContent: "center",
    marginBottom: rs(16),
  },
  heroTitle: {
    fontSize: rf(17), fontWeight: "800", color: C.text,
    textAlign: "center", marginBottom: rs(6),
  },
  heroSub: {
    fontSize: rf(14), color: C.textMuted,
    textAlign: "center", lineHeight: rf(20),
    marginBottom: rs(22), textTransform: "capitalize",
  },
  sendBtn: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.brand, borderRadius: rs(14),
    paddingHorizontal: rs(28), paddingVertical: rs(14),
    shadowColor: C.brand, shadowOpacity: 0.35,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    width: "100%", justifyContent: "center",
  },
  sendBtnTxt: { color: "#fff", fontWeight: "800", fontSize: rf(15), letterSpacing: 0.3 },

  /* Historique */
  histSection: {},
  histTitle:   {
    fontSize: rf(13), fontWeight: "800", color: C.brand,
    textTransform: "uppercase", letterSpacing: 0.5,
    marginBottom: rs(12),
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
    fontSize: rf(13), fontWeight: "700", color: C.text,
    flex: 1, textTransform: "capitalize", marginRight: rs(8),
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: rs(4),
    borderRadius: rs(20), paddingHorizontal: rs(8), paddingVertical: rs(3),
  },
  badgeOk:   { backgroundColor: C.successSoft },
  badgePend: { backgroundColor: C.warnSoft },
  badgeTxt:  { fontSize: rf(10), fontWeight: "700" },

  cardRow: {
    flexDirection: "row", alignItems: "center", gap: rs(6),
    marginBottom: rs(4),
  },
  cardMeta: { fontSize: rf(12), color: C.textMuted, flex: 1 },

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
