/**
 * NWN-AS 2025-2026 — Rapport Journalier du Tuteur
 *
 * Toutes les données connues (nom, école, commune, IEF, superviseur) sont
 * récupérées automatiquement depuis le profil syncData.
 * Mode hors-ligne : sauvegarde SQLite immédiate, sync auto à la reconnexion.
 */
import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";

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

// ── Composants UI ──────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={st.secRow}>
      <View style={st.secIcon}>
        <Feather name={icon as any} size={rf(15)} color={C.brand} />
      </View>
      <Text style={st.secTitle}>{title}</Text>
    </View>
  );
}

function Lbl({ text, req }: { text: string; req?: boolean }) {
  return (
    <Text style={st.lbl}>
      {text}{req && <Text style={{ color: C.danger }}> *</Text>}
    </Text>
  );
}

function Radio({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.optRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[st.radioOuter, selected && st.radioSel]}>
        {selected && <View style={st.radioDot} />}
      </View>
      <Text style={[st.optLabel, selected && st.optLabelSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Check({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.optRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[st.checkOuter, checked && st.checkSel]}>
        {checked && <Feather name="check" size={rf(11)} color="#fff" />}
      </View>
      <Text style={[st.optLabel, checked && st.optLabelSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={st.card}>{children}</View>;
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

  // Section 2 — Absences
  const [nbAbsences, setNbAbsences] = useState("0");
  const [absents,    setAbsents]    = useState("");

  // Section 3 — Classe
  const [semaine,   setSemaine]   = useState<number | null>(null);
  const [jourCours, setJourCours] = useState<number | null>(null);

  // Section 4 — Difficultés
  const [difficultes,            setDifficultes]            = useState<string[]>([]);
  const [autresDifficultes,      setAutresDifficultes]      = useState("");
  const [descriptionDifficultes, setDescriptionDifficultes] = useState("");

  // Section 5 — Supervision
  const [directeurVenu,  setDirecteurVenu]  = useState<boolean | null>(null);
  const [besoinAppui,    setBesoinAppui]    = useState<boolean | null>(null);
  const [domainesAppui,  setDomainesAppui]  = useState("");

  // Section 6 — Observations
  const [hasObservations, setHasObservations] = useState<boolean | null>(null);
  const [commentaires,    setCommentaires]    = useState("");

  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  // ── Helpers ────────────────────────────────────────────────────────────

  const toggleDiff = useCallback((val: string) => {
    setDifficultes(prev => {
      if (val === "Aucune") return prev.includes("Aucune") ? [] : ["Aucune"];
      const wo = prev.filter(d => d !== "Aucune");
      return wo.includes(val) ? wo.filter(d => d !== val) : [...wo, val];
    });
  }, []);

  const hasAutres = difficultes.includes("Autres");
  const isAucune  = difficultes.length === 1 && difficultes[0] === "Aucune";
  const showDesc  = difficultes.length > 0 && !isAucune;
  const nb        = parseInt(nbAbsences, 10) || 0;

  // ── Validation ─────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (nb > 0 && !absents.trim())         return "Veuillez indiquer les noms des absents.";
    if (!semaine)                          return "Veuillez sélectionner la semaine.";
    if (!jourCours)                        return "Veuillez sélectionner le jour de cours.";
    if (difficultes.length === 0)          return "Veuillez sélectionner au moins une difficulté (ou Aucune).";
    if (hasAutres && !autresDifficultes.trim()) return "Veuillez préciser les autres difficultés.";
    if (showDesc && !descriptionDifficultes.trim()) return "Veuillez décrire brièvement les difficultés.";
    if (directeurVenu === null)            return "Veuillez indiquer si le directeur/superviseur est venu.";
    if (besoinAppui === null)              return "Veuillez indiquer si vous avez besoin d'appui.";
    if (besoinAppui && !domainesAppui.trim()) return "Veuillez indiquer les domaines d'appui souhaités.";
    if (hasObservations === null)          return "Veuillez indiquer si vous avez des observations.";
    if (hasObservations && !commentaires.trim()) return "Veuillez rédiger vos commentaires.";
    return null;
  };

  // ── Soumission ─────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      Alert.alert("Formulaire incomplet", err);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setLoading(true);
    try {
      const localId   = `rj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const dateIso   = format(new Date(), "yyyy-MM-dd");
      const diffsJson = JSON.stringify(difficultes);
      const offline   = !isOnline;

      // Données connues automatiquement
      const nomTuteur   = profile?.name       ?? "";
      const ecole       = school?.name        ?? "";
      const commune     = school?.city        ?? "";
      const ief         = school?.region      ?? "";
      const superviseur = school?.director    ?? "";

      // 1. Sauvegarde locale immédiate
      insertRapportJournalier({
        id:                      localId,
        date_rapport:            dateIso,
        ief,
        commune,
        ecole,
        superviseur:             superviseur.trim(),
        nom_tuteur:              nomTuteur,
        nb_absences:             nb,
        absents:                 nb > 0 ? absents.trim() : null,
        semaine:                 semaine!,
        jour_cours:              jourCours!,
        difficultes:             diffsJson,
        autres_difficultes:      hasAutres ? autresDifficultes.trim() : null,
        description_difficultes: showDesc  ? descriptionDifficultes.trim() : null,
        directeur_venu:          directeurVenu ? 1 : 0,
        besoin_appui:            besoinAppui   ? 1 : 0,
        domaines_appui:          besoinAppui   ? domainesAppui.trim() : null,
        has_observations:        hasObservations ? 1 : 0,
        commentaires:            hasObservations ? commentaires.trim() : null,
        soumis_en_offline:       offline ? 1 : 0,
      });

      // 2. Payload API
      const apiBody = {
        local_id:                localId,
        date_rapport:            dateIso,
        ief,
        commune,
        ecole,
        superviseur:             superviseur.trim(),
        nom_tuteur:              nomTuteur,
        nb_absences:             nb,
        absents:                 nb > 0 ? absents.trim() : null,
        semaine:                 semaine!,
        jour_cours:              jourCours!,
        difficultes,
        autres_difficultes:      hasAutres ? autresDifficultes.trim() : null,
        description_difficultes: showDesc  ? descriptionDifficultes.trim() : null,
        directeur_venu:          !!directeurVenu,
        besoin_appui:            !!besoinAppui,
        domaines_appui:          besoinAppui ? domainesAppui.trim() : null,
        has_observations:        !!hasObservations,
        commentaires:            hasObservations ? commentaires.trim() : null,
        soumis_en_offline:       offline,
      };

      if (isOnline) {
        try {
          await rapportJournalierApi.submit(apiBody);
          markRapportJournalierSynced(localId);
        } catch {
          enqueueAction("SUBMIT_RAPPORT_JOURNALIER", apiBody);
        }
      } else {
        enqueueAction("SUBMIT_RAPPORT_JOURNALIER", apiBody);
      }

      if (onSuccess) {
        Alert.alert(
          "Rapport soumis !",
          isOnline
            ? "Votre rapport a été transmis au serveur."
            : "Hors-ligne — le rapport sera envoyé automatiquement à la prochaine connexion.",
          [{ text: "OK", onPress: onSuccess }],
        );
      } else {
        setSubmitted(true);
      }

    } catch (err: any) {
      Alert.alert("Erreur", "Impossible de sauvegarder le rapport. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNbAbsences("0");
    setAbsents("");
    setSemaine(null);
    setJourCours(null);
    setDifficultes([]);
    setAutresDifficultes("");
    setDescriptionDifficultes("");
    setDirecteurVenu(null);
    setBesoinAppui(null);
    setDomainesAppui("");
    setHasObservations(null);
    setCommentaires("");
    setSubmitted(false);
  };

  // ── Vue succès (standalone, sans callback) ─────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={s.root} edges={["top", "bottom"]}>
        <View style={s.successWrap}>
          <Feather name="check-circle" size={rf(60)} color={C.success} />
          <Text style={s.successTitle}>Rapport soumis !</Text>
          <Text style={s.successSub}>
            {isOnline
              ? "Votre rapport a été transmis au serveur."
              : "Hors-ligne — le rapport sera envoyé automatiquement à la prochaine connexion."
            }
          </Text>
          <TouchableOpacity style={s.newBtn} onPress={resetForm} activeOpacity={0.85}>
            <Feather name="plus" size={rf(16)} color="#fff" style={{ marginRight: rs(6) }} />
            <Text style={s.newBtnTxt}>Nouveau rapport</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Formulaire ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>

      {/* Barre titre */}
      <View style={s.topBar}>
        {onBack && (
          <TouchableOpacity
            onPress={onBack}
            style={s.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={rf(20)} color={C.text} />
          </TouchableOpacity>
        )}
        <Text style={[s.topTitle, !!onBack && { flex: 1 }]}>Nouveau rapport</Text>
        {!isOnline && (
          <View style={s.offPill}>
            <Feather name="wifi-off" size={rf(11)} color={C.warn} />
            <Text style={s.offTxt}>Hors-ligne</Text>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ─── SECTION 1 : Absences ─── */}
        <SectionHeader title="Absences" icon="user-x" />

        <Card>
          <Lbl text="NOMBRE D'ABSENCES AUJOURD'HUI" req />
          <View style={s.counterRow}>
            <TouchableOpacity
              style={s.counterBtn}
              onPress={() => setNbAbsences(String(Math.max(0, nb - 1)))}
            >
              <Feather name="minus" size={rf(18)} color={C.brand} />
            </TouchableOpacity>
            <TextInput
              style={s.counterInput}
              value={nbAbsences}
              onChangeText={t => setNbAbsences(t.replace(/\D/g, "") || "0")}
              keyboardType="number-pad"
              textAlign="center"
            />
            <TouchableOpacity
              style={s.counterBtn}
              onPress={() => setNbAbsences(String(nb + 1))}
            >
              <Feather name="plus" size={rf(18)} color={C.brand} />
            </TouchableOpacity>
          </View>
        </Card>

        {nb > 0 && (
          <Card>
            <Lbl text="QUI SONT LES ABSENTS ?" req />
            <TextInput
              style={[s.input, s.area]}
              value={absents}
              onChangeText={setAbsents}
              placeholder="Noms séparés par des virgules…"
              placeholderTextColor={C.textMuted}
              multiline
            />
          </Card>
        )}

        {/* ─── SECTION 3 : Classe ─── */}
        <SectionHeader title="Progression de la classe" icon="book-open" />

        <Card>
          <Lbl text="SEMAINE DE PROGRESSION (#)" req />
          <View style={s.semGrid}>
            {Array.from({ length: 25 }, (_, i) => i + 1).map(n => (
              <TouchableOpacity
                key={n}
                style={[s.semCell, semaine === n && s.semSel]}
                onPress={() => setSemaine(n)}
                activeOpacity={0.7}
              >
                <Text style={[s.semTxt, semaine === n && s.semTxtSel]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <Lbl text="JOUR DE COURS DANS LA SEMAINE" req />
          <View style={s.jourRow}>
            {[1, 2, 3].map(j => (
              <TouchableOpacity
                key={j}
                style={[s.jourBtn, jourCours === j && s.jourSel]}
                onPress={() => setJourCours(j)}
                activeOpacity={0.7}
              >
                <Text style={[s.jourTxt, jourCours === j && s.jourTxtSel]}>Jour {j}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* ─── SECTION 4 : Difficultés ─── */}
        <SectionHeader title="Difficultés rencontrées" icon="alert-circle" />

        <Card>
          <Lbl text="DIFFICULTÉS PENDANT LE COURS" req />
          {DIFFICULTES_LIST.map(o => (
            <Check
              key={o}
              label={o}
              checked={difficultes.includes(o)}
              onPress={() => toggleDiff(o)}
            />
          ))}
        </Card>

        {hasAutres && (
          <Card>
            <Lbl text="PRÉCISEZ LES AUTRES DIFFICULTÉS" req />
            <TextInput
              style={[s.input, s.area]}
              value={autresDifficultes}
              onChangeText={setAutresDifficultes}
              placeholder="Décrivez les autres difficultés…"
              placeholderTextColor={C.textMuted}
              multiline
            />
          </Card>
        )}

        {showDesc && (
          <Card>
            <Lbl text="DÉCRIVEZ BRIÈVEMENT CES DIFFICULTÉS" req />
            <TextInput
              style={[s.input, s.area]}
              value={descriptionDifficultes}
              onChangeText={setDescriptionDifficultes}
              placeholder="Description des difficultés…"
              placeholderTextColor={C.textMuted}
              multiline
            />
          </Card>
        )}

        {/* ─── SECTION 5 : Supervision & Appui ─── */}
        <SectionHeader title="Supervision & Appui" icon="eye" />

        <Card>
          <Lbl text="LE DIRECTEUR / SUPERVISEUR EST VENU POUR UNE SUPERVISION ?" req />
          <Radio label="Oui" selected={directeurVenu === true}  onPress={() => setDirecteurVenu(true)} />
          <Radio label="Non" selected={directeurVenu === false} onPress={() => setDirecteurVenu(false)} />
        </Card>

        <Card>
          <Lbl text="BESOIN D'APPUI (LECTURE ET/OU MATHS) POUR LE BON DÉROULEMENT DES COURS ?" req />
          <Radio label="Oui" selected={besoinAppui === true}  onPress={() => setBesoinAppui(true)} />
          <Radio label="Non" selected={besoinAppui === false} onPress={() => setBesoinAppui(false)} />
        </Card>

        {besoinAppui === true && (
          <Card>
            <Lbl text="DANS QUELS DOMAINES ?" req />
            <TextInput
              style={[s.input, s.area]}
              value={domainesAppui}
              onChangeText={setDomainesAppui}
              placeholder="Ex : Lecture, Mathématiques…"
              placeholderTextColor={C.textMuted}
              multiline
            />
          </Card>
        )}

        {/* ─── SECTION 6 : Observations ─── */}
        <SectionHeader title="Observations & Commentaires" icon="message-circle" />

        <Card>
          <Lbl text="AVEZ-VOUS DES OBSERVATIONS OU COMMENTAIRES ?" req />
          <Radio label="Oui" selected={hasObservations === true}  onPress={() => setHasObservations(true)} />
          <Radio label="Non" selected={hasObservations === false} onPress={() => setHasObservations(false)} />
        </Card>

        {hasObservations === true && (
          <Card>
            <Lbl text="COMMENTAIRES" req />
            <TextInput
              style={[s.input, s.areaLg]}
              value={commentaires}
              onChangeText={setCommentaires}
              placeholder="Vos observations et commentaires…"
              placeholderTextColor={C.textMuted}
              multiline
            />
          </Card>
        )}

        {/* ─── Bouton Soumettre ─── */}
        <View style={s.submitWrap}>
          {!isOnline && (
            <View style={s.offInfo}>
              <Feather name="wifi-off" size={rf(13)} color={C.warn} />
              <Text style={s.offInfoTxt}>
                Hors-ligne — le rapport sera envoyé automatiquement à la reconnexion.
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[s.submitBtn, loading && s.submitDis]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Feather name="send" size={rf(17)} color="#fff" style={{ marginRight: rs(8) }} />
                  <Text style={s.submitTxt}>SOUMETTRE LE RAPPORT</Text>
                </>
            }
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles partagés ────────────────────────────────────────────────────────

const st = StyleSheet.create({
  secRow:  { flexDirection: "row", alignItems: "center", marginTop: rs(22), marginBottom: rs(8) },
  secIcon: {
    width: rs(28), height: rs(28), borderRadius: rs(8),
    backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center",
    marginRight: rs(10),
  },
  secTitle: { fontSize: rf(13), fontWeight: "800", color: C.brand, textTransform: "uppercase", letterSpacing: 0.4 },

  card: {
    backgroundColor: C.surface, borderRadius: rs(14),
    padding: rs(14), marginBottom: rs(10),
    borderWidth: 1, borderColor: C.border,
  },

  lbl: { fontSize: rf(11), fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: rs(10) },

  optRow:      { flexDirection: "row", alignItems: "center", marginBottom: rs(10) },
  radioOuter:  { width: rs(20), height: rs(20), borderRadius: rs(10), borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", marginRight: rs(10) },
  radioSel:    { borderColor: C.brand },
  radioDot:    { width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: C.brand },
  checkOuter:  { width: rs(20), height: rs(20), borderRadius: rs(6), borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center", marginRight: rs(10) },
  checkSel:    { borderColor: C.brand, backgroundColor: C.brand },
  optLabel:    { fontSize: rf(14), color: C.textMuted, flex: 1 },
  optLabelSel: { color: C.text, fontWeight: "600" },
});

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: rs(16), paddingBottom: rs(60) },

  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: rs(18), paddingVertical: rs(13),
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  topTitle: { fontSize: rf(16), fontWeight: "700", color: C.text },
  backBtn:  { marginRight: rs(12) },
  offPill:  {
    flexDirection: "row", alignItems: "center", gap: rs(4),
    backgroundColor: C.warnSoft, borderRadius: rs(20),
    paddingHorizontal: rs(10), paddingVertical: rs(4),
    marginLeft: rs(8),
  },
  offTxt: { fontSize: rf(11), color: C.warn, fontWeight: "600" },

  input: {
    backgroundColor: C.surfaceAlt, borderRadius: rs(10),
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: rs(12), paddingVertical: rs(10),
    fontSize: rf(14), color: C.text,
  },
  area:   { minHeight: rs(80),  textAlignVertical: "top" },
  areaLg: { minHeight: rs(110), textAlignVertical: "top" },

  counterRow:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(16) },
  counterBtn:  {
    width: rs(42), height: rs(42), borderRadius: rs(12),
    backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center",
  },
  counterInput: {
    width: rs(72), height: rs(44), borderRadius: rs(12),
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt,
    fontSize: rf(20), fontWeight: "700", color: C.text,
  },

  semGrid: { flexDirection: "row", flexWrap: "wrap", gap: rs(6) },
  semCell: {
    width: rs(42), height: rs(42), borderRadius: rs(10),
    borderWidth: 1.5, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  semSel:    { backgroundColor: C.brand, borderColor: C.brand },
  semTxt:    { fontSize: rf(13), fontWeight: "600", color: C.textMuted },
  semTxtSel: { color: "#fff" },

  jourRow: { flexDirection: "row", gap: rs(10) },
  jourBtn: {
    flex: 1, paddingVertical: rs(13), borderRadius: rs(12),
    borderWidth: 1.5, borderColor: C.border, alignItems: "center",
  },
  jourSel:    { backgroundColor: C.brand, borderColor: C.brand },
  jourTxt:    { fontSize: rf(14), fontWeight: "600", color: C.textMuted },
  jourTxtSel: { color: "#fff" },

  submitWrap: { marginTop: rs(24), marginBottom: rs(16) },
  offInfo:    {
    flexDirection: "row", gap: rs(8),
    backgroundColor: C.warnSoft, borderRadius: rs(12), padding: rs(12),
    marginBottom: rs(12),
  },
  offInfoTxt: { flex: 1, fontSize: rf(12), color: C.warn, lineHeight: rf(18) },
  submitBtn:  {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: C.brand, borderRadius: rs(16), paddingVertical: rs(16),
    shadowColor: C.brand, shadowOpacity: 0.3,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  submitDis: { opacity: 0.55, elevation: 0, shadowOpacity: 0 },
  submitTxt: { color: "#fff", fontSize: rf(15), fontWeight: "800", letterSpacing: 0.5 },

  successWrap:  { flex: 1, alignItems: "center", justifyContent: "center", padding: rs(32) },
  successTitle: { fontSize: rf(22), fontWeight: "800", color: C.text, textAlign: "center", marginTop: rs(20), marginBottom: rs(10) },
  successSub:   { fontSize: rf(14), color: C.textMuted, textAlign: "center", lineHeight: rf(22), marginBottom: rs(32) },
  newBtn:       {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.brand, borderRadius: rs(14),
    paddingHorizontal: rs(28), paddingVertical: rs(14),
  },
  newBtnTxt: { color: "#fff", fontWeight: "700", fontSize: rf(15) },
});
