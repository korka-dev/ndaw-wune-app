/**
 * NWN-AS 2025-2026 — Rapport Journalier du Tuteur
 * Formulaire étape par étape (6 étapes).
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import * as ImagePicker from "expo-image-picker";

import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import { useStore } from "../store/useStore";
import {
  insertRapportJournalier,
  markRapportJournalierSynced,
  enqueueAction,
} from "../services/db";
import { rapportJournalierApi } from "../services/api";

// ── Constantes ─────────────────────────────────────────────────────────────

const DIFFICULTES_LIST = [
  "Gestion des groupes",
  "Gestion du temps",
  "Enseignement de la leçon de lecture",
  "Enseignement de la leçon de mathématiques",
  "Evaluation des apprentissages",
  "Aide aux élèves en difficulté",
  "Utilisation du guide",
  "Promesse Ndaw Wune",
  "Organisation de la classe",
  "Chanson de l'alphabet",
  "Utilisation du récit",
  "Jeux éducatifs",
  "Le respect de la démarche du guide",
  "Autres",
  "Aucune",
];

const TOTAL_STEPS = 4;

// ── Composants réutilisables ───────────────────────────────────────────────

function Radio({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.optRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.radioOuter, selected && s.radioSel]}>
        {selected && <View style={s.radioDot} />}
      </View>
      <Text style={[s.optLabel, selected && s.optLabelSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Check({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.optRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.checkOuter, checked && s.checkSel]}>
        {checked && <Feather name="check" size={rf(11)} color="#fff" />}
      </View>
      <Text style={[s.optLabel, checked && s.optLabelSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onBack?:    () => void;
  onSuccess?: () => void;
}

// ── Écran ──────────────────────────────────────────────────────────────────

export default function RapportJournalierScreen({ onBack, onSuccess }: Props) {
  const { syncData, isOnline } = useStore();
  const profile = syncData?.profile;
  const school  = syncData?.school;

  // ── État formulaire ────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // Étape 1 — Absences
  const [nbAbsences, setNbAbsences] = useState("0");
  const [absents,    setAbsents]    = useState("");

  // Étape 2 — Progression
  const [semaine,   setSemaine]   = useState<number | null>(null);
  const [jourCours, setJourCours] = useState<number | null>(null);

  // Étape 3 — Difficultés
  const [difficultes,            setDifficultes]            = useState<string[]>([]);
  const [autresDifficultes,      setAutresDifficultes]      = useState("");
  const [descriptionDifficultes, setDescriptionDifficultes] = useState("");

  // Étape 4 — Supervision
  const [directeurVenu, setDirecteurVenu] = useState<boolean | null>(null);
  const [besoinAppui,   setBesoinAppui]   = useState<boolean | null>(null);
  const [domainesAppui, setDomainesAppui] = useState("");

  // Étape 5 — Observations
  const [hasObservations, setHasObservations] = useState<boolean | null>(null);
  const [commentaires,    setCommentaires]    = useState("");

  // Étape 6 — Photo
  const [photoUri,    setPhotoUri]    = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Dérivés ────────────────────────────────────────────────────────────
  const nb        = parseInt(nbAbsences, 10) || 0;
  const hasAutres = difficultes.includes("Autres");
  const isAucune  = difficultes.length === 1 && difficultes[0] === "Aucune";
  const showDesc  = difficultes.length > 0 && !isAucune;

  // ── Camera ────────────────────────────────────────────────────────────
  const openCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission requise", "L'accès à l'appareil photo est nécessaire.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.55, base64: true, allowsEditing: false, exif: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      setPhotoBase64(asset.base64 ?? null);
    }
  }, []);

  const toggleDiff = useCallback((val: string) => {
    setDifficultes(prev => {
      if (val === "Aucune") return prev.includes("Aucune") ? [] : ["Aucune"];
      const wo = prev.filter(d => d !== "Aucune");
      return wo.includes(val) ? wo.filter(d => d !== val) : [...wo, val];
    });
  }, []);

  // ── Validation par étape ───────────────────────────────────────────────
  const validateStep = (s: number): string | null => {
    switch (s) {
      case 1: // Absences + Progression
        if (nb > 0 && !absents.trim()) return "Veuillez indiquer les noms des absents.";
        if (!semaine)   return "Veuillez sélectionner la semaine.";
        if (!jourCours) return "Veuillez sélectionner le jour de cours.";
        return null;
      case 2: // Difficultés
        if (difficultes.length === 0) return "Veuillez sélectionner au moins une difficulté.";
        if (hasAutres && !autresDifficultes.trim()) return "Veuillez préciser les autres difficultés.";
        if (showDesc && !descriptionDifficultes.trim()) return "Veuillez décrire les difficultés.";
        return null;
      case 3: // Supervision + Observations
        if (directeurVenu === null) return "Veuillez indiquer si le directeur est venu.";
        if (besoinAppui === null)   return "Veuillez indiquer si vous avez besoin d'appui.";
        if (besoinAppui && !domainesAppui.trim()) return "Veuillez indiquer les domaines d'appui.";
        if (hasObservations === null) return "Veuillez indiquer si vous avez des observations.";
        if (hasObservations && !commentaires.trim()) return "Veuillez rédiger vos commentaires.";
        return null;
      case 4: // Photo
        if (!photoUri) return "La photo de la classe est obligatoire.";
        return null;
      default:
        return null;
    }
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) { Alert.alert("Champ manquant", err); return; }
    if (step < TOTAL_STEPS) setStep(s => s + 1);
  };

  const goPrev = () => { if (step > 1) setStep(s => s - 1); };

  // ── Soumission ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const err = validateStep(4);
    if (err) { Alert.alert("Champ manquant", err); return; }

    setLoading(true);
    try {
      const localId   = `rj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const dateIso   = format(new Date(), "yyyy-MM-dd");
      const diffsJson = JSON.stringify(difficultes);
      const offline   = !isOnline;

      const nomTuteur   = profile?.name    ?? "";
      const ecole       = school?.name     ?? "";
      const commune     = school?.city     ?? "";
      const ief         = school?.region   ?? "";
      const superviseur = school?.director ?? "";

      insertRapportJournalier({
        id: localId, date_rapport: dateIso,
        ief, commune, ecole, superviseur: superviseur.trim(), nom_tuteur: nomTuteur,
        nb_absences: nb, absents: nb > 0 ? absents.trim() : null,
        semaine: semaine!, jour_cours: jourCours!,
        difficultes: diffsJson,
        autres_difficultes:      hasAutres ? autresDifficultes.trim() : null,
        description_difficultes: showDesc  ? descriptionDifficultes.trim() : null,
        directeur_venu:  directeurVenu ? 1 : 0,
        besoin_appui:    besoinAppui   ? 1 : 0,
        domaines_appui:  besoinAppui   ? domainesAppui.trim() : null,
        has_observations: hasObservations ? 1 : 0,
        commentaires:     hasObservations ? commentaires.trim() : null,
        soumis_en_offline: offline ? 1 : 0,
        photo_classe: photoUri,
      });

      const apiBody = {
        local_id: localId, date_rapport: dateIso,
        ief, commune, ecole, superviseur: superviseur.trim(), nom_tuteur: nomTuteur,
        nb_absences: nb, absents: nb > 0 ? absents.trim() : null,
        semaine: semaine!, jour_cours: jourCours!,
        difficultes,
        autres_difficultes:      hasAutres ? autresDifficultes.trim() : null,
        description_difficultes: showDesc  ? descriptionDifficultes.trim() : null,
        directeur_venu: !!directeurVenu, besoin_appui: !!besoinAppui,
        domaines_appui:   besoinAppui   ? domainesAppui.trim() : null,
        has_observations: !!hasObservations,
        commentaires:     hasObservations ? commentaires.trim() : null,
        soumis_en_offline: offline,
        photo_classe: photoBase64 ? `data:image/jpeg;base64,${photoBase64}` : null,
      };

      if (isOnline) {
        try { await rapportJournalierApi.submit(apiBody); markRapportJournalierSynced(localId); }
        catch { enqueueAction("SUBMIT_RAPPORT_JOURNALIER", apiBody); }
      } else {
        enqueueAction("SUBMIT_RAPPORT_JOURNALIER", apiBody);
      }

      if (onSuccess) {
        Alert.alert(
          "Rapport soumis !",
          isOnline
            ? "Votre rapport a été transmis."
            : "Hors-ligne — envoi automatique à la reconnexion.",
          [{ text: "OK", onPress: onSuccess }],
        );
      } else {
        setSubmitted(true);
      }
    } catch {
      Alert.alert("Erreur", "Impossible de sauvegarder. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setNbAbsences("0"); setAbsents("");
    setSemaine(null); setJourCours(null);
    setDifficultes([]); setAutresDifficultes(""); setDescriptionDifficultes("");
    setDirecteurVenu(null); setBesoinAppui(null); setDomainesAppui("");
    setHasObservations(null); setCommentaires("");
    setPhotoUri(null); setPhotoBase64(null);
    setSubmitted(false);
  };

  // ── Vue succès ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={s.root} edges={["top", "bottom"]}>
        <View style={s.successWrap}>
          <Feather name="check-circle" size={rf(60)} color={C.success} />
          <Text style={s.successTitle}>Rapport soumis !</Text>
          <Text style={s.successSub}>
            {isOnline ? "Votre rapport a été transmis." : "Hors-ligne — envoi automatique à la reconnexion."}
          </Text>
          <TouchableOpacity style={s.newBtn} onPress={resetForm} activeOpacity={0.85}>
            <Feather name="plus" size={rf(16)} color="#fff" style={{ marginRight: rs(6) }} />
            <Text style={s.newBtnTxt}>Nouveau rapport</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Contenus des étapes ────────────────────────────────────────────────

  const STEPS_META = [
    { title: "Absences & Progression", icon: "book-open"      },
    { title: "Difficultés",            icon: "alert-circle"   },
    { title: "Supervision & Suivi",    icon: "eye"            },
    { title: "Photo de la classe",     icon: "camera"         },
  ] as const;

  const renderStep = () => {
    switch (step) {

      /* ── Étape 1 : Absences + Progression ── */
      case 1:
        return (
          <ScrollView style={s.stepBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Absences */}
            <Text style={s.question}>Nombre d'absences aujourd'hui</Text>
            <View style={s.counterRow}>
              <TouchableOpacity style={s.counterBtn} onPress={() => setNbAbsences(String(Math.max(0, nb - 1)))}>
                <Feather name="minus" size={rf(20)} color={C.brand} />
              </TouchableOpacity>
              <Text style={s.counterVal}>{nb}</Text>
              <TouchableOpacity style={s.counterBtn} onPress={() => setNbAbsences(String(nb + 1))}>
                <Feather name="plus" size={rf(20)} color={C.brand} />
              </TouchableOpacity>
            </View>

            {nb > 0 && (
              <>
                <Text style={s.question}>Noms des absents</Text>
                <TextInput
                  style={s.area} value={absents} onChangeText={setAbsents}
                  placeholder="Noms séparés par des virgules…"
                  placeholderTextColor={C.textMuted} multiline textAlignVertical="top"
                />
              </>
            )}

            <View style={s.divider} />

            {/* Progression */}
            <Text style={s.question}>Semaine de progression</Text>
            <View style={s.semGrid}>
              {Array.from({ length: 25 }, (_, i) => i + 1).map(n => (
                <TouchableOpacity
                  key={n} style={[s.semCell, semaine === n && s.semSel]}
                  onPress={() => setSemaine(n)} activeOpacity={0.7}
                >
                  <Text style={[s.semTxt, semaine === n && s.semTxtSel]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.question, { marginTop: rs(20) }]}>Jour de cours</Text>
            <View style={s.jourRow}>
              {[1, 2, 3].map(j => (
                <TouchableOpacity
                  key={j} style={[s.jourBtn, jourCours === j && s.jourSel]}
                  onPress={() => setJourCours(j)} activeOpacity={0.7}
                >
                  <Text style={[s.jourTxt, jourCours === j && s.jourTxtSel]}>Jour {j}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ height: rs(24) }} />
          </ScrollView>
        );

      /* ── Étape 2 : Difficultés ── */
      case 2:
        return (
          <ScrollView style={s.stepBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.question}>Difficultés rencontrées</Text>
            {DIFFICULTES_LIST.map(o => (
              <Check key={o} label={o} checked={difficultes.includes(o)} onPress={() => toggleDiff(o)} />
            ))}

            {hasAutres && (
              <>
                <Text style={[s.question, { marginTop: rs(16) }]}>Précisez les autres difficultés</Text>
                <TextInput
                  style={s.area} value={autresDifficultes} onChangeText={setAutresDifficultes}
                  placeholder="Décrivez…" placeholderTextColor={C.textMuted}
                  multiline textAlignVertical="top"
                />
              </>
            )}
            {showDesc && (
              <>
                <Text style={[s.question, { marginTop: rs(16) }]}>Description des difficultés</Text>
                <TextInput
                  style={s.area} value={descriptionDifficultes} onChangeText={setDescriptionDifficultes}
                  placeholder="Description…" placeholderTextColor={C.textMuted}
                  multiline textAlignVertical="top"
                />
              </>
            )}
            <View style={{ height: rs(24) }} />
          </ScrollView>
        );

      /* ── Étape 3 : Supervision + Observations ── */
      case 3:
        return (
          <ScrollView style={s.stepBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Supervision */}
            <Text style={s.question}>Le directeur / superviseur est-il venu ?</Text>
            <Radio label="Oui" selected={directeurVenu === true}  onPress={() => setDirecteurVenu(true)} />
            <Radio label="Non" selected={directeurVenu === false} onPress={() => setDirecteurVenu(false)} />

            <Text style={[s.question, { marginTop: rs(20) }]}>Besoin d'appui pédagogique ?</Text>
            <Radio label="Oui" selected={besoinAppui === true}  onPress={() => setBesoinAppui(true)} />
            <Radio label="Non" selected={besoinAppui === false} onPress={() => setBesoinAppui(false)} />

            {besoinAppui === true && (
              <>
                <Text style={[s.question, { marginTop: rs(16) }]}>Domaines d'appui</Text>
                <TextInput
                  style={s.area} value={domainesAppui} onChangeText={setDomainesAppui}
                  placeholder="Ex : Lecture, Mathématiques…" placeholderTextColor={C.textMuted}
                  multiline textAlignVertical="top"
                />
              </>
            )}

            <View style={s.divider} />

            {/* Observations */}
            <Text style={s.question}>Avez-vous des observations ou commentaires ?</Text>
            <Radio label="Oui" selected={hasObservations === true}  onPress={() => setHasObservations(true)} />
            <Radio label="Non" selected={hasObservations === false} onPress={() => setHasObservations(false)} />

            {hasObservations === true && (
              <>
                <Text style={[s.question, { marginTop: rs(16) }]}>Commentaires</Text>
                <TextInput
                  style={[s.area, { minHeight: rs(100) }]}
                  value={commentaires} onChangeText={setCommentaires}
                  placeholder="Vos observations…" placeholderTextColor={C.textMuted}
                  multiline textAlignVertical="top"
                />
              </>
            )}
            <View style={{ height: rs(24) }} />
          </ScrollView>
        );

      /* ── Étape 4 : Photo ── */
      case 4:
        return (
          <View style={[s.stepBody, { alignItems: "center" }]}>
            <Text style={[s.question, { textAlign: "center", marginBottom: rs(24) }]}>
              Prenez une photo de la classe
            </Text>
            {!photoUri ? (
              <TouchableOpacity style={s.photoBtn} onPress={openCamera} activeOpacity={0.8}>
                <Feather name="camera" size={rf(36)} color={C.brand} style={{ marginBottom: rs(12) }} />
                <Text style={s.photoBtnTxt}>Ouvrir l'appareil photo</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: "100%", gap: rs(12) }}>
                <Image source={{ uri: photoUri }} style={s.photoPreview} resizeMode="cover" />
                <View style={s.photoBadge}>
                  <Feather name="check-circle" size={rf(14)} color={C.success} />
                  <Text style={s.photoBadgeTxt}>Photo prise</Text>
                </View>
                <TouchableOpacity style={s.retakeBtn} onPress={() => { setPhotoUri(null); setPhotoBase64(null); }} activeOpacity={0.8}>
                  <Feather name="refresh-cw" size={rf(14)} color={C.brand} />
                  <Text style={s.retakeTxt}>Reprendre la photo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );

      default: return null;
    }
  };

  // ── Rendu principal ────────────────────────────────────────────────────
  const meta = STEPS_META[step - 1];

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>

      {/* ── Barre titre ── */}
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={step === 1 ? onBack : goPrev}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={rf(20)} color={C.text} />
        </TouchableOpacity>
        <Text style={s.topTitle}>Nouveau rapport</Text>
        {!isOnline && (
          <View style={s.offPill}>
            <Feather name="wifi-off" size={rf(11)} color={C.warn} />
            <Text style={s.offTxt}>Hors-ligne</Text>
          </View>
        )}
      </View>

      {/* ── Barre de progression ── */}
      <View style={s.progressWrap}>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` as any }]} />
        </View>
        <Text style={s.progressTxt}>{step} / {TOTAL_STEPS}</Text>
      </View>

      {/* ── Titre de l'étape ── */}
      <View style={s.stepHeader}>
        <View style={s.stepIconWrap}>
          <Feather name={meta.icon as any} size={rf(18)} color={C.brand} />
        </View>
        <Text style={s.stepTitle}>{meta.title}</Text>
      </View>

      {/* ── Contenu ── */}
      {renderStep()}

      {/* ── Navigation ── */}
      <View style={s.navRow}>
        {step < TOTAL_STEPS ? (
          <TouchableOpacity style={s.nextBtn} onPress={goNext} activeOpacity={0.85}>
            <Text style={s.nextBtnTxt}>Suivant</Text>
            <Feather name="arrow-right" size={rf(16)} color="#fff" style={{ marginLeft: rs(6) }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.nextBtn, s.submitBtn, (loading || !photoUri) && s.submitDis]}
            onPress={handleSubmit}
            disabled={loading || !photoUri}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Feather name="send" size={rf(16)} color="#fff" style={{ marginRight: rs(6) }} />
                  <Text style={s.nextBtnTxt}>Soumettre</Text>
                </>
            }
          </TouchableOpacity>
        )}
      </View>

    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  /* Barre titre */
  topBar:  { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(16), paddingVertical: rs(12), backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  topTitle:{ fontSize: rf(16), fontWeight: "700", color: C.text, flex: 1 },
  backBtn: { marginRight: rs(12) },
  offPill: { flexDirection: "row", alignItems: "center", gap: rs(4), backgroundColor: C.warnSoft, borderRadius: rs(20), paddingHorizontal: rs(10), paddingVertical: rs(4) },
  offTxt:  { fontSize: rf(11), color: C.warn, fontWeight: "600" },

  /* Progression */
  progressWrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(16), paddingVertical: rs(12), gap: rs(10) },
  progressBar:  { flex: 1, height: rs(6), backgroundColor: C.border, borderRadius: rs(3), overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: C.brand, borderRadius: rs(3) },
  progressTxt:  { fontSize: rf(12), fontWeight: "700", color: C.textMuted, minWidth: rs(32), textAlign: "right" },

  /* En-tête étape */
  stepHeader:  { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(16), paddingBottom: rs(12), gap: rs(10) },
  stepIconWrap:{ width: rs(36), height: rs(36), borderRadius: rs(10), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  stepTitle:   { fontSize: rf(18), fontWeight: "700", color: C.text },

  /* Corps de l'étape */
  stepBody: { flex: 1, paddingHorizontal: rs(16) },

  question:  { fontSize: rf(15), fontWeight: "600", color: C.text, marginBottom: rs(14), lineHeight: rf(22), marginTop: rs(4) },
  divider:   { height: 1, backgroundColor: C.border, marginVertical: rs(20) },

  /* Options */
  optRow:      { flexDirection: "row", alignItems: "center", paddingVertical: rs(11), borderBottomWidth: 1, borderBottomColor: C.border },
  radioOuter:  { width: rs(22), height: rs(22), borderRadius: rs(11), borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", marginRight: rs(12) },
  radioSel:    { borderColor: C.brand },
  radioDot:    { width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: C.brand },
  checkOuter:  { width: rs(22), height: rs(22), borderRadius: rs(6), borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", marginRight: rs(12) },
  checkSel:    { borderColor: C.brand, backgroundColor: C.brand },
  optLabel:    { fontSize: rf(14), color: C.textMuted, flex: 1 },
  optLabelSel: { color: C.text, fontWeight: "600" },

  /* Compteur absences */
  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(24), marginVertical: rs(16) },
  counterBtn: { width: rs(52), height: rs(52), borderRadius: rs(14), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  counterVal: { fontSize: rf(42), fontWeight: "800", color: C.text, minWidth: rs(60), textAlign: "center" },

  /* Textarea */
  area: { backgroundColor: C.surface, borderRadius: rs(12), borderWidth: 1, borderColor: C.border, padding: rs(12), fontSize: rf(14), color: C.text, minHeight: rs(90), marginTop: rs(4) },

  /* Semaine */
  semGrid: { flexDirection: "row", flexWrap: "wrap", gap: rs(8), marginBottom: rs(8) },
  semCell: { width: rs(44), height: rs(44), borderRadius: rs(10), borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  semSel:    { backgroundColor: C.brand, borderColor: C.brand },
  semTxt:    { fontSize: rf(13), fontWeight: "600", color: C.textMuted },
  semTxtSel: { color: "#fff" },

  /* Jour */
  jourRow: { flexDirection: "row", gap: rs(10) },
  jourBtn: { flex: 1, paddingVertical: rs(14), borderRadius: rs(12), borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  jourSel:    { backgroundColor: C.brand, borderColor: C.brand },
  jourTxt:    { fontSize: rf(14), fontWeight: "600", color: C.textMuted },
  jourTxtSel: { color: "#fff" },

  /* Photo */
  photoBtn:     { width: "100%", aspectRatio: 4/3, borderWidth: 2, borderColor: C.brand, borderStyle: "dashed", borderRadius: rs(16), alignItems: "center", justifyContent: "center", backgroundColor: C.brandSoft },
  photoBtnTxt:  { fontSize: rf(15), fontWeight: "700", color: C.brand },
  photoPreview: { width: "100%", aspectRatio: 4/3, borderRadius: rs(14), backgroundColor: C.border },
  photoBadge:   { flexDirection: "row", alignItems: "center", gap: rs(6), backgroundColor: C.successSoft, borderRadius: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(6), alignSelf: "flex-start" },
  photoBadgeTxt:{ fontSize: rf(12), fontWeight: "600", color: C.success },
  retakeBtn:    { flexDirection: "row", alignItems: "center", gap: rs(6), paddingVertical: rs(4) },
  retakeTxt:    { fontSize: rf(13), color: C.brand, fontWeight: "600" },

  /* Navigation */
  navRow:    { paddingHorizontal: rs(16), paddingVertical: rs(14), borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  nextBtn:   { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.brand, borderRadius: rs(14), paddingVertical: rs(15), shadowColor: C.brand, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  nextBtnTxt:{ color: "#fff", fontWeight: "800", fontSize: rf(15) },
  submitBtn: { backgroundColor: C.success },
  submitDis: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },

  /* Succès */
  successWrap:  { flex: 1, alignItems: "center", justifyContent: "center", padding: rs(32) },
  successTitle: { fontSize: rf(22), fontWeight: "800", color: C.text, textAlign: "center", marginTop: rs(20), marginBottom: rs(10) },
  successSub:   { fontSize: rf(14), color: C.textMuted, textAlign: "center", lineHeight: rf(22), marginBottom: rs(32) },
  newBtn:       { flexDirection: "row", alignItems: "center", backgroundColor: C.brand, borderRadius: rs(14), paddingHorizontal: rs(28), paddingVertical: rs(14) },
  newBtnTxt:    { color: "#fff", fontWeight: "700", fontSize: rf(15) },
});
