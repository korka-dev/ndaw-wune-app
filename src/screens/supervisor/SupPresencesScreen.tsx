import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, Keyboard,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import { enqueueAction,
         upsertSupervisorTeachers, getSupervisorTeachersCache,
         upsertSupervisorPresence, getSupervisorPresenceForDate } from "../../services/db";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";

interface Prof {
  id:        string;
  nom:       string;
  classe:    string;
  present:   boolean | null;
  motif:     string | null;
  initiales: string;
}


const MOTIFS = [
  { icon: "thermometer" as const, label: "Maladie" },
  { icon: "briefcase"   as const, label: "Raison personnelle" },
  { icon: "map-pin"     as const, label: "Formation / Mission" },
  { icon: "clock"       as const, label: "Retard prolongé" },
  { icon: "alert-circle"as const, label: "Non justifié" },
] as const;

function makeInitials(name: string) {
  return name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function SupPresencesScreen() {
  const insets = useSafeAreaInsets();
  const { user, isOnline, syncOffline } = useStore();

  const [profs,       setProfs]       = useState<Prof[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [validated,   setValidated]   = useState(false);
  const [validating,  setValidating]  = useState(false);
  const [locked,      setLocked]      = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [motifTarget,  setMotifTarget]  = useState<Prof | null>(null);
  const [motifChoice,  setMotifChoice]  = useState<string | null>(null);
  const [motifCustom,  setMotifCustom]  = useState("");

  /* ── Chargement : en ligne → API, hors-ligne → SQLite local ── */
  const fetchTeachers = useCallback(async () => {
    setError(null);
    const dateJour = todayIso();

    if (isOnline) {
      try {
        const [{ data }, presenceRes] = await Promise.all([
          superviseurApi.sync(),
          superviseurApi.getPresenceCheck().catch(() => null),
        ]);

        const rawTeachers: { id: string; name: string; classes?: string[] }[] =
          data.assigned_teachers ?? [];

        if (rawTeachers.length === 0) {
          setProfs([]);
          return;
        }

        // Persister la liste des enseignants pour usage hors-ligne
        upsertSupervisorTeachers(
          rawTeachers.map(t => ({
            id:  t.id,
            nom: t.name,
            cls: (t.classes ?? [])[0] ?? "—",
          })),
        );

        // Pointage déjà enregistré côté serveur pour aujourd'hui
        const saved = new Map<string, { present: boolean; motif: string | null }>();
        for (const e of presenceRes?.data?.entries ?? []) {
          // Conversion explicite en boolean pour éviter toute ambiguïté
          saved.set(e.teacher_id, {
            present: e.present === true,
            motif:   e.motif ?? null,
          });
        }

        const builtProfs = rawTeachers.map(t => {
          const s = saved.get(t.id);
          return {
            id:        t.id,
            nom:       t.name,
            classe:    (t.classes ?? [])[0] ?? "—",
            present:   s !== undefined ? (s.present === true) : null,
            motif:     s ? s.motif : null,
            initiales: makeInitials(t.name),
          };
        });

        // Synchroniser le cache local avec les données serveur
        for (const p of builtProfs) {
          upsertSupervisorPresence({
            date_jour:   dateJour,
            teacher_id:  p.id,
            teacher_nom: p.nom,
            teacher_cls: p.classe,
            present:     p.present,
            motif:       p.motif,
            synced:      saved.has(p.id) ? 1 : 0,
          });
        }

        setProfs(builtProfs);
        setLocked(saved.size > 0);
      } catch {
        setError("Impossible de charger les enseignants. Passage en mode hors-ligne.");
        loadFromLocalCache(dateJour);
      }
    } else {
      // Hors-ligne : lecture depuis SQLite
      loadFromLocalCache(dateJour);
    }
  }, [isOnline]);

  function loadFromLocalCache(dateJour: string) {
    const localEntries = getSupervisorPresenceForDate(dateJour);

    if (localEntries.length > 0) {
      // Reconstruire profs depuis le cache existant pour aujourd'hui
      setProfs(localEntries.map(r => ({
        id:        r.teacher_id,
        nom:       r.teacher_nom,
        classe:    r.teacher_cls,
        present:   r.present === null ? null : r.present === 1,
        motif:     r.motif,
        initiales: makeInitials(r.teacher_nom),
      })));
      const hasSubmitted = localEntries.some(r => r.synced === 1);
      setLocked(hasSubmitted);
    } else {
      // Pas de données pour aujourd'hui — charger la liste des enseignants du cache
      const teachers = getSupervisorTeachersCache();
      setProfs(teachers.map(t => ({
        id:        t.teacher_id,
        nom:       t.teacher_nom,
        classe:    t.teacher_cls,
        present:   null,
        motif:     null,
        initiales: makeInitials(t.teacher_nom),
      })));
      setLocked(false);
    }

    if (!isOnline) {
      setError("Hors-ligne — les modifications seront synchronisées à la reconnexion.");
    }
  }

  useEffect(() => {
    fetchTeachers().finally(() => setLoading(false));
  }, [fetchTeachers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTeachers();
    setRefreshing(false);
  };

  /* ── Sync manuelle (bouton header) ── */
  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      await syncOffline(true);
      await fetchTeachers();
    } catch {}
    finally { setSyncing(false); }
  };

  /* ── Actions de marquage — mise à jour UI + cache local immédiat ── */
  const markPresent = (id: string) => {
    if (locked) return;
    const dateJour = todayIso();
    setProfs(list => {
      const updated = list.map(p =>
        p.id === id ? { ...p, present: true as const, motif: null } : p
      );
      // Persister immédiatement dans SQLite
      const prof = updated.find(p => p.id === id);
      if (prof) {
        upsertSupervisorPresence({
          date_jour: dateJour, teacher_id: prof.id,
          teacher_nom: prof.nom, teacher_cls: prof.classe,
          present: true, motif: null, synced: 0,
        });
      }
      return updated;
    });
  };

  const openMotifModal = (prof: Prof) => {
    if (locked) return;
    setMotifTarget(prof);
    setMotifChoice(null);
    setMotifCustom("");
  };

  const closeMotifModal = () => {
    setMotifTarget(null);
    setMotifChoice(null);
    setMotifCustom("");
  };

  const confirmAbsent = () => {
    if (!motifTarget) return;
    const motif = motifChoice === "__custom" ? motifCustom.trim() : (motifChoice ?? "Non justifié");
    if (!motif) return;
    const dateJour = todayIso();
    const id = motifTarget.id;
    setProfs(list => {
      const updated = list.map(p =>
        p.id === id ? { ...p, present: false as const, motif } : p
      );
      const prof = updated.find(p => p.id === id);
      if (prof) {
        upsertSupervisorPresence({
          date_jour: dateJour, teacher_id: prof.id,
          teacher_nom: prof.nom, teacher_cls: prof.classe,
          present: false, motif, synced: 0,
        });
      }
      return updated;
    });
    closeMotifModal();
  };

  /* ── Validation ── */
  const handleValidate = async () => {
    setValidating(true);
    const dateJour = todayIso();

    // Construire les entrées avec boolean explicite (pas de cast TypeScript)
    const entries = profs
      .filter(p => p.present !== null)
      .map(p => ({
        teacher_id: p.id,
        present:    p.present === true,   // boolean explicite — jamais null/undefined
        motif:      p.present === true ? null : (p.motif ?? null),
      }));

    if (entries.length === 0) {
      setError("Marquez au moins un enseignant avant de valider.");
      setValidating(false);
      return;
    }

    if (isOnline) {
      try {
        await superviseurApi.submitPresenceCheck(dateJour, entries);
        // Marquer comme synchronisé dans le cache local
        for (const e of entries) {
          upsertSupervisorPresence({
            date_jour:   dateJour,
            teacher_id:  e.teacher_id,
            teacher_nom: profs.find(p => p.id === e.teacher_id)?.nom ?? "",
            teacher_cls: profs.find(p => p.id === e.teacher_id)?.classe ?? "",
            present:     e.present,
            motif:       e.motif,
            synced:      1,
          });
        }
        setValidated(true);
        setLocked(true);
        setTimeout(() => setValidated(false), 2500);
      } catch {
        setError("Impossible d'enregistrer les présences. Réessayez ou soumettez hors-ligne.");
      }
    } else {
      // Hors-ligne : mettre en file d'attente
      enqueueAction("SUBMIT_PRESENCE_CHECK", { date_jour: dateJour, entries });
      // Marquer localement comme "soumis hors-ligne" (synced reste 0 jusqu'au flush)
      for (const e of entries) {
        upsertSupervisorPresence({
          date_jour:   dateJour,
          teacher_id:  e.teacher_id,
          teacher_nom: profs.find(p => p.id === e.teacher_id)?.nom ?? "",
          teacher_cls: profs.find(p => p.id === e.teacher_id)?.classe ?? "",
          present:     e.present,
          motif:       e.motif,
          synced:      0,
        });
      }
      setValidated(true);
      setLocked(true);
      setError("Pointage enregistré hors-ligne — sera synchronisé à la reconnexion.");
      setTimeout(() => setValidated(false), 2500);
    }

    setValidating(false);
  };

  /* ── Stats ── */
  const presentsCount = profs.filter(p => p.present === true).length;
  const absentsCount  = profs.filter(p => p.present === false).length;
  const defined       = profs.filter(p => p.present !== null).length;

  const filtered = profs.filter(p =>
    !search.trim() ||
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    p.classe.toLowerCase().includes(search.toLowerCase())
  );

  const avatarBg    = (p: Prof) => p.present === true ? C.successSoft : p.present === false ? C.dangerSoft : C.surfaceAlt;
  const avatarColor = (p: Prof) => p.present === true ? C.success    : p.present === false ? C.danger     : C.textMuted;

  const today = new Date().toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  const todayCapital = today.charAt(0).toUpperCase() + today.slice(1);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.brand} />
        <Text style={styles.loadingText}>Chargement des enseignants…</Text>
      </View>
    );
  }

  const progressPct = profs.length > 0 ? Math.round((defined / profs.length) * 100) : 0;

  return (
    <View style={styles.root}>

      {/* ── AppHeader identique à l'écran enseignant ── */}
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setProfileOpen(true)}
        onSyncPress={handleManualSync}
        syncing={syncing}
        isOnline={isOnline}
      />

      {/* ── Contenu principal ── */}
      <View style={styles.content}>

        {/* ── Hero card ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroDate}>{todayCapital}</Text>
              <Text style={styles.heroGreet}>Bonjour, {user?.name ?? "Superviseur"}</Text>
            </View>
            <View style={styles.heroIconWrap}>
              <Feather name="clipboard" size={rf(22)} color="#fff" />
            </View>
          </View>

          {/* Barre de progression du pointage */}
          <View style={styles.heroProgressWrap}>
            <View style={styles.heroProgressBg}>
              <View style={[styles.heroProgressFill, { width: `${progressPct}%` as any }]} />
            </View>
            <Text style={styles.heroProgressTxt}>
              {defined}/{profs.length} pointé{defined > 1 ? "s" : ""}
            </Text>
          </View>

          {/* Stats intégrées dans la hero card */}
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <View style={[styles.heroStatDot, { backgroundColor: "#4ADE80" }]} />
              <Text style={styles.heroStatVal}>{presentsCount}</Text>
              <Text style={styles.heroStatLbl}>Présents</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <View style={[styles.heroStatDot, { backgroundColor: "#F87171" }]} />
              <Text style={styles.heroStatVal}>{absentsCount}</Text>
              <Text style={styles.heroStatLbl}>Absents</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <View style={[styles.heroStatDot, { backgroundColor: "rgba(255,255,255,0.4)" }]} />
              <Text style={styles.heroStatVal}>{profs.length - defined}</Text>
              <Text style={styles.heroStatLbl}>En attente</Text>
            </View>
          </View>
        </View>

        {/* Erreur / info hors-ligne */}
        {error && (
          <View style={[styles.errorBanner, !isOnline && styles.warnBanner]}>
            <Feather name={isOnline ? "alert-circle" : "wifi-off"} size={rs(14)} color={isOnline ? C.danger : C.warn} />
            <Text style={[styles.errorText, !isOnline && styles.warnText]}>{error}</Text>
            {isOnline && (
              <TouchableOpacity onPress={() => { setLoading(true); fetchTeachers().finally(() => setLoading(false)); }}>
                <Text style={styles.retryText}>Réessayer</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Recherche */}
        <View style={styles.searchBar}>
          <Feather name="search" size={rs(16)} color={C.textMuted} />
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Rechercher un professeur..."
            placeholderTextColor={C.textMuted}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={rs(16)} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* En-tête liste */}
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderTitle}>Enseignants</Text>
          {profs.length > 0 && (
            <Text style={styles.listHeaderCount}>{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</Text>
          )}
        </View>

        {/* Liste enseignants */}
        <ScrollView
          style={styles.listScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
        >
          {filtered.length === 0 && !error && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Feather name="users" size={rs(28)} color={C.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {profs.length === 0 ? "Aucun enseignant assigné" : "Aucun résultat"}
              </Text>
              <Text style={styles.emptyText}>
                {profs.length === 0
                  ? "Contactez l'administrateur pour assigner des enseignants."
                  : "Essayez avec un autre terme de recherche."}
              </Text>
            </View>
          )}
          {filtered.map((prof, i) => (
            <View key={prof.id} style={styles.profCard}>
              <View style={styles.profCardTop}>
                <View style={[styles.avatar, { backgroundColor: avatarBg(prof) }]}>
                  <Text style={[styles.avatarText, { color: avatarColor(prof) }]}>{prof.initiales}</Text>
                </View>
                <View style={styles.profInfo}>
                  <Text style={styles.profName}>{prof.nom}</Text>
                  <View style={styles.profMetaRow}>
                    <Feather name="book-open" size={rf(11)} color={C.textMuted} />
                    <Text style={styles.profClasse}>{prof.classe}</Text>
                    {prof.present !== null && (
                      <View style={[styles.profStatusPill, prof.present ? styles.profStatusPresent : styles.profStatusAbsent]}>
                        <Text style={[styles.profStatusTxt, { color: prof.present ? C.success : C.danger }]}>
                          {prof.present ? "Présent" : "Absent"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              {prof.present === false && prof.motif && (
                <View style={styles.motifRow}>
                  <Feather name="file-text" size={rf(11)} color={C.danger} />
                  <Text style={styles.motifRowTxt} numberOfLines={1}>{prof.motif}</Text>
                </View>
              )}
              <View style={styles.profActions}>
                <TouchableOpacity
                  onPress={() => markPresent(prof.id)}
                  disabled={locked}
                  activeOpacity={0.7}
                  style={[styles.actionBtn, styles.actionBtnPresent, prof.present === true && styles.actionBtnPresentActive]}
                >
                  <Feather name="check" size={rf(14)} color={prof.present === true ? "#fff" : C.success} />
                  <Text style={[styles.actionBtnTxt, styles.actionBtnTxtPresent, prof.present === true && styles.actionBtnTxtPresentActive]}>Présent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openMotifModal(prof)}
                  disabled={locked}
                  activeOpacity={0.7}
                  style={[styles.actionBtn, styles.actionBtnAbsent, prof.present === false && styles.actionBtnAbsentActive]}
                >
                  <Feather name="x" size={rf(14)} color={prof.present === false ? "#fff" : C.danger} />
                  <Text style={[styles.actionBtnTxt, styles.actionBtnTxtAbsent, prof.present === false && styles.actionBtnTxtAbsentActive]}>Absent</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <View style={{ height: rs(16) }} />
        </ScrollView>

        {/* Bouton valider */}
        <View style={styles.validateWrap}>
          <TouchableOpacity
            onPress={locked ? undefined : handleValidate}
            disabled={validating || defined === 0 || locked}
            activeOpacity={0.8}
            style={[
              styles.validateBtn,
              locked && styles.validateBtnLocked,
              (validating || defined === 0) && !locked && styles.validateBtnDisabled,
            ]}
          >
            {validating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather
                  name={locked ? "check-circle" : isOnline ? "send" : "upload-cloud"}
                  size={rf(16)}
                  color={(defined === 0 && !locked) ? C.textMuted : "#fff"}
                  style={{ marginRight: rs(8) }}
                />
                <Text style={[styles.validateText, (defined === 0 && !locked) && styles.validateTextDisabled]}>
                  {locked
                    ? "Présences validées"
                    : isOnline
                      ? `Valider les présences${defined > 0 ? ` (${defined}/${profs.length})` : ""}`
                      : `Enregistrer hors-ligne${defined > 0 ? ` (${defined}/${profs.length})` : ""}`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Profile sheet ── */}
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* ── Modal succès ── */}
      <Modal visible={validated} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <Feather name={isOnline ? "check" : "clock"} size={rs(28)} color={C.success} />
            </View>
            <Text style={styles.successTitle}>
              {isOnline ? "Présences validées !" : "Enregistré hors-ligne !"}
            </Text>
            <Text style={styles.successSub}>
              {presentsCount} présent{presentsCount !== 1 ? "s" : ""} · {absentsCount} absent{absentsCount !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
      </Modal>

      {/* ── Modal justification d'absence ── */}
      <Modal visible={!!motifTarget} transparent animationType="slide" statusBarTranslucent onRequestClose={closeMotifModal}>
        <KeyboardAvoidingView
          style={styles.motifOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { Keyboard.dismiss(); closeMotifModal(); }} />

          <View style={[styles.motifSheet, { paddingBottom: Math.max(insets.bottom, rs(16)) }]}>
            <View style={styles.motifHandle} />

            {/* Header fixe */}
            <View style={styles.motifHeader}>
              <View style={styles.motifHeaderIcon}>
                <Feather name="user-x" size={rf(20)} color={C.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.motifTitle}>Marquer absent</Text>
                <Text style={styles.motifName} numberOfLines={1}>{motifTarget?.nom}</Text>
              </View>
              <TouchableOpacity onPress={closeMotifModal} style={styles.motifCloseBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={rf(18)} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.motifSectionLabel}>Motif de l'absence</Text>

            {/* Liste des motifs — scrollable */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.motifScrollContent}
            >
              {MOTIFS.map(m => {
                const sel = motifChoice === m.label;
                return (
                  <TouchableOpacity
                    key={m.label}
                    onPress={() => { setMotifChoice(m.label); setMotifCustom(""); Keyboard.dismiss(); }}
                    activeOpacity={0.7}
                    style={[styles.motifOption, sel && styles.motifOptionSel]}
                  >
                    <View style={[styles.motifOptionIcon, sel && styles.motifOptionIconSel]}>
                      <Feather name={m.icon} size={rf(16)} color={sel ? "#fff" : C.textMuted} />
                    </View>
                    <Text style={[styles.motifOptionTxt, sel && styles.motifOptionTxtSel]}>{m.label}</Text>
                    {sel && (
                      <View style={styles.motifCheckCircle}>
                        <Feather name="check" size={rf(12)} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* Autre motif */}
              <TouchableOpacity
                onPress={() => setMotifChoice("__custom")}
                activeOpacity={0.7}
                style={[styles.motifOption, styles.motifOptionCustom, motifChoice === "__custom" && styles.motifOptionSel]}
              >
                <View style={[styles.motifOptionIcon, motifChoice === "__custom" && styles.motifOptionIconSel]}>
                  <Feather name="edit-3" size={rf(16)} color={motifChoice === "__custom" ? "#fff" : C.textMuted} />
                </View>
                <Text style={[styles.motifOptionTxt, motifChoice === "__custom" && styles.motifOptionTxtSel]}>Autre motif…</Text>
              </TouchableOpacity>

              {/* Champ texte libre — directement sous "Autre motif" */}
              {motifChoice === "__custom" && (
                <View style={styles.motifInputWrap}>
                  <TextInput
                    value={motifCustom}
                    onChangeText={setMotifCustom}
                    placeholder="Précisez le motif de l'absence…"
                    placeholderTextColor={C.textMuted}
                    multiline
                    style={styles.motifInput}
                    autoFocus
                    scrollEnabled={false}
                  />
                </View>
              )}
            </ScrollView>

            {/* Boutons fixes en bas */}
            <View style={styles.motifActions}>
              <TouchableOpacity onPress={closeMotifModal} style={styles.motifCancelBtn} activeOpacity={0.7}>
                <Text style={styles.motifCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmAbsent}
                disabled={!motifChoice || (motifChoice === "__custom" && !motifCustom.trim())}
                activeOpacity={0.8}
                style={[
                  styles.motifConfirmBtn,
                  (!motifChoice || (motifChoice === "__custom" && !motifCustom.trim())) && styles.motifConfirmBtnDisabled,
                ]}
              >
                <Feather name="check" size={rf(16)} color={(!motifChoice || (motifChoice === "__custom" && !motifCustom.trim())) ? C.textMuted : "#fff"} style={{ marginRight: rs(6) }} />
                <Text style={[styles.motifConfirmTxt, (!motifChoice || (motifChoice === "__custom" && !motifCustom.trim())) && { color: C.textMuted }]}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  content:      { flex: 1, paddingHorizontal: rs(16), paddingTop: rs(8) },
  center:       { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: rs(12) },
  loadingText:  { fontSize: rf(16), color: C.textMuted, marginTop: rs(8) },

  /* Hero card */
  heroCard:        { backgroundColor: C.brand, borderRadius: rs(20), padding: rs(18), marginBottom: rs(14) },
  heroTop:         { flexDirection: "row", alignItems: "flex-start", marginBottom: rs(14) },
  heroDate:        { fontSize: rf(12), color: "rgba(255,255,255,0.7)", fontWeight: "600", textTransform: "capitalize" },
  heroGreet:       { fontSize: rf(20), fontWeight: "800", color: "#fff", marginTop: rs(2) },
  heroIconWrap:    { width: rs(44), height: rs(44), borderRadius: rs(14), backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  heroProgressWrap:{ flexDirection: "row", alignItems: "center", gap: rs(10), marginBottom: rs(14) },
  heroProgressBg:  { flex: 1, height: rs(6), backgroundColor: "rgba(255,255,255,0.2)", borderRadius: rs(3), overflow: "hidden" },
  heroProgressFill:{ height: "100%", backgroundColor: "#fff", borderRadius: rs(3) },
  heroProgressTxt: { fontSize: rf(12), color: "rgba(255,255,255,0.8)", fontWeight: "700", minWidth: rs(70), textAlign: "right" },
  heroStatsRow:    { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: rs(12), paddingVertical: rs(10) },
  heroStat:        { flex: 1, alignItems: "center", gap: rs(2) },
  heroStatDot:     { width: rs(8), height: rs(8), borderRadius: rs(4), marginBottom: rs(2) },
  heroStatVal:     { fontSize: rf(20), fontWeight: "800", color: "#fff" },
  heroStatLbl:     { fontSize: rf(11), color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  heroStatDivider: { width: 1, height: rs(28), backgroundColor: "rgba(255,255,255,0.15)" },

  /* Error */
  errorBanner:  { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.dangerSoft, borderRadius: rs(12), padding: rs(12), marginBottom: rs(10) },
  warnBanner:   { backgroundColor: "#FFF8E6", borderColor: "#F5D87A", borderWidth: 1 },
  errorText:    { flex: 1, fontSize: rf(13), color: C.danger },
  warnText:     { color: C.warn },
  retryText:    { fontSize: rf(13), fontWeight: "700", color: C.danger, textDecorationLine: "underline" },

  /* Search */
  searchBar:    { flexDirection: "row", alignItems: "center", gap: rs(10), backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14), paddingHorizontal: rs(14), paddingVertical: rs(11), marginBottom: rs(12) },
  searchInput:  { flex: 1, color: C.text, fontSize: rf(15) },

  /* List header */
  listHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: rs(8) },
  listHeaderTitle: { fontSize: rf(14), fontWeight: "800", color: C.brand, textTransform: "uppercase", letterSpacing: 0.6 },
  listHeaderCount: { fontSize: rf(13), color: C.textMuted, fontWeight: "600" },

  /* List scroll */
  listScroll: { flex: 1 },

  /* Empty */
  emptyState:   { alignItems: "center", justifyContent: "center", paddingVertical: rs(40), gap: rs(10) },
  emptyIconWrap:{ width: rs(56), height: rs(56), borderRadius: rs(28), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center", marginBottom: rs(4) },
  emptyTitle:   { fontSize: rf(16), fontWeight: "700", color: C.text },
  emptyText:    { fontSize: rf(14), color: C.textMuted, textAlign: "center", lineHeight: rf(20), paddingHorizontal: rs(24) },

  /* Prof card */
  profCard:       { backgroundColor: C.surface, borderRadius: rs(14), borderWidth: 1, borderColor: C.border, padding: rs(14), marginBottom: rs(8) },
  profCardTop:    { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(10) },
  avatar:         { width: rs(42), height: rs(42), borderRadius: rs(21), alignItems: "center", justifyContent: "center" },
  avatarText:     { fontSize: rf(14), fontWeight: "700" },
  profInfo:       { flex: 1 },
  profName:       { fontSize: rf(15), fontWeight: "700", color: C.text, marginBottom: rs(3) },
  profMetaRow:    { flexDirection: "row", alignItems: "center", gap: rs(5) },
  profClasse:     { fontSize: rf(12), color: C.textMuted, fontWeight: "500" },
  profStatusPill: { marginLeft: rs(6), paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: rs(10) },
  profStatusPresent: { backgroundColor: C.successSoft },
  profStatusAbsent:  { backgroundColor: C.dangerSoft },
  profStatusTxt:  { fontSize: rf(11), fontWeight: "700" },

  /* Action buttons */
  profActions:    { flexDirection: "row", gap: rs(8) },
  actionBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(6), paddingVertical: rs(10), borderRadius: rs(10), borderWidth: 1.5 },
  actionBtnPresent:       { borderColor: C.success + "55", backgroundColor: C.successSoft },
  actionBtnPresentActive: { backgroundColor: C.success, borderColor: C.success },
  actionBtnAbsent:        { borderColor: C.danger + "55", backgroundColor: C.dangerSoft },
  actionBtnAbsentActive:  { backgroundColor: C.danger, borderColor: C.danger },
  actionBtnTxt:           { fontSize: rf(13), fontWeight: "700" },
  actionBtnTxtPresent:       { color: C.success },
  actionBtnTxtPresentActive: { color: "#fff" },
  actionBtnTxtAbsent:        { color: C.danger },
  actionBtnTxtAbsentActive:  { color: "#fff" },

  /* Validate */
  validateWrap: { paddingVertical: rs(10) },
  validateBtn:         { backgroundColor: C.brand, paddingVertical: rs(15), borderRadius: rs(14), flexDirection: "row", alignItems: "center", justifyContent: "center" },
  validateBtnLocked:   { backgroundColor: C.success },
  validateBtnDisabled: { backgroundColor: C.surfaceAlt },
  validateText:        { color: "#fff", fontSize: rf(16), fontWeight: "700" },
  validateTextDisabled:{ color: C.textMuted },

  /* Motif row on prof card */
  motifRow:    { flexDirection: "row", alignItems: "center", gap: rs(5), marginBottom: rs(8), paddingHorizontal: rs(2) },
  motifRowTxt: { fontSize: rf(12), color: C.danger, fontWeight: "600", flex: 1 },

  /* Success modal */
  overlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  successCard:  { backgroundColor: C.surface, borderRadius: rs(24), padding: rs(32), alignItems: "center", gap: rs(14), marginHorizontal: rs(24) },
  successIcon:  { width: rs(64), height: rs(64), borderRadius: rs(32), backgroundColor: C.successSoft, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: rf(19), fontWeight: "700", color: C.text },
  successSub:   { fontSize: rf(15), color: C.textMuted },

  /* Motif modal — bottom sheet */
  motifOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  motifSheet:      {
    backgroundColor: C.surface,
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    paddingHorizontal: rs(20),
    paddingTop: rs(12),
    maxHeight: "85%",
  },
  motifHandle:     { width: rs(40), height: rs(5), borderRadius: rs(3), backgroundColor: C.border, alignSelf: "center", marginBottom: rs(14) },
  motifHeader:     { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(16) },
  motifHeaderIcon: { width: rs(46), height: rs(46), borderRadius: rs(14), backgroundColor: C.dangerSoft, alignItems: "center", justifyContent: "center" },
  motifTitle:      { fontSize: rf(17), fontWeight: "800", color: C.text },
  motifName:       { fontSize: rf(14), color: C.textMuted, fontWeight: "500", marginTop: rs(1) },
  motifCloseBtn:   { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  motifSectionLabel: { fontSize: rf(12), fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: rs(10) },
  motifScrollContent: { gap: rs(8), paddingBottom: rs(4) },
  motifOption:     {
    flexDirection: "row", alignItems: "center", gap: rs(12),
    paddingVertical: rs(13), paddingHorizontal: rs(14),
    borderRadius: rs(14), borderWidth: 1.5,
    borderColor: C.border, backgroundColor: C.surface,
  },
  motifOptionCustom: { borderColor: C.textMuted + "44" },
  motifOptionSel:  { borderColor: C.danger, backgroundColor: C.dangerSoft },
  motifOptionIcon: { width: rs(36), height: rs(36), borderRadius: rs(11), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  motifOptionIconSel: { backgroundColor: C.danger },
  motifOptionTxt:  { flex: 1, fontSize: rf(15), fontWeight: "600", color: C.text },
  motifOptionTxtSel: { color: C.danger, fontWeight: "700" },
  motifCheckCircle:{ width: rs(24), height: rs(24), borderRadius: rs(12), backgroundColor: C.danger, alignItems: "center", justifyContent: "center" },
  motifInputWrap:  { marginTop: rs(4) },
  motifInput:      {
    borderWidth: 1.5, borderColor: C.danger + "55",
    borderRadius: rs(14), padding: rs(14),
    fontSize: rf(15), color: C.text,
    minHeight: rs(90), textAlignVertical: "top",
    backgroundColor: C.bg,
  },
  motifActions:    {
    flexDirection: "row", gap: rs(10),
    paddingTop: rs(14), paddingBottom: rs(4),
    borderTopWidth: 1, borderTopColor: C.border, marginTop: rs(8),
  },
  motifCancelBtn:  { flex: 1, paddingVertical: rs(14), borderRadius: rs(14), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  motifCancelTxt:  { fontSize: rf(15), fontWeight: "700", color: C.textMuted },
  motifConfirmBtn: { flex: 1.5, paddingVertical: rs(14), borderRadius: rs(14), backgroundColor: C.danger, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  motifConfirmBtnDisabled: { backgroundColor: C.surfaceAlt },
  motifConfirmTxt: { fontSize: rf(15), fontWeight: "700", color: "#fff" },

});
