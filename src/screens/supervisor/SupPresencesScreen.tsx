import React, { useState, useEffect, useCallback, useRef } from "react";
import { trackUsage } from "../../services/usage";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Animated, Modal, ActivityIndicator, RefreshControl,
  Platform, Keyboard,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import TourTarget from "../../components/TourTarget";

interface Prof {
  id:        string;
  nom:       string;
  classe:    string;
  present:   boolean | null;
  motif:     string | null;
  initiales: string;
  last_rapport_date: string | null;
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

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function SupPresencesScreen() {
  useEffect(() => { trackUsage("presences").catch(() => {}); }, []);
  const insets = useSafeAreaInsets();
  const { user, isOnline, syncOffline } = useStore();

  const [profs,       setProfs]       = useState<Prof[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [validated,   setValidated]   = useState(false);
  const [validating,  setValidating]  = useState(false);
  const [locked,      setLocked]      = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [recapOpen,    setRecapOpen]    = useState(false);

  /* ── Nombre de semaines/jours du programme (même config que la partie tuteur) ── */
  const [nbSemaines, setNbSemaines] = useState(10);
  const [nbJours,    setNbJours]    = useState(3);
  const JOURS_NUM = React.useMemo(
    () => Array.from({ length: nbJours }, (_, i) => `Jour ${i + 1}`),
    [nbJours]
  );

  /* ── Période (Semaine + Jour) choisie avant le pointage ── */
  const [periode, setPeriode] = useState<{ semaine: number; jour: number } | null>(null);
  const [draftSemaine, setDraftSemaine] = useState<number | null>(null);
  const [draftJour, setDraftJour] = useState<number>(0);

  useEffect(() => {
    AsyncStorage.getItem(`sup-periode-${todayIso()}`)
      .then(raw => {
        if (raw) {
          const p = JSON.parse(raw);
          setPeriode(p);
          setDraftSemaine(p.semaine);
          setDraftJour(p.jour);
        }
      })
      .catch(() => {});
  }, []);

  const confirmPeriode = () => {
    if (draftSemaine === null) return;
    const p = { semaine: draftSemaine, jour: draftJour };
    setPeriode(p);
    AsyncStorage.setItem(`sup-periode-${todayIso()}`, JSON.stringify(p)).catch(() => {});
  };

  const [motifTarget,  setMotifTarget]  = useState<Prof | null>(null);
  const [motifChoice,  setMotifChoice]  = useState<string | null>(null);
  const [motifCustom,  setMotifCustom]  = useState("");
  const motifSheetAnim  = useRef(new Animated.Value(0)).current;
  const [keyboardH,    setKeyboardH]    = useState(0);

  // Suivi de la hauteur du clavier pour positionner la sheet au-dessus
  useEffect(() => {
    const TAB_H = rs(58) + insets.bottom;
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardH(Math.max(0, e.endCoordinates.height - TAB_H)),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardH(0),
    );
    return () => { show.remove(); hide.remove(); };
  }, [insets.bottom]);

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

        const rawTeachers: { id: string; name: string; classes?: string[]; last_rapport_date?: string | null }[] =
          data.assigned_teachers ?? [];

        setNbSemaines(data.nb_semaines ?? 10);
        setNbJours(data.nb_jours ?? 3);

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
            last_rapport_date: t.last_rapport_date ?? null,
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
        last_rapport_date: null,
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
        last_rapport_date: null,
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
    motifSheetAnim.setValue(0);
    Animated.spring(motifSheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const closeMotifModal = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(motifSheetAnim, { toValue: 0, duration: 220, useNativeDriver: true })
      .start(() => {
        setMotifTarget(null);
        setMotifChoice(null);
        setMotifCustom("");
      });
  }, [motifSheetAnim]);

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

    const periodePayload = { semaine: periode?.semaine ?? null, jour_cours: periode?.jour ?? null };

    if (isOnline) {
      try {
        await superviseurApi.submitPresenceCheck(dateJour, entries, periodePayload);
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
      enqueueAction("SUBMIT_PRESENCE_CHECK", { date_jour: dateJour, entries, ...periodePayload });
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

  /* ── Auto-validation : dès que tous les enseignants du jour sont pointés,
     on soumet automatiquement et on bascule vers l'écran récapitulatif,
     sans action manuelle supplémentaire. ── */
  useEffect(() => {
    if (!loading && !locked && !validating && profs.length > 0 && defined === profs.length) {
      handleValidate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defined, profs.length, locked, validating, loading]);

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
        sectionLabel="Espace Superviseur"
      />

      {/* ── Contenu principal ── */}
      <View style={styles.content}>

        {/* ── En-tête du jour — une seule lecture : qui, quand, où en est-on ── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroGreet}>Bonjour, {user?.name ?? "Superviseur"}</Text>
          <Text style={styles.heroDate}>{todayCapital}</Text>

          <View style={styles.heroProgressBg}>
            <View style={[styles.heroProgressFill, { width: `${progressPct}%` as any }]} />
          </View>
          <Text style={styles.heroProgressTxt}>
            {defined}/{profs.length} pointé{defined > 1 ? "s" : ""}
            {presentsCount > 0 && ` · ${presentsCount} présent${presentsCount > 1 ? "s" : ""}`}
            {absentsCount  > 0 && ` · ${absentsCount} absent${absentsCount > 1 ? "s" : ""}`}
          </Text>
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

        {!locked && !periode ? (
          /* ── Étape préalable : choix de la période (Semaine + Jour) ── */
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={styles.periodeCard}>
              <View style={styles.periodeHeader}>
                <Feather name="calendar" size={rf(17)} color={C.brand} />
                <Text style={styles.periodeTitle}>Quelle période pointez-vous ?</Text>
              </View>

              <Text style={styles.periodeLabel}>Semaine</Text>
              <View style={styles.periodeGrid}>
                {Array.from({ length: nbSemaines }, (_, i) => i + 1).map(n => {
                  const sel = draftSemaine === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[styles.periodeCell, sel && styles.periodeCellSel]}
                      onPress={() => setDraftSemaine(n)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.periodeCellTxt, sel && styles.periodeCellTxtSel]}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.periodeLabel, { marginTop: rs(14) }]}>Jour</Text>
              <View style={styles.periodeGrid}>
                {JOURS_NUM.map((j, i) => {
                  const sel = draftJour === i;
                  return (
                    <TouchableOpacity
                      key={j}
                      style={[styles.periodeJour, sel && styles.periodeCellSel]}
                      onPress={() => setDraftJour(i)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.periodeCellTxt, sel && styles.periodeCellTxtSel]}>{j}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.periodeBtn, draftSemaine === null && styles.periodeBtnDisabled]}
                onPress={confirmPeriode}
                disabled={draftSemaine === null}
                activeOpacity={0.85}
              >
                <Feather name="check" size={rf(15)} color="#fff" />
                <Text style={styles.periodeBtnTxt}>Commencer le pointage</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : locked ? (
          /* ── État validé : card de complétion uniquement ── */
          <View style={styles.doneCard}>
            <View style={styles.doneTop}>
              <View style={styles.doneIconWrap}>
                <Feather name="check-circle" size={rf(22)} color={C.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.doneTitle}>Présences validées</Text>
                <Text style={styles.doneSub}>
                  {presentsCount} présent{presentsCount !== 1 ? "s" : ""} · {absentsCount} absent{absentsCount !== 1 ? "s" : ""}
                </Text>
                <Text style={styles.doneSub}>{todayCapital}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setRecapOpen(true)} activeOpacity={0.7} style={styles.doneBtn}>
              <Text style={styles.doneBtnTxt}>Voir plus</Text>
              <Feather name="chevron-right" size={rf(14)} color={C.brand} />
            </TouchableOpacity>
          </View>
        ) : (
          /* ── État non validé : liste + bouton ── */
          <>
            {/* Une seule ligne de contexte : période choisie + effectif */}
            <View style={styles.listHeader}>
              {periode ? (
                <TouchableOpacity
                  style={styles.periodePill}
                  onPress={() => setPeriode(null)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="calendar" size={rf(12)} color={C.brand} />
                  <Text style={styles.periodePillTxt}>
                    Semaine {periode.semaine} · {JOURS_NUM[periode.jour]}
                  </Text>
                  <Feather name="edit-2" size={rf(11)} color={C.brand} />
                </TouchableOpacity>
              ) : <View />}
              {profs.length > 0 && (
                <Text style={styles.listHeaderCount}>{profs.length} enseignant{profs.length > 1 ? "s" : ""}</Text>
              )}
            </View>

            {/* Liste enseignants */}
            <TourTarget id="sup.presences.liste" style={{ flex: 1 }}>
            <ScrollView
              style={styles.listScroll}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
            >
              {profs.length === 0 && !error && (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <Feather name="users" size={rs(28)} color={C.textMuted} />
                  </View>
                  <Text style={styles.emptyTitle}>Aucun enseignant assigné</Text>
                  <Text style={styles.emptyText}>
                    Contactez l'administrateur pour assigner des enseignants.
                  </Text>
                </View>
              )}
              {profs.map((prof, i) => {
                const days = daysSince(prof.last_rapport_date);
                const noRapport = days === null || days >= 3;
                return (
                /* Toucher la carte marque présent tant que l'enseignant n'est
                   pas encore pointé — un choix « Absent » déjà fait n'est
                   jamais écrasé par une tape involontaire. */
                <TouchableOpacity
                  key={prof.id}
                  style={styles.profCard}
                  activeOpacity={locked || prof.present !== null ? 1 : 0.7}
                  onPress={() => { if (!locked && prof.present === null) markPresent(prof.id); }}
                >
                  <View style={styles.profCardTop}>
                    <View style={[styles.avatar, { backgroundColor: avatarBg(prof) }]}>
                      <Text style={[styles.avatarText, { color: avatarColor(prof) }]}>{prof.initiales}</Text>
                    </View>
                    <View style={styles.profInfo}>
                      <Text style={styles.profName} numberOfLines={1}>{prof.nom}</Text>
                      <Text style={styles.profMeta} numberOfLines={1}>
                        {prof.classe}
                        {noRapport && (days === null
                          ? "  ·  ⚠ aucun rapport"
                          : `  ·  ⚠ rapport il y a ${days} j`)}
                        {prof.present === false && prof.motif ? `  ·  ${prof.motif}` : ""}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.profActions}>
                    <TouchableOpacity
                      onPress={() => markPresent(prof.id)}
                      disabled={locked}
                      activeOpacity={0.7}
                      style={[styles.actionBtn, prof.present === true && styles.actionBtnPresentActive]}
                    >
                      <Feather name="check" size={rf(14)} color={prof.present === true ? "#fff" : C.success} />
                      <Text style={[styles.actionBtnTxt, { color: prof.present === true ? "#fff" : C.success }]}>Présent</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openMotifModal(prof)}
                      disabled={locked}
                      activeOpacity={0.7}
                      style={[styles.actionBtn, prof.present === false && styles.actionBtnAbsentActive]}
                    >
                      <Feather name="x" size={rf(14)} color={prof.present === false ? "#fff" : C.danger} />
                      <Text style={[styles.actionBtnTxt, { color: prof.present === false ? "#fff" : C.danger }]}>Absent</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                );
              })}
              <View style={{ height: rs(16) }} />
            </ScrollView>
            </TourTarget>

            {/* Bouton valider */}
            <View style={styles.validateWrap}>
              <TouchableOpacity
                onPress={handleValidate}
                disabled={validating || defined === 0}
                activeOpacity={0.8}
                style={[
                  styles.validateBtn,
                  (validating || defined === 0) && styles.validateBtnDisabled,
                ]}
              >
                {validating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather
                      name={isOnline ? "send" : "upload-cloud"}
                      size={rf(16)}
                      color={defined === 0 ? C.textMuted : "#fff"}
                      style={{ marginRight: rs(8) }}
                    />
                    <Text style={[styles.validateText, defined === 0 && styles.validateTextDisabled]}>
                      {isOnline ? "Valider" : "Enregistrer hors-ligne"}
                      {defined > 0 ? ` (${defined}/${profs.length})` : ""}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
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

      {/* ── Sheet motif d'absence inline (ne couvre pas la tab bar) ── */}
      {!!motifTarget && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.motifOverlay, { opacity: motifSheetAnim }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeMotifModal} />
          {/* Wrapper unique : positionné en absolu, bottom = dessus du clavier */}
          <Animated.View style={[
            styles.motifSheetWrap,
            {
              bottom: keyboardH,
              transform: [{ translateY: motifSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }],
            },
          ]}>
            {/* Contenu : handle + header + liste ou champ */}
            <View style={styles.motifSheet}>
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

              {motifChoice === "__custom" ? (
                /* ── Mode saisie libre : liste masquée, champ en plein écran ── */
                <View style={styles.motifCustomMode}>
                  <TouchableOpacity
                    onPress={() => { setMotifChoice(null); setMotifCustom(""); }}
                    style={styles.motifBackBtn}
                    activeOpacity={0.7}
                  >
                    <Feather name="arrow-left" size={rf(14)} color={C.brand} />
                    <Text style={styles.motifBackTxt}>Choisir un motif prédéfini</Text>
                  </TouchableOpacity>
                  <Text style={styles.motifSectionLabel}>Décrivez le motif</Text>
                  <TextInput
                    value={motifCustom}
                    onChangeText={setMotifCustom}
                    placeholder="Précisez le motif de l'absence…"
                    placeholderTextColor={C.textMuted}
                    multiline
                    style={styles.motifInput}
                    autoFocus
                    textAlignVertical="top"
                  />
                </View>
              ) : (
                /* ── Mode liste des motifs prédéfinis ── */
                <>
                  <Text style={styles.motifSectionLabel}>Motif de l'absence</Text>
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
                    <TouchableOpacity
                      onPress={() => setMotifChoice("__custom")}
                      activeOpacity={0.7}
                      style={[styles.motifOption, styles.motifOptionCustom]}
                    >
                      <View style={styles.motifOptionIcon}>
                        <Feather name="edit-3" size={rf(16)} color={C.textMuted} />
                      </View>
                      <Text style={styles.motifOptionTxt}>Autre motif…</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </>
              )}
            </View>

            {/* Footer boutons — toujours en bas du wrapper = juste au-dessus du clavier */}
            <View style={styles.motifFooter}>
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
          </Animated.View>
        </Animated.View>
      )}

      {/* ── Modal récapitulatif des présences ── */}
      <Modal visible={recapOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setRecapOpen(false)}>
        <View style={styles.motifOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setRecapOpen(false)} />

          <View style={[styles.recapSheet, { paddingBottom: Math.max(insets.bottom, rs(16)) }]}>
            <View style={styles.motifHandle} />

            <View style={styles.recapHeader}>
              <View style={styles.recapHeaderIcon}>
                <Feather name="clipboard" size={rf(20)} color={C.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.motifTitle}>Récapitulatif</Text>
                <Text style={styles.motifName}>{todayCapital}</Text>
              </View>
              <TouchableOpacity onPress={() => setRecapOpen(false)} style={styles.motifCloseBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x" size={rf(18)} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Stats résumé */}
            <View style={styles.recapStats}>
              <View style={styles.recapStatBox}>
                <Text style={[styles.recapStatVal, { color: C.success }]}>{presentsCount}</Text>
                <Text style={styles.recapStatLbl}>Présent{presentsCount !== 1 ? "s" : ""}</Text>
              </View>
              <View style={styles.recapStatBox}>
                <Text style={[styles.recapStatVal, { color: C.danger }]}>{absentsCount}</Text>
                <Text style={styles.recapStatLbl}>Absent{absentsCount !== 1 ? "s" : ""}</Text>
              </View>
              <View style={styles.recapStatBox}>
                <Text style={[styles.recapStatVal, { color: C.textMuted }]}>{profs.length}</Text>
                <Text style={styles.recapStatLbl}>Total</Text>
              </View>
            </View>

            {/* Liste des enseignants */}
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ paddingBottom: rs(8) }}>
              {profs.filter(p => p.present !== null).map(prof => (
                <View key={prof.id} style={styles.recapRow}>
                  <View style={[styles.recapAvatar, { backgroundColor: prof.present ? C.successSoft : C.dangerSoft }]}>
                    <Text style={[styles.recapAvatarTxt, { color: prof.present ? C.success : C.danger }]}>{prof.initiales}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recapProfName}>{prof.nom}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: rs(6), marginTop: rs(2) }}>
                      <View style={[styles.recapPill, prof.present ? styles.recapPillPresent : styles.recapPillAbsent]}>
                        <Feather name={prof.present ? "check" : "x"} size={rf(10)} color={prof.present ? C.success : C.danger} />
                        <Text style={{ fontSize: rf(11), fontWeight: "700", color: prof.present ? C.success : C.danger }}>
                          {prof.present ? "Présent" : "Absent"}
                        </Text>
                      </View>
                      {prof.present === false && prof.motif && (
                        <Text style={styles.recapMotif} numberOfLines={1}>{prof.motif}</Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity onPress={() => setRecapOpen(false)} activeOpacity={0.8} style={styles.recapCloseBtn}>
              <Text style={styles.recapCloseTxt}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },

  /* Sélecteur de période */
  periodeCard: {
    backgroundColor: C.surface, borderRadius: rs(16), padding: rs(16),
    borderWidth: 1, borderColor: C.border, marginBottom: rs(12),
  },
  periodeHeader: { flexDirection: "row", alignItems: "center", gap: rs(8), marginBottom: rs(14) },
  periodeTitle:  { fontSize: rf(16), fontWeight: "800", color: C.text },
  periodeLabel:  { fontSize: rf(12), fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: rs(8) },
  periodeGrid:   { flexDirection: "row", flexWrap: "wrap", gap: rs(6) },
  periodeCell: {
    width: rs(40), height: rs(36), borderRadius: rs(10),
    backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.border,
  },
  periodeJour: {
    paddingHorizontal: rs(12), height: rs(36), borderRadius: rs(10),
    backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.border,
  },
  periodeCellSel:    { backgroundColor: C.brand, borderColor: C.brand },
  periodeCellTxt:    { fontSize: rf(13), fontWeight: "700", color: C.text },
  periodeCellTxtSel: { color: "#fff" },
  periodeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8),
    backgroundColor: C.brand, borderRadius: rs(13), paddingVertical: rs(13), marginTop: rs(16),
  },
  periodeBtnDisabled: { opacity: 0.45 },
  periodeBtnTxt: { fontSize: rf(14), fontWeight: "800", color: "#fff" },
  periodePill: {
    flexDirection: "row", alignItems: "center", gap: rs(6),
    backgroundColor: C.brandSoft,
    borderRadius: rs(20), paddingHorizontal: rs(10), paddingVertical: rs(5),
  },
  periodePillTxt: { fontSize: rf(12), fontWeight: "700", color: C.brand },

  content:      { flex: 1, paddingHorizontal: rs(16), paddingTop: rs(8) },
  center:       { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", gap: rs(12) },
  loadingText:  { fontSize: rf(16), color: C.textMuted, marginTop: rs(8) },

  /* En-tête du jour */
  heroCard:        { backgroundColor: C.brand, borderRadius: rs(16), paddingHorizontal: rs(14), paddingVertical: rs(12), marginBottom: rs(10) },
  heroGreet:       { fontSize: rf(16), fontWeight: "800", color: "#fff" },
  heroDate:        { fontSize: rf(11), color: "rgba(255,255,255,0.7)", fontWeight: "600", textTransform: "capitalize", marginTop: rs(1), marginBottom: rs(10) },
  heroProgressBg:  { height: rs(5), backgroundColor: "rgba(255,255,255,0.2)", borderRadius: rs(3), overflow: "hidden" },
  heroProgressFill:{ height: "100%", backgroundColor: "#fff", borderRadius: rs(3) },
  heroProgressTxt: { fontSize: rf(12), color: "rgba(255,255,255,0.85)", fontWeight: "700", marginTop: rs(6) },

  /* Error */
  errorBanner:  { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.dangerSoft, borderRadius: rs(12), padding: rs(12), marginBottom: rs(10) },
  warnBanner:   { backgroundColor: "#FFF8E6", borderColor: "#F5D87A", borderWidth: 1 },
  errorText:    { flex: 1, fontSize: rf(13), color: C.danger },
  warnText:     { color: C.warn },
  retryText:    { fontSize: rf(13), fontWeight: "700", color: C.danger, textDecorationLine: "underline" },

  /* Ligne de contexte au-dessus de la liste */
  listHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: rs(8), minHeight: rs(28) },
  listHeaderCount: { fontSize: rf(13), color: C.textMuted, fontWeight: "600" },

  /* List scroll */
  listScroll: { flex: 1 },

  /* Empty */
  emptyState:   { alignItems: "center", justifyContent: "center", paddingVertical: rs(40), gap: rs(10) },
  emptyIconWrap:{ width: rs(56), height: rs(56), borderRadius: rs(28), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center", marginBottom: rs(4) },
  emptyTitle:   { fontSize: rf(16), fontWeight: "700", color: C.text },
  emptyText:    { fontSize: rf(14), color: C.textMuted, textAlign: "center", lineHeight: rf(20), paddingHorizontal: rs(24) },

  /* Carte enseignant */
  profCard:       { backgroundColor: C.surface, borderRadius: rs(14), borderWidth: 1, borderColor: C.border, padding: rs(12), marginBottom: rs(8) },
  profCardTop:    { flexDirection: "row", alignItems: "center", gap: rs(10), marginBottom: rs(10) },
  avatar:         { width: rs(40), height: rs(40), borderRadius: rs(20), alignItems: "center", justifyContent: "center" },
  avatarText:     { fontSize: rf(14), fontWeight: "700" },
  profInfo:       { flex: 1 },
  profName:       { fontSize: rf(16), fontWeight: "700", color: C.text },
  profMeta:       { fontSize: rf(12), color: C.textMuted, fontWeight: "500", marginTop: rs(2) },

  /* Boutons Présent / Absent */
  profActions:    { flexDirection: "row", gap: rs(8) },
  actionBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(6), paddingVertical: rs(9), borderRadius: rs(10), borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  actionBtnPresentActive: { backgroundColor: C.success, borderColor: C.success },
  actionBtnAbsentActive:  { backgroundColor: C.danger,  borderColor: C.danger  },
  actionBtnTxt:           { fontSize: rf(13), fontWeight: "700" },

  /* Validate */
  validateWrap: { paddingVertical: rs(10) },
  validateBtn:         { backgroundColor: C.brand, paddingVertical: rs(15), borderRadius: rs(14), flexDirection: "row", alignItems: "center", justifyContent: "center" },
  validateBtnDisabled: { backgroundColor: C.surfaceAlt },
  validateText:        { color: "#fff", fontSize: rf(16), fontWeight: "700" },
  validateTextDisabled:{ color: C.textMuted },

  /* Success modal */
  overlay:      { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  successCard:  { backgroundColor: C.surface, borderRadius: rs(24), padding: rs(32), alignItems: "center", gap: rs(14), marginHorizontal: rs(24) },
  successIcon:  { width: rs(64), height: rs(64), borderRadius: rs(32), backgroundColor: C.successSoft, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: rf(19), fontWeight: "700", color: C.text },
  successSub:   { fontSize: rf(15), color: C.textMuted },

  /* Motif modal — bottom sheet */
  motifOverlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  motifSheetWrap:  {
    position: "absolute",
    left: 0,
    right: 0,
    maxHeight: "88%",
  },
  motifSheet:      {
    backgroundColor: C.surface,
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    paddingHorizontal: rs(20),
    paddingTop: rs(12),
    paddingBottom: rs(8),
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
  motifCustomMode: { gap: rs(12) },
  motifBackBtn:    { flexDirection: "row", alignItems: "center", gap: rs(6), alignSelf: "flex-start", paddingVertical: rs(6) },
  motifBackTxt:    { fontSize: rf(13), fontWeight: "700", color: C.brand },
  motifInput:      {
    borderWidth: 1.5, borderColor: C.danger + "55",
    borderRadius: rs(14), padding: rs(14),
    fontSize: rf(15), color: C.text,
    minHeight: rs(90), textAlignVertical: "top",
    backgroundColor: C.bg,
  },
  motifFooter: {
    backgroundColor: C.surface,
    paddingHorizontal: rs(20),
    paddingTop: rs(10),
    paddingBottom: rs(16),
    flexDirection: "row",
    gap: rs(10),
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  motifCancelBtn:  { flex: 1, paddingVertical: rs(14), borderRadius: rs(14), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  motifCancelTxt:  { fontSize: rf(15), fontWeight: "700", color: C.textMuted },
  motifConfirmBtn: { flex: 1.5, paddingVertical: rs(14), borderRadius: rs(14), backgroundColor: C.danger, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  motifConfirmBtnDisabled: { backgroundColor: C.surfaceAlt },
  motifConfirmTxt: { fontSize: rf(15), fontWeight: "700", color: "#fff" },

  /* Done card */
  doneCard:     { backgroundColor: C.successSoft, borderRadius: rs(14), borderWidth: 1.5, borderColor: C.success + "44", padding: rs(20), marginTop: rs(16), marginBottom: rs(12) },
  doneTop:      { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(16) },
  doneIconWrap: { width: rs(46), height: rs(46), borderRadius: rs(23), backgroundColor: C.success + "22", alignItems: "center", justifyContent: "center" },
  doneTitle:    { fontSize: rf(16), fontWeight: "800", color: C.success },
  doneSub:      { fontSize: rf(13), color: C.textMuted, fontWeight: "500", marginTop: rs(2) },
  doneBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(6), paddingVertical: rs(12), borderRadius: rs(12), backgroundColor: C.surface },
  doneBtnTxt:   { fontSize: rf(14), fontWeight: "700", color: C.brand },

  /* Recap modal */
  recapSheet:     { backgroundColor: C.surface, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), paddingHorizontal: rs(20), paddingTop: rs(12), maxHeight: "85%" },
  recapHeader:    { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(16) },
  recapHeaderIcon:{ width: rs(46), height: rs(46), borderRadius: rs(14), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  recapStats:     { flexDirection: "row", gap: rs(10), marginBottom: rs(16) },
  recapStatBox:   { flex: 1, alignItems: "center", paddingVertical: rs(12), borderRadius: rs(12), backgroundColor: C.bg },
  recapStatVal:   { fontSize: rf(22), fontWeight: "800" },
  recapStatLbl:   { fontSize: rf(11), color: C.textMuted, fontWeight: "600", marginTop: rs(2) },
  recapRow:       { flexDirection: "row", alignItems: "center", gap: rs(12), paddingVertical: rs(10), borderBottomWidth: 1, borderBottomColor: C.border + "66" },
  recapAvatar:    { width: rs(38), height: rs(38), borderRadius: rs(19), alignItems: "center", justifyContent: "center" },
  recapAvatarTxt: { fontSize: rf(13), fontWeight: "700" },
  recapProfName:  { fontSize: rf(14), fontWeight: "700", color: C.text },
  recapPill:      { flexDirection: "row", alignItems: "center", gap: rs(3), paddingHorizontal: rs(7), paddingVertical: rs(2), borderRadius: rs(8) },
  recapPillPresent: { backgroundColor: C.successSoft },
  recapPillAbsent:  { backgroundColor: C.dangerSoft },
  recapMotif:     { fontSize: rf(11), color: C.danger, fontWeight: "600", flex: 1 },
  recapCloseBtn:  { paddingVertical: rs(14), borderRadius: rs(14), backgroundColor: C.brand, alignItems: "center", justifyContent: "center", marginTop: rs(12) },
  recapCloseTxt:  { fontSize: rf(15), fontWeight: "700", color: "#fff" },

});
