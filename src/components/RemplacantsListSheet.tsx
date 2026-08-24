/**
 * Liste des remplaçants (Profil → Paramètres → Liste remplaçants).
 *
 * Vue en lecture seule du vivier de remplaçants du tuteur (restreint à ses
 * classes, même règle que RemplacementSheet), avec un bouton pour en ajouter
 * un nouveau via AjouterRemplacantSheet. Ne fait aucune action de
 * remplacement ici — juste consulter et enrichir la liste ; le remplacement
 * lui-même se fait depuis « Remplacer un élève ».
 */
import React, { useMemo, useState } from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useStore } from "../store/useStore";
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

export default function RemplacantsListSheet({ visible, onClose }: Props) {
  const { syncData, syncOffline } = useStore();
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [ajoutesLocalement, setAjoutesLocalement] = useState<EleveLocal[]>([]);

  const classesTuteur = syncData?.profile?.classes ?? [];

  const remplacants: EleveLocal[] = useMemo(() => {
    const tous  = (syncData?.remplacants ?? []) as EleveLocal[];
    const fusion = [...tous, ...ajoutesLocalement.filter(a => !tous.some(t => t.id === a.id))];
    const filtres = classesTuteur.length ? fusion.filter(e => classesTuteur.includes(e.classe)) : fusion;
    return filtres.sort((a, b) => nomComplet(a).localeCompare(nomComplet(b)));
  }, [syncData, classesTuteur, ajoutesLocalement]);

  const parClasse = useMemo(() => {
    const groupes = new Map<string, EleveLocal[]>();
    for (const e of remplacants) {
      if (!groupes.has(e.classe)) groupes.set(e.classe, []);
      groupes.get(e.classe)!.push(e);
    }
    return [...groupes.entries()];
  }, [remplacants]);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={s.fond}>
        <View style={s.feuille}>
          {/* En-tête */}
          <View style={s.enTete}>
            <View style={s.enTeteIcone}>
              <Feather name="users" size={rf(18)} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.titre}>Liste des remplaçants</Text>
              <Text style={s.sousTitre}>
                {remplacants.length} remplaçant{remplacants.length > 1 ? "s" : ""} disponible{remplacants.length > 1 ? "s" : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.fermer} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={rf(18)} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.ajouterBtn} onPress={() => setAjoutOuvert(true)} activeOpacity={0.85}>
            <Feather name="user-plus" size={rf(16)} color="#fff" />
            <Text style={s.ajouterTxt}>Ajouter un remplaçant</Text>
          </TouchableOpacity>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {remplacants.length === 0 ? (
              <View style={s.vide}>
                <Feather name="user-x" size={rf(30)} color={C.border} />
                <Text style={s.videTxt}>
                  Aucun remplaçant pour l&apos;instant. Ajoutez-en un pour l&apos;avoir sous la main
                  au moment de remplacer un élève.
                </Text>
              </View>
            ) : (
              parClasse.map(([classe, liste]) => (
                <View key={classe} style={{ marginBottom: rs(14) }}>
                  <Text style={s.groupeTitre}>{classe}</Text>
                  {liste.map(e => (
                    <View key={e.id} style={s.ligne}>
                      <View style={s.avatar}>
                        <Text style={s.avatarTxt}>{initiales(e)}</Text>
                      </View>
                      <Text style={s.ligneNom} numberOfLines={1}>{nomComplet(e)}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
            <View style={{ height: rs(20) }} />
          </ScrollView>
        </View>
      </View>

      <AjouterRemplacantSheet
        visible={ajoutOuvert}
        onClose={() => setAjoutOuvert(false)}
        classes={classesTuteur}
        onCreated={(e) => {
          setAjoutesLocalement(prev => [...prev, e]);
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
    height: "82%",
    borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24),
    paddingHorizontal: rs(18), paddingTop: rs(16), paddingBottom: rs(10),
  },

  enTete:      { flexDirection: "row", alignItems: "center", gap: rs(12), marginBottom: rs(14) },
  enTeteIcone: { width: rs(42), height: rs(42), borderRadius: rs(13), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  titre:       { fontSize: rf(18), fontWeight: "800", color: C.text },
  sousTitre:   { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },
  fermer:      { width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },

  ajouterBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8),
    backgroundColor: C.brand, borderRadius: rs(13), paddingVertical: rs(13),
    marginBottom: rs(16),
  },
  ajouterTxt: { fontSize: rf(14.5), fontWeight: "800", color: "#fff" },

  groupeTitre: { fontSize: rf(12.5), fontWeight: "800", color: C.textMuted, marginBottom: rs(8), textTransform: "uppercase", letterSpacing: 0.5 },

  ligne: {
    flexDirection: "row", alignItems: "center", gap: rs(12),
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: rs(13), padding: rs(12), marginBottom: rs(8),
  },
  avatar:    { width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: rf(13), fontWeight: "700", color: C.brand },
  ligneNom:  { fontSize: rf(15), fontWeight: "700", color: C.text, flex: 1 },

  vide:    { alignItems: "center", gap: rs(10), paddingVertical: rs(40) },
  videTxt: { fontSize: rf(14), color: C.textMuted, textAlign: "center", paddingHorizontal: rs(30), lineHeight: rf(20) },
});
