/**
 * Visites pédagogiques et demandes d'appui — superviseur (rapport V2, D2.3 / D9.3).
 *
 * Une visite est distincte du pointage de présence : tuteur observé, classe,
 * réponses aux items de la grille publiée (version figée côté serveur), points
 * d'appui / à améliorer et recommandations transformées en demandes d'appui.
 *
 * Hors ligne : la grille et la liste des tuteurs viennent du cache chiffré ;
 * l'envoi passe toujours par la file (SUBMIT_VISITE) avec un client_op_id —
 * un rejeu ne crée jamais de doublon. « Non applicable » et « non renseigné »
 * ne valent jamais zéro dans les scores calculés par le serveur.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useStore } from "../../store/useStore";
import { superviseurApi } from "../../services/api";
import {
  getCachedDemandes, getCachedGrilles, getCachedVisites, setCachedDemandes, setCachedGrilles, setCachedVisites,
  type DemandeMobile, type GrilleItemMobile, type GrilleMobile, type VisiteMobile,
} from "../../services/cache";
import { enqueueAction, getSupervisorTeachersCache } from "../../services/db";
import { flushQueue } from "../../services/queue";
import { trackUsage } from "../../services/usage";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";

type Onglet = "nouvelle" | "visites" | "appui";
type Reponse = { valeur?: number | null; disponible?: boolean | null; texte?: string; non_applicable?: boolean };
type Reco = { titre: string; echeance: string };

const STATUTS: Record<string, string> = {
  ouverte: "Ouverte", assignee: "Affectée", en_cours: "En cours", resolue: "Résolue", abandonnee: "Abandonnée",
};
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmt = (iso?: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—";

function Choix({ libelle, actif, onPress, ton }: { libelle: string; actif: boolean; onPress: () => void; ton?: "ok" | "ko" }) {
  const fond = actif ? (ton === "ko" ? C.danger : ton === "ok" ? C.success : C.brand) : C.surfaceAlt;
  return (
    <TouchableOpacity onPress={onPress} style={[st.choix, { backgroundColor: fond }]} accessibilityState={{ selected: actif }}>
      <Text style={[st.choixTxt, actif && { color: "#fff" }]}>{libelle}</Text>
    </TouchableOpacity>
  );
}

function ItemSaisie({ it, r, onChange }: { it: GrilleItemMobile; r: Reponse; onChange: (r: Reponse) => void }) {
  const na = !!r.non_applicable;
  return (
    <View style={st.item}>
      <Text style={st.itemTitre}>{it.code} · {it.libelle}{it.obligatoire ? " *" : ""}</Text>
      {it.aide ? <Text style={st.aide}>{it.aide}</Text> : null}
      <View style={st.ligneChoix}>
        {it.type === "echelle" && Array.from({ length: (it.bareme_max ?? 3) + 1 }, (_, v) => (
          <Choix key={v} libelle={String(v)} actif={!na && r.valeur === v} onPress={() => onChange({ valeur: v })} />
        ))}
        {it.type === "oui_non" && (
          <>
            <Choix libelle="Oui" ton="ok" actif={!na && r.valeur === 1} onPress={() => onChange({ valeur: 1 })} />
            <Choix libelle="Non" ton="ko" actif={!na && r.valeur === 0} onPress={() => onChange({ valeur: 0 })} />
          </>
        )}
        {it.type === "outil" && (
          <>
            <Choix libelle="Disponible" ton="ok" actif={!na && r.disponible === true} onPress={() => onChange({ disponible: true })} />
            <Choix libelle="Indisponible" ton="ko" actif={!na && r.disponible === false} onPress={() => onChange({ disponible: false })} />
          </>
        )}
        {it.type !== "texte" && (
          <Choix libelle="N/A" actif={na} onPress={() => onChange(na ? {} : { non_applicable: true })} />
        )}
      </View>
      {it.type === "texte" && (
        <TextInput style={st.input} multiline value={r.texte ?? ""} onChangeText={t => onChange({ texte: t })} placeholder="Observation" />
      )}
    </View>
  );
}

export default function SupVisitesScreen() {
  useEffect(() => { trackUsage("visites").catch(() => {}); }, []);
  const { user, isOnline } = useStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>("nouvelle");
  const [chargement, setChargement] = useState(true);
  const [rafraichir, setRafraichir] = useState(false);

  const [grilles, setGrilles] = useState<GrilleMobile[]>([]);
  const [visites, setVisites] = useState<VisiteMobile[]>([]);
  const [demandes, setDemandes] = useState<DemandeMobile[]>([]);
  const tuteurs = useMemo(() => {
    try { return getSupervisorTeachersCache(); } catch { return []; }
  }, [chargement]); // eslint-disable-line react-hooks/exhaustive-deps

  // Formulaire
  const [grilleId, setGrilleId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [dateVisite, setDateVisite] = useState(aujourdhui());
  const [classe, setClasse] = useState("");
  const [heure, setHeure] = useState("");
  const [duree, setDuree] = useState("");
  const [reponses, setReponses] = useState<Record<string, Reponse>>({});
  const [pointsAppui, setPointsAppui] = useState("");
  const [pointsAmelioration, setPointsAmelioration] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [recos, setRecos] = useState<Reco[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});

  const grille = grilles.find(g => g.id === grilleId) ?? grilles[0] ?? null;

  const charger = useCallback(async () => {
    // Cache d'abord (hors ligne), puis serveur si disponible.
    const [g, v, d] = await Promise.all([getCachedGrilles(), getCachedVisites(), getCachedDemandes()]);
    if (g) setGrilles(g);
    if (v) setVisites(v);
    if (d) setDemandes(d);
    if (!isOnline) return;
    try {
      const [rg, rv, rd] = await Promise.all([
        superviseurApi.grillesVisite(), superviseurApi.mesVisites({ limit: 50 }), superviseurApi.demandesAppui("ouvertes"),
      ]);
      setGrilles(rg.data); setVisites(rv.data.items ?? []); setDemandes(rd.data);
      await Promise.all([setCachedGrilles(rg.data), setCachedVisites(rv.data.items ?? []), setCachedDemandes(rd.data)]).catch(() => {});
    } catch { /* hors ligne ou serveur indisponible : on garde le cache */ }
  }, [isOnline]);

  useEffect(() => { charger().finally(() => setChargement(false)); }, [charger]);

  const reinitialiser = () => {
    setTeacherId(null); setClasse(""); setHeure(""); setDuree(""); setReponses({});
    setPointsAppui(""); setPointsAmelioration(""); setCommentaire(""); setRecos([]); setDateVisite(aujourdhui());
  };

  const envoyer = async () => {
    if (!grille) return Alert.alert("Grille indisponible", "Synchronisez l'application en ligne pour recevoir la grille de visite.");
    if (!teacherId) return Alert.alert("Tuteur manquant", "Choisissez le tuteur observé.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVisite)) return Alert.alert("Date invalide", "Format attendu : AAAA-MM-JJ.");
    if (heure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) return Alert.alert("Heure invalide", "Format attendu : HH:MM.");
    const manquants = grille.items.filter(i => i.obligatoire && !reponses[i.id]).map(i => i.code);
    if (manquants.length) return Alert.alert("Items obligatoires", `À renseigner : ${manquants.join(", ")}`);

    const corps = {
      client_op_id: Crypto.randomUUID(),
      submitted_at: new Date().toISOString(),
      teacher_id: teacherId, grille_id: grille.id, date_visite: dateVisite,
      classe: classe.trim() || null, heure_debut: heure || null, duree_minutes: duree ? Number(duree) : null,
      points_appui: pointsAppui.trim() || null, points_amelioration: pointsAmelioration.trim() || null,
      commentaire: commentaire.trim() || null,
      reponses: Object.entries(reponses).map(([item_id, r]) => ({
        item_id, valeur: r.valeur ?? null, disponible: r.disponible ?? null, texte: r.texte?.trim() || null,
        non_applicable: !!r.non_applicable,
      })),
      recommandations: recos.filter(r => r.titre.trim()).map(r => ({
        titre: r.titre.trim(), echeance: /^\d{4}-\d{2}-\d{2}$/.test(r.echeance) ? r.echeance : null,
      })),
    };
    setEnvoi(true);
    try {
      enqueueAction("SUBMIT_VISITE", corps);
      if (isOnline) await flushQueue().catch(() => 0);
      reinitialiser();
      Alert.alert("Visite enregistrée", isOnline
        ? "La visite a été envoyée (ou le sera dès que possible)."
        : "Hors ligne : la visite sera envoyée automatiquement au retour du réseau.");
      charger();
    } finally { setEnvoi(false); }
  };

  const agir = async (d: DemandeMobile, statut: string) => {
    const c = (commentaires[d.id] ?? "").trim();
    if ((statut === "resolue" || statut === "abandonnee") && c.length < 2) {
      return Alert.alert("Commentaire requis", "Indiquez ce qui a été fait avant de clôturer la demande.");
    }
    if (!isOnline) return Alert.alert("Hors ligne", "Le suivi des demandes d'appui nécessite une connexion.");
    try {
      await superviseurApi.agirDemande(d.id, { statut, commentaire: c || null });
      setCommentaires(x => ({ ...x, [d.id]: "" }));
      charger();
    } catch {
      Alert.alert("Échec", "La mise à jour n'a pas pu être enregistrée. Réessayez.");
    }
  };

  const syncOffline = useStore(s => s.syncOffline);
  const [syncing, setSyncing] = useState(false);
  const syncManuelle = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try { await Promise.all([syncOffline(true).catch(() => {}), charger()]); } finally { setSyncing(false); }
  };

  if (chargement) {
    return <View style={st.centre}><ActivityIndicator size="large" color={C.brand} /></View>;
  }

  return (
    <View style={st.root}>
      <AppHeader userName={user?.name ?? ""} onAvatarPress={() => setProfileOpen(true)} onSyncPress={syncManuelle}
                 syncing={syncing} isOnline={isOnline} sectionLabel="Espace Superviseur" />
      <View style={st.onglets}>
        {([["nouvelle", "Nouvelle visite"], ["visites", "Mes visites"], ["appui", `Appui (${demandes.length})`]] as [Onglet, string][]).map(([k, l]) => (
          <TouchableOpacity key={k} style={[st.onglet, onglet === k && st.ongletActif]} onPress={() => setOnglet(k)}>
            <Text style={[st.ongletTxt, onglet === k && { color: "#fff" }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={st.contenu} keyboardShouldPersistTaps="handled"
                  refreshControl={<RefreshControl refreshing={rafraichir} tintColor={C.brand}
                    onRefresh={async () => { setRafraichir(true); await charger(); setRafraichir(false); }} />}>
        {onglet === "nouvelle" && (
          !grille ? (
            <View style={st.vide}>
              <Feather name="clipboard" size={rs(36)} color={C.textMuted} />
              <Text style={st.videTxt}>Aucune grille de visite publiée. Elle apparaîtra ici après publication par la coordination et une synchronisation en ligne.</Text>
            </View>
          ) : (
            <>
              {grilles.length > 1 && (
                <View style={st.ligneChoix}>
                  {grilles.map(g => <Choix key={g.id} libelle={`${g.nom} v${g.version}`} actif={g.id === grille.id} onPress={() => { setGrilleId(g.id); setReponses({}); }} />)}
                </View>
              )}
              <Text style={st.section}>Tuteur observé</Text>
              <View style={st.ligneChoix}>
                {tuteurs.map(t => (
                  <Choix key={t.teacher_id} libelle={t.teacher_nom} actif={teacherId === t.teacher_id}
                         onPress={() => { setTeacherId(t.teacher_id); if (!classe && t.teacher_cls !== "—") setClasse(t.teacher_cls); }} />
                ))}
                {!tuteurs.length && <Text style={st.aide}>Ouvrez d’abord l’onglet Accueil en ligne pour charger vos tuteurs.</Text>}
              </View>
              <View style={st.grille2}>
                <View style={st.col}><Text style={st.label}>Date (AAAA-MM-JJ)</Text><TextInput style={st.input} value={dateVisite} onChangeText={setDateVisite} /></View>
                <View style={st.col}><Text style={st.label}>Classe</Text><TextInput style={st.input} value={classe} onChangeText={setClasse} /></View>
                <View style={st.col}><Text style={st.label}>Début (HH:MM)</Text><TextInput style={st.input} value={heure} onChangeText={setHeure} placeholder="08:30" /></View>
                <View style={st.col}><Text style={st.label}>Durée (min)</Text><TextInput style={st.input} value={duree} onChangeText={t => setDuree(t.replace(/\D/g, ""))} keyboardType="number-pad" /></View>
              </View>

              {grille.description ? <Text style={st.aide}>{grille.description}</Text> : null}
              {Array.from(new Set(grille.items.map(i => i.domaine))).map(dom => (
                <View key={dom}>
                  <Text style={st.section}>{dom}</Text>
                  {grille.items.filter(i => i.domaine === dom).sort((a, b) => a.ordre - b.ordre).map(it => (
                    <ItemSaisie key={it.id} it={it} r={reponses[it.id] ?? {}}
                                onChange={r => setReponses(x => {
                                  const n = { ...x };
                                  if (Object.keys(r).length === 0) delete n[it.id]; else n[it.id] = r;
                                  return n;
                                })} />
                  ))}
                </View>
              ))}

              <Text style={st.section}>Synthèse</Text>
              <Text style={st.label}>Points d’appui</Text>
              <TextInput style={[st.input, st.multi]} multiline value={pointsAppui} onChangeText={setPointsAppui} />
              <Text style={st.label}>Points à améliorer</Text>
              <TextInput style={[st.input, st.multi]} multiline value={pointsAmelioration} onChangeText={setPointsAmelioration} />
              <Text style={st.label}>Commentaire</Text>
              <TextInput style={[st.input, st.multi]} multiline value={commentaire} onChangeText={setCommentaire} />

              <Text style={st.section}>Recommandations (deviennent des demandes d’appui)</Text>
              {recos.map((r, i) => (
                <View key={i} style={st.reco}>
                  <TextInput style={[st.input, { flex: 1 }]} value={r.titre} placeholder="Action recommandée"
                             onChangeText={t => setRecos(x => x.map((y, j) => (j === i ? { ...y, titre: t } : y)))} />
                  <TextInput style={[st.input, { width: rs(110) }]} value={r.echeance} placeholder="Échéance"
                             onChangeText={t => setRecos(x => x.map((y, j) => (j === i ? { ...y, echeance: t } : y)))} />
                  <TouchableOpacity onPress={() => setRecos(x => x.filter((_, j) => j !== i))}><Feather name="x" size={rs(18)} color={C.danger} /></TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={st.btnSec} onPress={() => setRecos(x => [...x, { titre: "", echeance: "" }])}>
                <Text style={st.btnSecTxt}>+ Ajouter une recommandation</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[st.btn, envoi && { opacity: 0.6 }]} disabled={envoi} onPress={envoyer}>
                <Text style={st.btnTxt}>{envoi ? "Enregistrement…" : "Enregistrer la visite"}</Text>
              </TouchableOpacity>
            </>
          )
        )}

        {onglet === "visites" && (
          visites.length === 0 ? <Text style={st.videTxt}>Aucune visite envoyée.</Text> : visites.map(v => (
            <View key={v.id} style={st.carte}>
              <Text style={st.carteTitre}>{v.teacher_nom ?? "Tuteur"} · {fmt(v.date_visite)}</Text>
              <Text style={st.carteSous}>{v.ecole ?? ""}{v.classe ? ` · ${v.classe}` : ""}</Text>
              <Text style={st.carteSous}>
                Score {v.score_max ? `${v.score_obtenu} / ${v.score_max}` : "—"} · {v.nb_items_manquants} non renseigné(s) · {v.nb_outils_indisponibles} outil(s) manquant(s)
                {v.statut === "annulee" ? " · annulée" : ""}
              </Text>
              {v.demandes.map(d => <Text key={d.id} style={st.aide}>→ {d.titre} ({STATUTS[d.statut] ?? d.statut})</Text>)}
            </View>
          ))
        )}

        {onglet === "appui" && (
          demandes.length === 0 ? <Text style={st.videTxt}>Aucune demande d’appui ouverte.</Text> : demandes.map(d => (
            <View key={d.id} style={st.carte}>
              <Text style={st.carteTitre}>{d.titre}</Text>
              <Text style={st.carteSous}>{d.beneficiaire_nom ?? "—"}{d.ecole ? ` · ${d.ecole}` : ""} · {STATUTS[d.statut] ?? d.statut}
                {d.echeance ? ` · échéance ${fmt(d.echeance)}` : ""}{d.en_retard ? " · EN RETARD" : ""}</Text>
              {d.description ? <Text style={st.aide}>{d.description}</Text> : null}
              <TextInput style={st.input} placeholder="Commentaire (obligatoire pour clôturer)" value={commentaires[d.id] ?? ""}
                         onChangeText={t => setCommentaires(x => ({ ...x, [d.id]: t }))} />
              <View style={st.ligneChoix}>
                {d.statut !== "en_cours" && <Choix libelle="En cours" actif={false} onPress={() => agir(d, "en_cours")} />}
                <Choix libelle="Résolue" ton="ok" actif={false} onPress={() => agir(d, "resolue")} />
                <Choix libelle="Abandonner" ton="ko" actif={false} onPress={() => agir(d, "abandonnee")} />
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

const st = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  centre:    { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  onglets:   { flexDirection: "row", gap: rs(6), paddingHorizontal: rs(14), paddingTop: rs(10) },
  onglet:    { flex: 1, paddingVertical: rs(8), borderRadius: rs(10), backgroundColor: C.surfaceAlt, alignItems: "center" },
  ongletActif: { backgroundColor: C.brand },
  ongletTxt: { fontSize: rf(13), fontWeight: "700", color: C.text },
  contenu:   { padding: rs(14), gap: rs(8), paddingBottom: rs(40) },
  section:   { fontSize: rf(15), fontWeight: "800", color: C.text, marginTop: rs(12) },
  label:     { fontSize: rf(12), fontWeight: "700", color: C.textMuted, marginTop: rs(4) },
  aide:      { fontSize: rf(12.5), color: C.textMuted, lineHeight: rf(18) },
  input:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(10), paddingHorizontal: rs(10), paddingVertical: rs(8), fontSize: rf(14), color: C.text },
  multi:     { minHeight: rs(64), textAlignVertical: "top" },
  grille2:   { flexDirection: "row", flexWrap: "wrap", gap: rs(8) },
  col:       { width: "47%" },
  ligneChoix: { flexDirection: "row", flexWrap: "wrap", gap: rs(6), marginTop: rs(4) },
  choix:     { paddingHorizontal: rs(12), paddingVertical: rs(7), borderRadius: rs(8), minWidth: rs(40), alignItems: "center" },
  choixTxt:  { fontSize: rf(13), fontWeight: "700", color: C.text },
  item:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(12), padding: rs(12), marginTop: rs(6), gap: rs(4) },
  itemTitre: { fontSize: rf(14), fontWeight: "600", color: C.text },
  reco:      { flexDirection: "row", alignItems: "center", gap: rs(6) },
  btn:       { backgroundColor: C.brand, borderRadius: rs(12), paddingVertical: rs(14), alignItems: "center", marginTop: rs(16) },
  btnTxt:    { color: "#fff", fontSize: rf(15), fontWeight: "800" },
  btnSec:    { borderWidth: 1, borderColor: C.border, borderRadius: rs(10), paddingVertical: rs(10), alignItems: "center" },
  btnSecTxt: { color: C.text, fontSize: rf(13), fontWeight: "700" },
  carte:     { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(14), padding: rs(14), gap: rs(6) },
  carteTitre: { fontSize: rf(15), fontWeight: "700", color: C.text },
  carteSous: { fontSize: rf(12.5), color: C.textMuted },
  vide:      { alignItems: "center", gap: rs(12), paddingVertical: rs(50) },
  videTxt:   { fontSize: rf(14), color: C.textMuted, textAlign: "center", lineHeight: rf(21) },
});
