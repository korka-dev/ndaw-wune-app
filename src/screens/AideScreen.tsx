/**
 * Aide, signalement et mises à jour (lot L7 — RET09 / RET10).
 *
 * - Aide courte par écran (ce qu'il faut faire, où trouver quoi) ;
 * - signalement d'un problème avec une référence à donner au support
 *   (envoyé tout de suite ou gardé dans la file hors connexion) ;
 * - installation et mises à jour : systèmes pris en charge, version
 *   installée / dernière version, et rappel que les saisies en attente
 *   sont conservées pendant une mise à jour.
 */
import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, Platform, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useStore } from "../store/useStore";
import { remarquesApi } from "../services/api";
import { enqueueAction, countUnsentForOwner, getFailedActions } from "../services/db";
import BackButton from "../components/BackButton";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

type Rubrique = { cle: string; titre: string; points: string[] };

const AIDE_TUTEUR: Rubrique[] = [
  { cle: "accueil", titre: "Accueil et minuteur", points: [
    "Appuyez sur « Démarrer » pour lancer l'activité affichée. Le minuteur indique le temps restant de cette activité, pas de la journée.",
    "« Pause » arrête le décompte ; « Reprendre » le relance. Un rappel arrive si la pause dure plus de 5 minutes.",
    "À la fin du temps prévu, le téléphone sonne même écran verrouillé. « Terminer » ne clôt que l'activité en cours ; la suivante est indiquée sous la barre.",
  ] },
  { cle: "rapport", titre: "Rapport du jour", points: [
    "Le rapport est gardé sur le téléphone pendant la saisie : si vous quittez, vous le retrouvez à la réouverture.",
    "Après l'envoi, le message indique s'il a été reçu par le serveur ou seulement enregistré sur le téléphone.",
  ] },
  { cle: "rapports", titre: "Mes rapports", points: [
    "Chaque rapport porte un statut : reçu, en attente d'envoi, à vérifier, corrigé ou annulé.",
    "Le retour de votre superviseur apparaît sur le rapport concerné.",
  ] },
  { cle: "evaluations", titre: "Évaluations", points: [
    "« Par élève » montre les groupes de lecture et de maths et l'historique des observations.",
    "Vous pouvez proposer un changement de groupe : le groupe actuel reste en place jusqu'à la décision de l'équipe programme.",
  ] },
  { cle: "ressources", titre: "Ressources", points: [
    "Filtrez par activité ou cherchez par titre et niveau. La version et le poids du fichier sont indiqués.",
    "Téléchargez un document (↓) pour le lire sans connexion.",
  ] },
  { cle: "messages", titre: "Messages", points: [
    "Une question pédagogique va à votre superviseur ; un problème d'application va à l'assistance technique.",
    "Les réponses apparaissent dans « Mes échanges ».",
  ] },
  { cle: "envoi", titre: "Centre d'envoi", points: [
    "Tout ce qui n'est pas encore parti y est listé. Rien n'est perdu sans connexion : l'envoi reprend dès que le réseau revient.",
  ] },
];

const AIDE_SUPERVISEUR: Rubrique[] = [
  { cle: "presences", titre: "Présences", points: [
    "Pointez chaque tuteur présent ou absent pour la journée ; le pointage peut être corrigé tant qu'il n'est pas envoyé.",
  ] },
  { cle: "evaluations", titre: "Évaluations", points: [
    "Le tirage fonctionne sans connexion si la liste a été chargée une fois. Un élève absent est noté absent : il n'est pas remplacé par un autre.",
    "Une évaluation commencée est gardée sur le téléphone et peut être reprise.",
  ] },
  { cle: "suivi", titre: "Rapports de mes tuteurs", points: [
    "Consultez les rapports reçus, laissez un retour, validez les remplacements d'élèves et répondez aux messages.",
    "L'onglet tuteurs indique la dernière synchronisation de chaque téléphone.",
  ] },
  { cle: "envoi", titre: "Centre d'envoi", points: [
    "Tout ce qui n'est pas encore parti y est listé ; l'envoi reprend dès que le réseau revient.",
  ] },
];

function nouvelleReference(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  let alea = "";
  for (let i = 0; i < 4; i++) alea += "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)];
  return `SIG-${d.getFullYear() % 100}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${alea}`;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(n => parseInt(n, 10) || 0);
  const pb = b.split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export default function AideScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, syncData, isOnline } = useStore();
  const estSuperviseur = user?.role === "superviseur";
  const rubriques = estSuperviseur ? AIDE_SUPERVISEUR : AIDE_TUTEUR;
  const params = syncData?.parametres_terrain;

  const [ouverte, setOuverte] = useState<string | null>(null);
  const [ecran, setEcran] = useState<string>(rubriques[0].cle);
  const [description, setDescription] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [derniereRef, setDerniereRef] = useState<string | null>(null);

  const versionInstallee = Constants.expoConfig?.version ?? "—";
  const derniere = params?.latest_app_version ?? null;
  const aJour = derniere ? compareVersions(versionInstallee, derniere) >= 0 : null;
  let enAttente = 0;
  let aVerifier = 0;
  try { enAttente = countUnsentForOwner(); aVerifier = getFailedActions().length; } catch {}

  const signaler = async () => {
    if (envoi || description.trim().length < 5) return;
    setEnvoi(true);
    const reference = nouvelleReference();
    const titreEcran = rubriques.find(r => r.cle === ecran)?.titre ?? ecran;
    const derniereErreur = (() => { try { return getFailedActions()[0]?.last_error ?? null; } catch { return null; } })();
    const message = [
      `[${reference}] Écran : ${titreEcran}`,
      description.trim(),
      `— Version ${versionInstallee} · ${Platform.OS} ${String(Platform.Version)} · ${enAttente} en attente · ${aVerifier} à vérifier`,
      derniereErreur ? `— Dernière erreur d'envoi : ${derniereErreur.slice(0, 200)}` : "",
    ].filter(Boolean).join("\n");
    const payload = {
      categorie: "application", message, ecole: syncData?.school?.name ?? null,
      destinataire: "support_technique", contexte_type: "ecran", contexte_id: ecran,
    };
    let recu = false;
    try {
      if (isOnline) { await remarquesApi.submit(payload); recu = true; }
      else enqueueAction("SUBMIT_REMARQUE", payload);
    } catch {
      enqueueAction("SUBMIT_REMARQUE", payload);
    } finally { setEnvoi(false); }
    setDescription("");
    setDerniereRef(reference);
    Alert.alert(
      recu ? "Signalement reçu" : "Signalement enregistré sur le téléphone",
      `Référence : ${reference}\n\nDonnez cette référence si l'assistance vous contacte.` +
      (recu ? "" : "\nIl partira automatiquement dès que le réseau revient."),
    );
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <BackButton onPress={() => router.back()} compact />
        <Text style={s.headerTitle}>Aide et assistance</Text>
      </View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + rs(32) }]} keyboardShouldPersistTaps="handled">

        {/* ── Installation et mises à jour ── */}
        <Text style={s.section}>Installation et mises à jour</Text>
        <View style={s.card}>
          <Ligne lib="Version installée" val={versionInstallee} />
          <Ligne lib="Dernière version" val={derniere ?? "inconnue (synchronisez)"} />
          {aJour !== null && (
            <View style={[s.etat, { backgroundColor: aJour ? C.successSoft : C.warnSoft }]}>
              <Feather name={aJour ? "check-circle" : "download"} size={rf(14)} color={aJour ? C.success : C.warn} />
              <Text style={[s.etatTxt, { color: aJour ? C.success : C.warn }]}>
                {aJour ? "Votre application est à jour." : "Une version plus récente existe : demandez-la à votre superviseur ou à l'équipe ARED."}
              </Text>
            </View>
          )}
          <Ligne lib="Téléphones pris en charge" val={params?.systemes_supportes ?? "Android 8 ou plus récent"} />
          <Text style={s.note}>
            Avant d'installer une nouvelle version, synchronisez si possible. Une mise à jour ne supprime pas vos saisies :
            {enAttente + aVerifier > 0
              ? ` ${enAttente} saisie(s) en attente${aVerifier ? ` et ${aVerifier} à vérifier` : ""} resteront sur ce téléphone et partiront ensuite.`
              : " tout est déjà envoyé."}
          </Text>
          <Text style={s.note}>Ne désinstallez pas l'application pour la mettre à jour : la désinstallation efface ce qui n'est pas encore envoyé.</Text>
        </View>

        {/* ── Aide par écran ── */}
        <Text style={s.section}>Aide par écran</Text>
        {rubriques.map(r => (
          <View key={r.cle} style={s.card}>
            <TouchableOpacity style={s.rubriqueRow} onPress={() => setOuverte(ouverte === r.cle ? null : r.cle)} activeOpacity={0.7}>
              <Text style={s.rubriqueTitre}>{r.titre}</Text>
              <Feather name={ouverte === r.cle ? "chevron-up" : "chevron-down"} size={rf(18)} color={C.textMuted} />
            </TouchableOpacity>
            {ouverte === r.cle && r.points.map((p, i) => (
              <Text key={i} style={s.point}>• {p}</Text>
            ))}
          </View>
        ))}

        {/* ── Signaler un problème ── */}
        <Text style={s.section}>Signaler un problème</Text>
        <View style={s.card}>
          <Text style={s.note}>Sur quel écran ?</Text>
          <View style={s.chips}>
            {rubriques.map(r => (
              <TouchableOpacity key={r.cle} style={[s.chip, ecran === r.cle && s.chipOn]} onPress={() => setEcran(r.cle)}>
                <Text style={[s.chipTxt, ecran === r.cle && s.chipTxtOn]}>{r.titre}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={s.input} multiline value={description} onChangeText={setDescription} maxLength={1500}
            placeholder="Que s'est-il passé ? Qu'avez-vous fait juste avant ?" placeholderTextColor={C.textMuted}
          />
          <Text style={s.note}>La version de l'application et l'état des envois sont joints automatiquement. Aucune photo ni donnée d'élève.</Text>
          <TouchableOpacity
            style={[s.btn, (description.trim().length < 5 || envoi) && { opacity: 0.5 }]}
            disabled={description.trim().length < 5 || envoi} onPress={signaler}
          >
            {envoi ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Envoyer le signalement</Text>}
          </TouchableOpacity>
          {derniereRef && <Text style={[s.note, { fontWeight: "700", color: C.text }]}>Dernière référence : {derniereRef}</Text>}
          {params?.support_contact ? (
            <Text style={s.note}>En cas d'urgence : {params.support_contact}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Ligne({ lib, val }: { lib: string; val: string }) {
  return (
    <View style={s.ligne}>
      <Text style={s.ligneLib}>{lib}</Text>
      <Text style={s.ligneVal}>{val}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: "row", alignItems: "center", gap: rs(8), paddingHorizontal: rs(14), paddingVertical: rs(10) },
  headerTitle:  { fontSize: rf(18), fontWeight: "800", color: C.text },
  content:      { paddingHorizontal: rs(14), gap: rs(10) },
  section:      { fontSize: rf(14), fontWeight: "800", color: C.text, marginTop: rs(10) },
  card:         { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14), padding: rs(14), gap: rs(8) },
  ligne:        { flexDirection: "row", justifyContent: "space-between", gap: rs(10) },
  ligneLib:     { fontSize: rf(13), color: C.textMuted, flex: 1 },
  ligneVal:     { fontSize: rf(13), color: C.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  etat:         { flexDirection: "row", alignItems: "center", gap: rs(8), borderRadius: rs(10), padding: rs(10) },
  etatTxt:      { flex: 1, fontSize: rf(13), fontWeight: "600" },
  note:         { fontSize: rf(12), color: C.textMuted, lineHeight: rf(18) },
  rubriqueRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rubriqueTitre:{ fontSize: rf(14), fontWeight: "700", color: C.text },
  point:        { fontSize: rf(13), color: C.text, lineHeight: rf(20) },
  chips:        { flexDirection: "row", flexWrap: "wrap", gap: rs(6) },
  chip:         { paddingHorizontal: rs(10), paddingVertical: rs(6), borderRadius: rs(14), borderWidth: 1, borderColor: C.border },
  chipOn:       { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt:      { fontSize: rf(12), color: C.text, fontWeight: "600" },
  chipTxtOn:    { color: "#fff" },
  input:        { borderWidth: 1, borderColor: C.border, borderRadius: rs(10), padding: rs(12), minHeight: rs(90), textAlignVertical: "top", fontSize: rf(14), color: C.text, backgroundColor: C.bg },
  btn:          { backgroundColor: C.brand, borderRadius: rs(12), paddingVertical: rs(13), alignItems: "center" },
  btnTxt:       { color: "#fff", fontSize: rf(15), fontWeight: "700" },
});
