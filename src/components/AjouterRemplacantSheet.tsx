/**
 * Ajout d'un remplaçant par le tuteur.
 *
 * Jusqu'ici le vivier des remplaçants ne venait que de la Base NWV 2026
 * (RCT), importée par l'administrateur : si aucun remplaçant n'y figurait
 * pour une classe, le tuteur restait bloqué. Cette feuille lui permet de
 * recenser lui-même un remplaçant (saisie libre nom/prénom + classe parmi
 * les siennes) — il rejoint aussitôt le même vivier, via
 * POST /app/remplacants.
 *
 * Utilisée à deux endroits : la liste des remplaçants (Profil → Paramètres)
 * et directement dans le parcours de remplacement, pour rester fluide sans
 * changer d'écran.
 */
import React, { useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { remplacantsApi } from "../services/api";
import { C } from "../utils/theme";
import { rs, rf } from "../utils/responsive";

interface EleveLocal { id: string; nom: string; prenom: string | null; classe: string }

interface Props {
  visible: boolean;
  onClose: () => void;
  classes: string[];
  classeInitiale?: string | null;
  /** Appelé avec le remplaçant créé, une fois enregistré côté serveur. */
  onCreated: (eleve: EleveLocal) => void;
}

export default function AjouterRemplacantSheet({ visible, onClose, classes, classeInitiale, onCreated }: Props) {
  const [nom, setNom]       = useState("");
  const [prenom, setPrenom] = useState("");
  const [classe, setClasse] = useState<string | null>(classeInitiale ?? (classes.length === 1 ? classes[0] : null));
  const [envoi, setEnvoi]   = useState(false);

  const reinitialiser = () => {
    setNom(""); setPrenom("");
    setClasse(classeInitiale ?? (classes.length === 1 ? classes[0] : null));
  };

  const fermer = () => {
    reinitialiser();
    onClose();
  };

  const confirmer = async () => {
    if (envoi) return;
    if (!nom.trim()) {
      Alert.alert("Nom requis", "Indiquez le nom du remplaçant.");
      return;
    }
    if (!prenom.trim()) {
      Alert.alert("Prénom requis", "Indiquez le prénom du remplaçant.");
      return;
    }
    if (!classe) {
      Alert.alert("Classe requise", "Choisissez la classe du remplaçant.");
      return;
    }
    setEnvoi(true);
    try {
      const { data } = await remplacantsApi.create({
        nom: nom.trim(),
        prenom: prenom.trim(),
        classe,
      });
      onCreated({ id: data.id, nom: data.nom, prenom: data.prenom, classe: data.classe });
      reinitialiser();
      onClose();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert(
        "Erreur",
        typeof detail === "string" ? detail : "Le remplaçant n'a pas pu être ajouté. Réessayez.",
      );
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
          <View style={s.enTete}>
            <View style={s.enTeteIcone}>
              <Feather name="user-plus" size={rf(18)} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.titre}>Ajouter un remplaçant</Text>
              <Text style={s.sousTitre}>Il rejoint la liste des remplaçants disponibles</Text>
            </View>
            <TouchableOpacity onPress={fermer} style={s.fermer} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={rf(18)} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={s.label}>Nom</Text>
            <TextInput
              style={s.input}
              value={nom}
              onChangeText={setNom}
              placeholder="Nom du remplaçant"
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
            />

            <Text style={s.label}>Prénom</Text>
            <TextInput
              style={s.input}
              value={prenom}
              onChangeText={setPrenom}
              placeholder="Prénom du remplaçant"
              placeholderTextColor={C.textMuted}
              autoCapitalize="words"
            />

            <Text style={s.label}>Classe</Text>
            {classes.length === 0 ? (
              <Text style={s.videTxt}>Aucune classe connue. Synchronisez vos données.</Text>
            ) : (
              <View style={s.classesRow}>
                {classes.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[s.chip, classe === c && s.chipChoisi]}
                    onPress={() => setClasse(c)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.chipTxt, classe === c && s.chipTxtChoisi]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[s.valider, (envoi || !nom.trim() || !prenom.trim() || !classe) && s.valideDesactive]}
              onPress={confirmer}
              disabled={envoi || !nom.trim() || !prenom.trim() || !classe}
              activeOpacity={0.85}
            >
              {envoi
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Feather name="check" size={rf(16)} color={(!nom.trim() || !prenom.trim() || !classe) ? C.textMuted : "#fff"} />
                    <Text style={[s.validerTxt, (!nom.trim() || !prenom.trim() || !classe) && { color: C.textMuted }]}>
                      Ajouter le remplaçant
                    </Text>
                  </>}
            </TouchableOpacity>
            <View style={{ height: rs(24) }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fond:    { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  feuille: {
    backgroundColor: C.bg,
    maxHeight: "88%",
    borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24),
    paddingHorizontal: rs(18), paddingTop: rs(16), paddingBottom: rs(20),
  },

  enTete:      { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(16) },
  enTeteIcone: { width: rs(42), height: rs(42), borderRadius: rs(13), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  titre:       { fontSize: rf(18), fontWeight: "800", color: C.text },
  sousTitre:   { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },
  fermer:      { width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },

  label: { fontSize: rf(13), fontWeight: "700", color: C.text, marginBottom: rs(6), marginTop: rs(10) },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(12), paddingHorizontal: rs(14), paddingVertical: rs(12),
    fontSize: rf(15), color: C.text,
  },

  classesRow: { flexDirection: "row", flexWrap: "wrap", gap: rs(8) },
  chip: {
    paddingHorizontal: rs(14), paddingVertical: rs(9),
    borderRadius: rs(20), borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  chipChoisi:   { borderColor: C.brand, backgroundColor: C.brandSoft },
  chipTxt:      { fontSize: rf(13.5), fontWeight: "700", color: C.text },
  chipTxtChoisi:{ color: C.brand },

  videTxt: { fontSize: rf(13.5), color: C.textMuted },

  valider: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8),
    backgroundColor: C.brand, borderRadius: rs(14), paddingVertical: rs(15),
    marginTop: rs(22),
  },
  valideDesactive: { backgroundColor: C.surfaceAlt },
  validerTxt:      { fontSize: rf(16), fontWeight: "800", color: "#fff" },
});
