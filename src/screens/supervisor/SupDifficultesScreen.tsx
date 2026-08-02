import React, { useState, useEffect, useCallback } from "react";
import { trackUsage } from "../../services/usage";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import { getCachedDifficultes, setCachedDifficultes, DifficulteItem } from "../../services/cache";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";
import BackButton from "../../components/BackButton";

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SupDifficultesScreen() {
  useEffect(() => { trackUsage("difficultes").catch(() => {}); }, []);
  const insets = useSafeAreaInsets();
  const { user, isOnline } = useStore();

  const [items,      setItems]      = useState<DifficulteItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);

  const fetchDifficultes = useCallback(async () => {
    try {
      setError(null);
      const { data } = await superviseurApi.getDifficultes();
      const list: DifficulteItem[] = data.items ?? [];
      setItems(list);
      await setCachedDifficultes(list).catch(() => {});
    } catch {
      const cached = await getCachedDifficultes();
      if (cached) {
        setItems(cached);
      } else {
        setError("Impossible de charger les difficultés. Vérifiez votre connexion.");
      }
    }
  }, []);

  useEffect(() => {
    fetchDifficultes().finally(() => setLoading(false));
  }, [fetchDifficultes]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDifficultes();
    setRefreshing(false);
  };

  // Sync manuelle depuis le bouton du header : sync superviseur globale + difficultés
  const syncOffline = useStore(st => st.syncOffline);
  const [syncing, setSyncing] = useState(false);
  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      await Promise.all([syncOffline(true).catch(() => {}), fetchDifficultes()]);
    } finally { setSyncing(false); }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  };

  const toggleResolve = async (rapportId: string, label: string) => {
    const key = `${rapportId}:${label}`;
    const item = items.find(it => it.id === rapportId);
    const nextValue = !(item?.resolutions?.[label] ?? false);
    setResolvingKey(key);
    try {
      await superviseurApi.resolveDifficulte(rapportId, label, nextValue);
      setItems(prev => prev.map(it =>
        it.id === rapportId
          ? { ...it, resolutions: { ...it.resolutions, [label]: nextValue } }
          : it
      ));
    } catch { /* silencieux — hors-ligne ou erreur réseau */ }
    finally { setResolvingKey(null); }
  };

  // ── Regroupement par enseignant ──────────────────────────────────────────
  const teachers = React.useMemo(() => {
    const map = new Map<string, { teacher_id: string; teacher_name: string; ecole: string; count: number }>();
    for (const it of items) {
      const existing = map.get(it.teacher_id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(it.teacher_id, { teacher_id: it.teacher_id, teacher_name: it.teacher_name, ecole: it.ecole, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [items]);

  const selectedTeacher = teachers.find(t => t.teacher_id === selectedTeacherId) ?? null;
  const selectedItems   = selectedTeacherId ? items.filter(it => it.teacher_id === selectedTeacherId) : [];

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.loadingText}>Chargement des difficultés…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        onSyncPress={handleManualSync}
        syncing={syncing}
        isOnline={isOnline}
        sectionLabel="Espace Superviseur"
      />

      <View style={styles.content}>
        {selectedTeacher ? (
          <>
            <View style={styles.header}>
              <BackButton
                onPress={() => setSelectedTeacherId(null)}
                label="Tous les enseignants"
                style={{ alignSelf: "flex-start" }}
              />
              <Text style={styles.title}>{selectedTeacher.teacher_name}</Text>
              <Text style={styles.subtitle}>
                {selectedItems.length} rapport{selectedItems.length !== 1 ? "s" : ""} avec difficulté{selectedItems.length !== 1 ? "s" : ""}
              </Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
              contentContainerStyle={styles.listContent}
            >
              {selectedItems.map(item => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {item.teacher_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teacherName} numberOfLines={1}>{item.teacher_name}</Text>
                      <Text style={styles.cardSub}>{item.ecole} · {formatDate(item.date_rapport)}</Text>
                    </View>
                  </View>

                  <View style={styles.diffTags}>
                    {item.difficultes.map((d, i) => {
                      const isResolved = !!item.resolutions?.[d];
                      const isBusy = resolvingKey === `${item.id}:${d}`;
                      return (
                        <View key={i} style={[styles.diffTag, isResolved && styles.diffTagResolved]}>
                          <Text style={[styles.diffTagText, isResolved && styles.diffTagTextResolved]}>{d}</Text>
                          <TouchableOpacity
                            style={[styles.resolveBtn, isResolved && styles.resolveBtnResolved]}
                            disabled={isBusy}
                            onPress={() => toggleResolve(item.id, d)}
                          >
                            <Text style={[styles.resolveBtnText, isResolved && styles.resolveBtnTextResolved]}>
                              {isBusy ? "…" : isResolved ? "✓ Résolu" : "Régler"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>

                  {item.autres_difficultes && (
                    <Text style={styles.diffDetail}>Autre : {item.autres_difficultes}</Text>
                  )}
                  {item.description_difficultes && (
                    <Text style={styles.diffDetail}>{item.description_difficultes}</Text>
                  )}
                  {item.nb_absences > 0 && (
                    <View style={styles.absenceRow}>
                      <Feather name="user-x" size={rs(13)} color={C.danger} />
                      <Text style={styles.absenceText}>
                        {item.nb_absences} absence{item.nb_absences !== 1 ? "s" : ""}
                        {item.absents ? ` — ${item.absents}` : ""}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Inconvénients signalés</Text>
              <Text style={styles.subtitle}>
                {teachers.length} enseignant{teachers.length !== 1 ? "s" : ""} concerné{teachers.length !== 1 ? "s" : ""}
              </Text>
            </View>

            {error && (
              <View style={styles.errorBanner}>
                <Feather name="alert-circle" size={rs(14)} color={C.danger} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => { setLoading(true); fetchDifficultes().finally(() => setLoading(false)); }}>
                  <Text style={styles.retryText}>Réessayer</Text>
                </TouchableOpacity>
              </View>
            )}

            {!error && teachers.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="check-circle" size={rs(40)} color={C.textMuted} />
                <Text style={styles.emptyText}>
                  Aucune difficulté signalée par vos enseignants.
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
                contentContainerStyle={styles.listContent}
              >
                {teachers.map(t => (
                  <TouchableOpacity
                    key={t.teacher_id}
                    style={styles.card}
                    activeOpacity={0.7}
                    onPress={() => setSelectedTeacherId(t.teacher_id)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {t.teacher_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.teacherName} numberOfLines={1}>{t.teacher_name}</Text>
                        <Text style={styles.cardSub}>{t.ecole}</Text>
                      </View>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{t.count}</Text>
                      </View>
                      <Feather name="chevron-right" size={rs(18)} color={C.textMuted} />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}
      </View>

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  content:     { flex: 1, paddingHorizontal: rs(14), paddingTop: rs(10) },
  center:      { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: rs(12) },
  loadingText: { fontSize: rf(16), color: C.textMuted, marginTop: rs(8) },

  header:      { marginBottom: rs(14) },
  title:       { fontSize: rf(20), fontWeight: "700", color: C.text },
  subtitle:    { fontSize: rf(13), color: C.textMuted, marginTop: rs(3), fontWeight: "500" },


  countBadge:     { backgroundColor: C.dangerSoft, borderRadius: rs(10), minWidth: rs(24), height: rs(24), alignItems: "center", justifyContent: "center", paddingHorizontal: rs(6), marginRight: rs(8) },
  countBadgeText: { fontSize: rf(12), fontWeight: "800", color: C.danger },

  errorBanner: { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.dangerSoft, borderRadius: rs(10), padding: rs(12), marginBottom: rs(10) },
  errorText:   { flex: 1, fontSize: rf(14), color: C.danger },
  retryText:   { fontSize: rf(14), fontWeight: "700", color: C.danger, textDecorationLine: "underline" },

  emptyState:  { flex: 1, alignItems: "center", justifyContent: "center", gap: rs(12), paddingVertical: rs(60) },
  emptyText:   { fontSize: rf(15), color: C.textMuted, textAlign: "center", lineHeight: rf(22) },

  listContent: { gap: rs(10), paddingBottom: rs(24) },
  card:        { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14), padding: rs(14), gap: rs(10) },
  cardHeader:  { flexDirection: "row", alignItems: "center", gap: rs(10) },
  avatar:      { width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: C.dangerSoft, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText:  { fontSize: rf(14), fontWeight: "800", color: C.danger },
  teacherName: { fontSize: rf(15), fontWeight: "700", color: C.text },
  cardSub:     { fontSize: rf(12.5), color: C.textMuted, marginTop: rs(1) },

  diffTags:    { flexDirection: "row", flexWrap: "wrap", gap: rs(6) },
  diffTag:     { flexDirection: "row", alignItems: "center", gap: rs(6), backgroundColor: C.dangerSoft, borderRadius: rs(8), paddingLeft: rs(10), paddingRight: rs(4), paddingVertical: rs(4) },
  diffTagResolved: { backgroundColor: C.successSoft },
  diffTagText: { fontSize: rf(12), fontWeight: "600", color: C.danger },
  diffTagTextResolved: { color: C.success },

  resolveBtn:  { backgroundColor: "rgba(255,255,255,0.7)", borderRadius: rs(6), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  resolveBtnResolved: { backgroundColor: C.success },
  resolveBtnText: { fontSize: rf(10.5), fontWeight: "700", color: C.danger },
  resolveBtnTextResolved: { color: "#fff" },

  absenceRow:  { flexDirection: "row", alignItems: "center", gap: rs(6) },
  absenceText: { fontSize: rf(12.5), fontWeight: "600", color: C.danger },

  diffDetail:  { fontSize: rf(13), color: C.textMuted, lineHeight: rf(19) },
});
