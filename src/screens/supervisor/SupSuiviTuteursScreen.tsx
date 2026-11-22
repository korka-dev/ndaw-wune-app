/**
 * Suivi des tuteurs affectés (lot L7, retours terrain).
 *
 * Quatre onglets, tous limités aux tuteurs affectés au superviseur :
 *  - Tuteurs   : fraîcheur des données (dernière synchronisation, rapports
 *                récents). Une absence de synchronisation n'est pas une
 *                absence de travail : l'écran parle de données, pas de personnes (RET13).
 *  - Rapports  : rapports journaliers des tuteurs, avec retour écrit (RET05).
 *  - À valider : demandes de remplacement, quand ARED impose une validation (RET03).
 *  - Messages  : questions des tuteurs adressées au superviseur (RET13).
 *
 * Nécessite le réseau (consultation) ; la dernière liste chargée reste affichée.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput, RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import BackButton from "../../components/BackButton";
import { dateCourte } from "../../utils/statutRapport";

type Onglet = "tuteurs" | "rapports" | "valider" | "messages";

interface Activite { teacher_id: string; nom: string; derniere_sync_le: string | null; version_app: string | null;
  dernier_rapport: string | null; rapports_7_jours: number; fraicheur: string }
interface RapportT { id: string; teacher_id: string; nom_tuteur: string; date_rapport: string; semaine: number; jour_cours: number;
  nb_absences: number; difficultes: string; description_difficultes: string | null; besoin_appui: boolean;
  domaines_appui: string | null; commentaires: string | null; created_at: string; statut: string;
  retour_superviseur: string | null; retour_le: string | null }
interface Rempl { id: string; ancien_eleve_nom: string | null; nouveau_eleve_nom: string; motif: string; classe: string;
  statut: string; teacher_name: string | null; date_remplacement: string; motif_refus?: string | null }
interface Message { id: string; user_name: string; categorie: string; message: string; statut: string;
  contexte_type: string | null; contexte_id: string | null; reponse_admin: string | null; created_at: string }

const diffs = (json: string) => {
  try { const a: string[] = JSON.parse(json); return a.length && a[0] !== "Aucune" ? a.join(", ") : "Aucune difficulté"; }
  catch { return "—"; }
};

export default function SupSuiviTuteursScreen() {
  const router = useRouter();
  const { isOnline } = useStore();
  const [onglet, setOnglet] = useState<Onglet>("tuteurs");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [activite, setActivite] = useState<Activite[]>([]);
  const [rapports, setRapports] = useState<RapportT[]>([]);
  const [rempl, setRempl] = useState<Rempl[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!isOnline) { setErreur("Hors connexion : la consultation des tuteurs demande le réseau."); return; }
    setChargement(true); setErreur(null);
    try {
      const [a, r, p, m] = await Promise.all([
        superviseurApi.tuteursActivite(), superviseurApi.rapportsTuteurs({ limit: 60 }),
        superviseurApi.remplacementsTuteurs(), superviseurApi.messages(),
      ]);
      setActivite(a.data ?? []); setRapports(r.data ?? []); setRempl(p.data ?? []); setMessages(m.data ?? []);
    } catch {
      setErreur("Chargement impossible. Vérifiez la connexion puis tirez pour actualiser.");
    } finally { setChargement(false); }
  }, [isOnline]);

  useEffect(() => { charger(); }, [charger]);

  const enAttente = rempl.filter(r => r.statut === "en_attente");
  const nonLus = messages.filter(m => m.statut !== "traite");

  const envoyerRetour = async (r: RapportT) => {
    const texte = (saisie[r.id] ?? "").trim();
    if (texte.length < 3) { Alert.alert("Retour trop court", "Écrivez au moins quelques mots."); return; }
    setEnvoi(r.id);
    try {
      const { data } = await superviseurApi.retourRapport(r.id, texte);
      setRapports(prev => prev.map(x => (x.id === r.id ? { ...x, ...data } : x)));
      setSaisie(prev => ({ ...prev, [r.id]: "" }));
    } catch { Alert.alert("Non envoyé", "Le retour n'a pas pu être enregistré. Réessayez."); }
    finally { setEnvoi(null); }
  };

  const decider = (r: Rempl, decision: "valider" | "refuser") => {
    const go = async (motif?: string) => {
      setEnvoi(r.id);
      try {
        const { data } = await superviseurApi.deciderRemplacement(r.id, decision, motif);
        setRempl(prev => prev.map(x => (x.id === r.id ? { ...x, ...data } : x)));
      } catch (e: any) {
        const d = e?.response?.data?.detail;
        Alert.alert("Décision non enregistrée", typeof d === "string" ? d : "Réessayez.");
      } finally { setEnvoi(null); }
    };
    if (decision === "valider") {
      Alert.alert("Valider le remplacement ?", `${r.ancien_eleve_nom ?? "—"} → ${r.nouveau_eleve_nom} (${r.classe}).`, [
        { text: "Annuler", style: "cancel" }, { text: "Valider", onPress: () => go() },
      ]);
    } else {
      const motif = (saisie[r.id] ?? "").trim();
      if (!motif) { Alert.alert("Motif requis", "Écrivez le motif du refus dans le champ sous la demande."); return; }
      go(motif);
    }
  };

  const repondre = async (m: Message) => {
    const texte = (saisie[m.id] ?? "").trim();
    if (texte.length < 2) return;
    setEnvoi(m.id);
    try {
      const { data } = await superviseurApi.repondreMessage(m.id, texte);
      setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, ...data } : x)));
      setSaisie(prev => ({ ...prev, [m.id]: "" }));
    } catch { Alert.alert("Non envoyé", "La réponse n'a pas pu être enregistrée."); }
    finally { setEnvoi(null); }
  };

  const Onglets = () => (
    <View style={s.onglets}>
      {([["tuteurs", "Tuteurs", 0], ["rapports", "Rapports", 0], ["valider", "À valider", enAttente.length],
         ["messages", "Messages", nonLus.length]] as [Onglet, string, number][]).map(([k, l, n]) => (
        <TouchableOpacity key={k} style={[s.onglet, onglet === k && s.ongletOn]} onPress={() => setOnglet(k)}>
          <Text style={[s.ongletTxt, onglet === k && s.ongletTxtOn]}>{l}{n ? ` (${n})` : ""}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // Fonction de rendu (pas un composant) : un composant défini ici serait
  // recréé à chaque frappe et le clavier se fermerait.
  const champ = (id: string, placeholder: string) => (
    <TextInput style={s.champ} value={saisie[id] ?? ""} onChangeText={t => setSaisie(p => ({ ...p, [id]: t }))}
      placeholder={placeholder} placeholderTextColor={C.textMuted} multiline maxLength={2000} />
  );

  return (
    <View style={s.root}>
      <View style={s.top}>
        <BackButton onPress={() => router.back()} style={{ marginRight: rs(10) }} />
        <Text style={s.titre}>Suivi de mes tuteurs</Text>
        {chargement && <ActivityIndicator color={C.brand} />}
      </View>
      <Onglets />
      {erreur && <Text style={s.erreur}>{erreur}</Text>}

      <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={false} onRefresh={charger} />}
        keyboardShouldPersistTaps="handled">
        {onglet === "tuteurs" && (
          <>
            <Text style={s.aide}>Fraîcheur des données reçues par le serveur. Une synchronisation ancienne ne veut pas dire que le tuteur n'a pas travaillé : son téléphone a peut-être manqué de réseau.</Text>
            {activite.length === 0 && !chargement && <Text style={s.vide}>Aucun tuteur affecté.</Text>}
            {activite.map(a => (
              <View key={a.teacher_id} style={s.carte}>
                <View style={s.ligne}>
                  <Text style={s.nom}>{a.nom}</Text>
                  <Text style={[s.puce, a.fraicheur === "à jour" ? s.puceOk : s.puceWarn]}>{a.fraicheur}</Text>
                </View>
                <Text style={s.meta}>Dernière synchronisation : {a.derniere_sync_le ? dateCourte(a.derniere_sync_le) : "jamais"}{a.version_app ? ` · app ${a.version_app}` : ""}</Text>
                <Text style={s.meta}>Dernier rapport : {a.dernier_rapport ? new Date(a.dernier_rapport).toLocaleDateString("fr-FR") : "aucun"} · {a.rapports_7_jours} sur 7 jours</Text>
              </View>
            ))}
          </>
        )}

        {onglet === "rapports" && (
          <>
            {rapports.length === 0 && !chargement && <Text style={s.vide}>Aucun rapport reçu de vos tuteurs.</Text>}
            {rapports.map(r => (
              <View key={r.id} style={s.carte}>
                <View style={s.ligne}>
                  <Text style={s.nom}>{r.nom_tuteur}</Text>
                  <Text style={s.meta}>{new Date(r.date_rapport).toLocaleDateString("fr-FR")}</Text>
                </View>
                <Text style={s.meta}>Semaine {r.semaine} · Jour {r.jour_cours} · {r.nb_absences} absent{r.nb_absences > 1 ? "s" : ""}{r.statut === "annule" ? " · annulé" : ""}</Text>
                <Text style={s.corps}>Difficultés : {diffs(r.difficultes)}</Text>
                {!!r.description_difficultes && <Text style={s.corps}>{r.description_difficultes}</Text>}
                {r.besoin_appui && <Text style={[s.corps, { color: C.warn }]}>Besoin d'appui : {r.domaines_appui ?? "—"}</Text>}
                {!!r.commentaires && <Text style={s.corps}>Observations : {r.commentaires}</Text>}
                {r.retour_superviseur ? (
                  <View style={s.retour}>
                    <Text style={s.retourTitre}>Votre retour{r.retour_le ? ` · ${dateCourte(r.retour_le)}` : ""}</Text>
                    <Text style={s.corps}>{r.retour_superviseur}</Text>
                  </View>
                ) : null}
                {champ(r.id, r.retour_superviseur ? "Modifier votre retour…" : "Écrire un retour au tuteur…")}
                <TouchableOpacity style={s.btn} onPress={() => envoyerRetour(r)} disabled={envoi === r.id}>
                  {envoi === r.id ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Envoyer le retour</Text>}
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {onglet === "valider" && (
          <>
            {rempl.length === 0 && !chargement && <Text style={s.vide}>Aucune demande de remplacement.</Text>}
            {rempl.map(r => (
              <View key={r.id} style={s.carte}>
                <Text style={s.nom}>{r.ancien_eleve_nom ?? "—"} → {r.nouveau_eleve_nom}</Text>
                <Text style={s.meta}>{r.teacher_name ?? "Tuteur"} · {r.classe} · {new Date(r.date_remplacement).toLocaleDateString("fr-FR")}</Text>
                <Text style={s.corps}>Motif : {r.motif}</Text>
                {r.statut === "en_attente" ? (
                  <>
                    {champ(r.id, "Motif en cas de refus")}
                    <View style={s.ligne}>
                      <TouchableOpacity style={[s.btn, { flex: 1, marginRight: rs(8) }]} onPress={() => decider(r, "valider")} disabled={envoi === r.id}>
                        <Text style={s.btnTxt}>Valider</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.btn, s.btnDanger, { flex: 1 }]} onPress={() => decider(r, "refuser")} disabled={envoi === r.id}>
                        <Text style={s.btnTxt}>Refuser</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <Text style={[s.meta, { marginTop: rs(4) }]}>
                    {r.statut === "refuse" ? `Refusé${r.motif_refus ? ` : ${r.motif_refus}` : ""}` : "Appliqué"}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        {onglet === "messages" && (
          <>
            {messages.length === 0 && !chargement && <Text style={s.vide}>Aucun message de vos tuteurs.</Text>}
            {messages.map(m => (
              <View key={m.id} style={s.carte}>
                <View style={s.ligne}>
                  <Text style={s.nom}>{m.user_name}</Text>
                  <Text style={s.meta}>{dateCourte(m.created_at)}</Text>
                </View>
                {!!m.contexte_type && <Text style={s.meta}>À propos : {m.contexte_type}{m.contexte_id ? ` ${m.contexte_id}` : ""}</Text>}
                <Text style={s.corps}>{m.message}</Text>
                {m.reponse_admin ? (
                  <View style={s.retour}><Text style={s.retourTitre}>Votre réponse</Text><Text style={s.corps}>{m.reponse_admin}</Text></View>
                ) : (
                  <>
                    {champ(m.id, "Répondre…")}
                    <TouchableOpacity style={s.btn} onPress={() => repondre(m)} disabled={envoi === m.id}>
                      <Text style={s.btnTxt}>Répondre</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))}
          </>
        )}
        <View style={{ height: rs(30) }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  top:    { flexDirection: "row", alignItems: "center", paddingHorizontal: rs(16), paddingVertical: rs(12), backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  titre:  { flex: 1, fontSize: rf(18), fontWeight: "800", color: C.text },
  onglets:{ flexDirection: "row", paddingHorizontal: rs(10), paddingVertical: rs(8), gap: rs(6), backgroundColor: C.surface },
  onglet: { flex: 1, paddingVertical: rs(8), borderRadius: rs(10), alignItems: "center", backgroundColor: C.bg },
  ongletOn:{ backgroundColor: C.brand },
  ongletTxt:{ fontSize: rf(12.5), fontWeight: "700", color: C.textMuted },
  ongletTxtOn:{ color: "#fff" },
  page:   { padding: rs(14) },
  aide:   { fontSize: rf(12.5), color: C.textMuted, marginBottom: rs(10), lineHeight: rf(18) },
  vide:   { textAlign: "center", color: C.textMuted, marginTop: rs(30), fontSize: rf(14) },
  erreur: { color: C.danger, fontSize: rf(13), paddingHorizontal: rs(16), paddingTop: rs(8) },
  carte:  { backgroundColor: C.surface, borderRadius: rs(14), padding: rs(14), marginBottom: rs(10), borderWidth: 1, borderColor: C.border },
  ligne:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: rs(4) },
  nom:    { fontSize: rf(15), fontWeight: "800", color: C.text, flexShrink: 1 },
  meta:   { fontSize: rf(12.5), color: C.textMuted, marginTop: rs(3) },
  corps:  { fontSize: rf(13.5), color: C.text, marginTop: rs(6), lineHeight: rf(19) },
  puce:   { fontSize: rf(11.5), fontWeight: "700", paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: rs(10), overflow: "hidden" },
  puceOk: { backgroundColor: C.successSoft, color: C.success },
  puceWarn:{ backgroundColor: C.warnSoft, color: C.warn },
  retour: { backgroundColor: C.brandSoft, borderRadius: rs(10), padding: rs(10), marginTop: rs(8) },
  retourTitre:{ fontSize: rf(12.5), fontWeight: "800", color: C.brand },
  champ:  { borderWidth: 1, borderColor: C.border, borderRadius: rs(10), padding: rs(10), marginTop: rs(10), minHeight: rs(44), color: C.text, fontSize: rf(14), textAlignVertical: "top" },
  btn:    { backgroundColor: C.brand, borderRadius: rs(10), paddingVertical: rs(11), alignItems: "center", marginTop: rs(8) },
  btnDanger:{ backgroundColor: C.danger },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: rf(14) },
});
