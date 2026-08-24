/**
 * Remplacement d'un élève par le tuteur.
 *
 * Un élève quitte la classe en cours d'année (déménagement, abandon) et un
 * remplaçant déjà recensé dans la Base NWV 2026 (RCT) le remplace : le
 * tuteur le fait lui-même depuis son profil, sans attendre une correction
 * côté dashboard.
 *
 * Parcours : liste de ses titulaires → il en choisit un → il choisit un
 * remplaçant de la même classe (pas de saisie libre) → confirmation.
 *
 * Côté serveur (POST /app/remplacements) l'effet est immédiat : le titulaire
 * sortant passe en statut « inactif », le remplaçant est promu « Titulaire »
 * (il rejoint les listes du tuteur), et l'opération est journalisée pour
 * remonter au dashboard admin.
 */
import React, { useMemo, useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useStore } from "../store/useStore";
import { remplacementsApi } from "../services/api";
import AjouterRemplacantSheet from "./AjouterRemplacantSheet";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

interface EleveLocal { id: string; nom: string; prenom: string | null; classe: string }

interface Props {
  visible: boolean;
  onClose: () => void;
}

const nomComplet = (e: EleveLocal) => (e.prenom ? `${e.prenom} ${e.nom}` : e.nom);
const initiales   = (e: EleveLocal) =>
  `${e.nom.charAt(0)}${(e.prenom ?? "").charAt(0)}`.toUpperCase();

export default function RemplacementSheet({ visible, onClose }: Props) {
  const { syncData, isOnline, syncOffline } = useStore();

  const [choisi,     setChoisi]     = useState<EleveLocal | null>(null);
  const [remplacant, setRemplacant] = useState<EleveLocal | null>(null);
  const [envoi,      setEnvoi]      = useState(false);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  // Remplaçant tout juste ajouté par le tuteur, pas encore remonté dans
  // syncData.remplacants (le refresh est asynchrone) — on l'ajoute nous-mêmes
  // pour qu'il soit sélectionnable immédiatement, sans changer d'écran.
  const [ajoutesLocalement, setAjoutesLocalement] = useState<EleveLocal[]>([]);

  // Élèves du tuteur, restreints à ses classes (même règle que le rapport) —
  // déjà uniquement des titulaires, le serveur ne renvoie plus les
  // remplaçants dans `eleves`. Triés par nom pour être retrouvés du regard.
  const eleves: EleveLocal[] = useMemo(() => {
    const tous    = (syncData?.eleves ?? []) as EleveLocal[];
    const classes = syncData?.profile?.classes ?? null;
    const filtres = classes?.length ? tous.filter(e => classes.includes(e.classe)) : tous;
    return [...filtres].sort((a, b) => nomComplet(a).localeCompare(nomComplet(b)));
  }, [syncData]);

  // Remplaçants disponibles pour la classe de l'élève choisi.
  const remplacants: EleveLocal[] = useMemo(() => {
    if (!choisi) return [];
    const tous = (syncData?.remplacants ?? []) as EleveLocal[];
    const fusion = [...tous, ...ajoutesLocalement.filter(a => !tous.some(t => t.id === a.id))];
    return fusion
      .filter(e => e.classe === choisi.classe)
      .sort((a, b) => nomComplet(a).localeCompare(nomComplet(b)));
  }, [syncData, choisi, ajoutesLocalement]);

  const fermer = () => {
    setChoisi(null); setRemplacant(null);
    onClose();
  };

  const confirmer = async () => {
    if (!choisi || !remplacant || envoi) return;
    if (!isOnline) {
      Alert.alert(
        "Connexion requise",
        "Le remplacement modifie la liste de vos élèves : il ne peut pas être enregistré hors-ligne. Réessayez une fois connecté.",
      );
      return;
    }

    setEnvoi(true);
    try {
      await remplacementsApi.create({
        ancien_eleve_id:   choisi.id,
        nouveau_eleve_id:  remplacant.id,
        motif:             "Remplacement saisi par le tuteur",
      });
      // La liste des élèves vient de la synchronisation : on la rafraîchit pour
      // que le remplaçant apparaisse tout de suite dans les rapports.
      await syncOffline(true).catch(() => {});
      Alert.alert(
        "Remplacement enregistré",
        `${nomComplet(choisi)} a été remplacé par ${nomComplet(remplacant)}.`,
        [{ text: "OK", onPress: fermer }],
      );
    } catch {
      Alert.alert("Erreur", "Le remplacement n'a pas pu être enregistré. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={fermer}>
      <View style={s.fond}>
        <KeyboardAvoidingView
          style={s.feuille}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* En-tête */}
          <View style={s.enTete}>
            <View style={s.enTeteIcone}>
              <Feather name="repeat" size={rf(18)} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.titre}>Remplacer un élève</Text>
              <Text style={s.sousTitre}>
                {choisi
                  ? remplacants.length > 0
                    ? `Choisissez le remplaçant · ${remplacants.length} disponible${remplacants.length > 1 ? "s" : ""}`
                    : "Aucun remplaçant disponible"
                  : `Choisissez l'élève qui quitte la classe · ${eleves.length} élève${eleves.length > 1 ? "s" : ""}`}
              </Text>
            </View>
            <TouchableOpacity onPress={fermer} style={s.fermer} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={rf(18)} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          {!choisi ? (
            /* ── Étape 1 : choisir l'élève sortant ── */
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                {eleves.length === 0 ? (
                  <View style={s.vide}>
                    <Feather name="users" size={rf(30)} color={C.border} />
                    <Text style={s.videTxt}>
                      Aucun élève dans vos classes. Synchronisez vos données.
                    </Text>
                  </View>
                ) : eleves.map(e => (
                  <TouchableOpacity
                    key={e.id}
                    style={s.ligne}
                    onPress={() => { setChoisi(e); setRemplacant(null); }}
                    activeOpacity={0.7}
                  >
                    <View style={s.avatar}>
                      <Text style={s.avatarTxt}>{initiales(e)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.ligneNom} numberOfLines={1}>{nomComplet(e)}</Text>
                      <Text style={s.ligneClasse}>{e.classe}</Text>
                    </View>
                    <Feather name="chevron-right" size={rf(18)} color={C.textMuted} />
                  </TouchableOpacity>
                ))}
              <View style={{ height: rs(20) }} />
            </ScrollView>
          ) : (
            /* ── Étape 2 : choisir le remplaçant ── */
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              <View style={s.sortant}>
                <Feather name="user-minus" size={rf(15)} color={C.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={s.sortantNom}>{nomComplet(choisi)}</Text>
                  <Text style={s.sortantClasse}>Quitte la classe {choisi.classe}</Text>
                </View>
                <TouchableOpacity onPress={() => { setChoisi(null); setRemplacant(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.changer}>Changer</Text>
                </TouchableOpacity>
              </View>

              {remplacants.length === 0 ? (
                <View style={s.vide}>
                  <Feather name="user-x" size={rf(30)} color={C.border} />
                  <Text style={s.videTxt}>
                    Aucun remplaçant disponible pour la classe {choisi.classe}.
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={s.ajouterLien}
                onPress={() => setAjoutOuvert(true)}
                activeOpacity={0.7}
              >
                <Feather name="user-plus" size={rf(15)} color={C.brand} />
                <Text style={s.ajouterLienTxt}>Ajouter un remplaçant pour cette classe</Text>
              </TouchableOpacity>

              {remplacants.length > 0 && (
                remplacants.map(e => (
                  <TouchableOpacity
                    key={e.id}
                    style={[s.ligne, remplacant?.id === e.id && s.ligneChoisie]}
                    onPress={() => setRemplacant(e)}
                    activeOpacity={0.7}
                  >
                    <View style={s.avatar}>
                      <Text style={s.avatarTxt}>{initiales(e)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.ligneNom} numberOfLines={1}>{nomComplet(e)}</Text>
                      <Text style={s.ligneClasse}>{e.classe}</Text>
                    </View>
                    <Feather
                      name={remplacant?.id === e.id ? "check-circle" : "circle"}
                      size={rf(18)}
                      color={remplacant?.id === e.id ? C.brand : C.textMuted}
                    />
                  </TouchableOpacity>
                ))
              )}

              {remplacants.length > 0 && (
                <>
                  <Text style={s.avertissement}>
                    L&apos;ancien élève sortira de vos listes et le remplaçant les rejoindra
                    immédiatement, dans la même classe.
                  </Text>

                  <TouchableOpacity
                    style={[s.valider, (envoi || !remplacant) && s.valideDesactive]}
                    onPress={confirmer}
                    disabled={envoi || !remplacant}
                    activeOpacity={0.85}
                  >
                    {envoi
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <>
                          <Feather name="check" size={rf(16)} color={!remplacant ? C.textMuted : "#fff"} />
                          <Text style={[s.validerTxt, !remplacant && { color: C.textMuted }]}>
                            Confirmer le remplacement
                          </Text>
                        </>}
                  </TouchableOpacity>
                </>
              )}
              <View style={{ height: rs(24) }} />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>

      <AjouterRemplacantSheet
        visible={ajoutOuvert}
        onClose={() => setAjoutOuvert(false)}
        classes={choisi ? [choisi.classe] : []}
        classeInitiale={choisi?.classe}
        onCreated={(e) => {
          setAjoutesLocalement(prev => [...prev, e]);
          setRemplacant(e);
          syncOffline(true).catch(() => {});
        }}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  fond:    { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  feuille: {
    backgroundColor: C.bg,
    // Hauteur FIXE et non un simple maxHeight : sans elle, le ScrollView en
    // flex:1 n'a aucune hauteur à remplir et la liste des élèves s'écrase à
    // quelques pixels. La feuille s'ouvre donc grande, liste visible d'emblée.
    height: "88%",
    borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24),
    paddingHorizontal: rs(18), paddingTop: rs(16), paddingBottom: rs(10),
  },

  enTete:      { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(14) },
  enTeteIcone: { width: rs(42), height: rs(42), borderRadius: rs(13), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  titre:       { fontSize: rf(18), fontWeight: "800", color: C.text },
  sousTitre:   { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },
  fermer:      { width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },


  ligne: {
    flexDirection: "row", alignItems: "center", gap: rs(12),
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(13), padding: rs(12), marginBottom: rs(8),
  },
  ligneChoisie: {
    borderColor: C.brand, borderWidth: 1.5, backgroundColor: C.brandSoft,
  },
  avatar:     { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  avatarTxt:  { fontSize: rf(14), fontWeight: "700", color: C.brand },
  ligneNom:   { fontSize: rf(15), fontWeight: "700", color: C.text },
  ligneClasse:{ fontSize: rf(12), color: C.textMuted, marginTop: rs(2) },

  vide:    { alignItems: "center", gap: rs(10), paddingVertical: rs(40) },
  videTxt: { fontSize: rf(14), color: C.textMuted, textAlign: "center", paddingHorizontal: rs(30), lineHeight: rf(20) },

  ajouterLien: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8),
    borderWidth: 1, borderColor: C.brand, borderStyle: "dashed",
    borderRadius: rs(13), paddingVertical: rs(12), marginBottom: rs(12),
  },
  ajouterLienTxt: { fontSize: rf(13.5), fontWeight: "700", color: C.brand },

  sortant: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    backgroundColor: C.dangerSoft, borderWidth: 1, borderColor: C.danger + "33",
    borderRadius: rs(13), padding: rs(12), marginBottom: rs(16),
  },
  sortantNom:    { fontSize: rf(15), fontWeight: "700", color: C.text },
  sortantClasse: { fontSize: rf(12), color: C.textMuted, marginTop: rs(2) },
  changer:       { fontSize: rf(13), fontWeight: "700", color: C.brand, textDecorationLine: "underline" },

  avertissement: { fontSize: rf(12.5), color: C.textMuted, lineHeight: rf(18), marginBottom: rs(16) },

  valider: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8),
    backgroundColor: C.brand, borderRadius: rs(14), paddingVertical: rs(15),
  },
  valideDesactive: { backgroundColor: C.surfaceAlt },
  validerTxt:      { fontSize: rf(16), fontWeight: "800", color: "#fff" },
});
