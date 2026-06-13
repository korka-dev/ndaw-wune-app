import React, { useState, useEffect, useCallback } from "react";
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

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SupDifficultesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useStore();

  const [items,      setItems]      = useState<DifficulteItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

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

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  };

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
      />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Inconvénients signalés</Text>
          <Text style={styles.subtitle}>
            {items.length} rapport{items.length !== 1 ? "s" : ""} avec difficulté{items.length !== 1 ? "s" : ""}
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

        {!error && items.length === 0 ? (
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
            {items.map(item => (
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
                  {item.difficultes.map((d, i) => (
                    <View key={i} style={styles.diffTag}>
                      <Text style={styles.diffTagText}>{d}</Text>
                    </View>
                  ))}
                </View>

                {item.autres_difficultes && (
                  <Text style={styles.diffDetail}>Autre : {item.autres_difficultes}</Text>
                )}
                {item.description_difficultes && (
                  <Text style={styles.diffDetail}>{item.description_difficultes}</Text>
                )}
              </View>
            ))}
          </ScrollView>
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
  diffTag:     { backgroundColor: C.dangerSoft, borderRadius: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(5) },
  diffTagText: { fontSize: rf(12), fontWeight: "600", color: C.danger },

  diffDetail:  { fontSize: rf(13), color: C.textMuted, lineHeight: rf(19) },
});
