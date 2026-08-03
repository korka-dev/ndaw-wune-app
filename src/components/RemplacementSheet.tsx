/**
 * Remplacement d'un élève par le tuteur.
 *
 * Un élève quitte la classe en cours d'année (déménagement, abandon) et un
 * autre le remplace : le tuteur le fait lui-même depuis son profil, sans
 * attendre une correction côté dashboard.
 *
 * Parcours : liste de ses élèves → il en choisit un → il saisit le nom et le
 * prénom du remplaçant → confirmation.
 *
 * Côté serveur (POST /app/remplacements) l'effet est immédiat : le nouvel élève
 * est créé actif dans la même classe, l'ancien passe en « inactif », et
 * l'opération est journalisée pour remonter au dashboard admin.
 */
import React, { useMemo, useState } from "react";
import {
  View, Text, Modal, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useStore } from "../store/useStore";
import { remplacementsApi } from "../services/api";
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

  const [choisi,   setChoisi]   = useState<EleveLocal | null>(null);
  const [nom,      setNom]      = useState("");
  const [prenom,   setPrenom]   = useState("");
  const [envoi,    setEnvoi]    = useState(false);

  // Élèves du tuteur, restreints à ses classes (même règle que le rapport),
  // triés par nom pour être retrouvés du regard.
  const eleves: EleveLocal[] = useMemo(() => {
    const tous    = (syncData?.eleves ?? []) as EleveLocal[];
    const classes = syncData?.profile?.classes ?? null;
    const filtres = classes?.length ? tous.filter(e => classes.includes(e.classe)) : tous;
    return [...filtres].sort((a, b) => nomComplet(a).localeCompare(nomComplet(b)));
  }, [syncData]);

  const fermer = () => {
    setChoisi(null); setNom(""); setPrenom("");
    onClose();
  };

  const confirmer = async () => {
    if (!choisi || envoi) return;
    if (!nom.trim()) {
      Alert.alert("Nom manquant", "Saisissez au moins le nom du nouvel élève.");
      return;
    }
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
        ancien_eleve_nom:  nomComplet(choisi),
        // Le serveur sépare nom et prénom : on lui envoie « Prénom Nom ».
        nouveau_eleve_nom: `${prenom.trim()} ${nom.trim()}`.trim(),
        classe:            choisi.classe,
        // Le serveur exige un motif non vide ; il n'est plus demandé au
        // tuteur, on renseigne donc une valeur par défaut explicite.
        motif:             "Remplacement saisi par le tuteur",
      });
      // La liste des élèves vient de la synchronisation : on la rafraîchit pour
      // que le nouvel élève apparaisse tout de suite dans les rapports.
      await syncOffline(true).catch(() => {});
      Alert.alert(
        "Remplacement enregistré",
        `${nomComplet(choisi)} a été remplacé par ${prenom.trim()} ${nom.trim()}`.trim() + ".",
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
                  ? "Qui le remplace ?"
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
                  <TouchableOpacity key={e.id} style={s.ligne} onPress={() => setChoisi(e)} activeOpacity={0.7}>
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
            /* ── Étape 2 : saisir le remplaçant ── */
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              <View style={s.sortant}>
                <Feather name="user-minus" size={rf(15)} color={C.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={s.sortantNom}>{nomComplet(choisi)}</Text>
                  <Text style={s.sortantClasse}>Quitte la classe {choisi.classe}</Text>
                </View>
                <TouchableOpacity onPress={() => setChoisi(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.changer}>Changer</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.champLabel}>Prénom du nouvel élève</Text>
              <TextInput
                value={prenom} onChangeText={setPrenom}
                placeholder="Prénom" placeholderTextColor={C.textMuted}
                style={s.champ}
              />

              <Text style={s.champLabel}>Nom du nouvel élève *</Text>
              <TextInput
                value={nom} onChangeText={setNom}
                placeholder="Nom de famille" placeholderTextColor={C.textMuted}
                style={s.champ}
              />

              <Text style={s.avertissement}>
                L&apos;ancien élève sortira de vos listes et le nouveau les rejoindra
                immédiatement, dans la même classe.
              </Text>

              <TouchableOpacity
                style={[s.valider, (envoi || !nom.trim()) && s.valideDesactive]}
                onPress={confirmer}
                disabled={envoi || !nom.trim()}
                activeOpacity={0.85}
              >
                {envoi
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Feather name="check" size={rf(16)} color={!nom.trim() ? C.textMuted : "#fff"} />
                      <Text style={[s.validerTxt, !nom.trim() && { color: C.textMuted }]}>
                        Confirmer le remplacement
                      </Text>
                    </>}
              </TouchableOpacity>
              <View style={{ height: rs(24) }} />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
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
  avatar:     { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  avatarTxt:  { fontSize: rf(14), fontWeight: "700", color: C.brand },
  ligneNom:   { fontSize: rf(15), fontWeight: "700", color: C.text },
  ligneClasse:{ fontSize: rf(12), color: C.textMuted, marginTop: rs(2) },

  vide:    { alignItems: "center", gap: rs(10), paddingVertical: rs(40) },
  videTxt: { fontSize: rf(14), color: C.textMuted, textAlign: "center", paddingHorizontal: rs(30), lineHeight: rf(20) },

  sortant: {
    flexDirection: "row", alignItems: "center", gap: rs(10),
    backgroundColor: C.dangerSoft, borderWidth: 1, borderColor: C.danger + "33",
    borderRadius: rs(13), padding: rs(12), marginBottom: rs(16),
  },
  sortantNom:    { fontSize: rf(15), fontWeight: "700", color: C.text },
  sortantClasse: { fontSize: rf(12), color: C.textMuted, marginTop: rs(2) },
  changer:       { fontSize: rf(13), fontWeight: "700", color: C.brand, textDecorationLine: "underline" },

  champLabel: { fontSize: rf(13), fontWeight: "700", color: C.text, marginBottom: rs(6) },
  champ: {
    borderWidth: 1.5, borderColor: C.border, borderRadius: rs(12),
    paddingHorizontal: rs(12), paddingVertical: rs(11),
    fontSize: rf(15), color: C.text, backgroundColor: C.surface,
    marginBottom: rs(14),
  },

  avertissement: { fontSize: rf(12.5), color: C.textMuted, lineHeight: rf(18), marginBottom: rs(16) },

  valider: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8),
    backgroundColor: C.brand, borderRadius: rs(14), paddingVertical: rs(15),
  },
  valideDesactive: { backgroundColor: C.surfaceAlt },
  validerTxt:      { fontSize: rf(16), fontWeight: "800", color: "#fff" },
});
