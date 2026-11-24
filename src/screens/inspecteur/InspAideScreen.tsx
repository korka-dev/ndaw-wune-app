/**
 * Lot L8 — Aide propre à l'inspecteur d'IEF (pas l'aide tuteur) :
 * ce qu'il voit, lecture seule, qui contacter, fraîcheur des données.
 */
import React, { useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useStore } from "../../store/useStore";
import { cacheInspecteur } from "../../services/inspecteurCache";
import type { InspecteurResume } from "../../services/api";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import BackButton from "../../components/BackButton";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import { format } from "date-fns";
import { InspHeader, insp } from "./InspCommun";

function Rubrique({ icon, titre, lignes }: { icon: keyof typeof Feather.glyphMap; titre: string; lignes: string[] }) {
  return (
    <View style={s.rubrique}>
      <View style={s.rubTete}>
        <Feather name={icon} size={rf(18)} color={C.brand} />
        <Text style={s.rubTitre}>{titre}</Text>
      </View>
      {lignes.map((l, i) => <Text key={i} style={s.rubLigne}>• {l}</Text>)}
    </View>
  );
}

export default function InspAideScreen() {
  const router = useRouter();
  const user = useStore((st) => st.user);
  const isOnline = useStore((st) => st.isOnline);
  useAndroidBack(useCallback(() => { router.back(); return true; }, [router]));

  const resume = cacheInspecteur.get<InspecteurResume>("resume");
  const majResume = cacheInspecteur.dateDe("resume");
  const contact = resume?.support_contact?.trim() || null;
  const nomsVisibles = !!resume?.noms_absents_visibles;
  const ief = resume?.ief ?? user?.ief ?? null;

  return (
    <View style={insp.root}>
      <InspHeader />
      <View style={s.topBar}>
        <BackButton onPress={() => router.back()} />
        <Text style={s.topTitre}>Aide — espace inspecteur</Text>
      </View>
      <ScrollView contentContainerStyle={insp.scroll}>
        <Rubrique
          icon="eye"
          titre="Ce que vous voyez"
          lignes={[
            `Les écoles de votre IEF${ief ? ` (${ief})` : ""}, avec leurs tuteurs et superviseurs.`,
            "Les rapports journaliers envoyés par ces tuteurs et superviseurs (les rapports annulés sont exclus).",
            nomsVisibles
              ? "Le nombre d'absents et leurs noms."
              : "Le nombre d'absents ; les noms des élèves ne sont pas communiqués aux inspecteurs.",
            "Aucune donnée d'une autre IEF n'est accessible.",
          ]}
        />
        <Rubrique
          icon="lock"
          titre="Consultation seule"
          lignes={[
            "Vous ne saisissez rien dans l'application : pas de rapport, pas de séance, pas d'évaluation.",
            "Les rapports ne peuvent être corrigés ou annulés que par leur auteur.",
          ]}
        />
        <Rubrique
          icon="clock"
          titre="Fraîcheur des données"
          lignes={[
            "Les écrans se mettent à jour à l'ouverture et en tirant la liste vers le bas.",
            "Sans connexion, les dernières données consultées restent affichées avec leur date (bandeau « Hors ligne »). Les photos ne sont pas disponibles hors ligne.",
            majResume ? `Résumé de l'IEF mis à jour le ${format(new Date(majResume), "dd/MM 'à' HH:mm")}.` : "Résumé de l'IEF pas encore chargé.",
            isOnline ? "Vous êtes connecté." : "Vous êtes actuellement hors ligne.",
          ]}
        />
        <Rubrique
          icon="phone"
          titre="Qui contacter"
          lignes={[
            "Une donnée vous semble fausse ou manquante : l'équipe programme Ndaw Wune (ARED).",
            "Un problème avec l'application : l'assistance technique.",
            ...(contact ? [`Contact : ${contact}`] : []),
          ]}
        />

        <TouchableOpacity style={s.bouton} onPress={() => router.push("/remarques")} activeOpacity={0.75}>
          <Feather name="message-circle" size={rf(16)} color="#fff" />
          <Text style={s.boutonTxt}>Signaler un problème</Text>
        </TouchableOpacity>

        <Text style={s.version}>Version {Constants.expoConfig?.version ?? "—"}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center", gap: rs(10), paddingHorizontal: rs(16), paddingVertical: rs(12),
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  topTitre: { fontSize: rf(17), fontWeight: "700", color: C.text, flex: 1 },
  rubrique: { backgroundColor: C.surface, borderRadius: rs(14), borderWidth: 1, borderColor: C.border, padding: rs(14), marginBottom: rs(12) },
  rubTete: { flexDirection: "row", alignItems: "center", gap: rs(8), marginBottom: rs(8) },
  rubTitre: { fontSize: rf(15.5), fontWeight: "800", color: C.text },
  rubLigne: { fontSize: rf(14), color: C.text, lineHeight: rf(20), marginTop: rs(3) },
  bouton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8), marginTop: rs(8),
    backgroundColor: C.brand, borderRadius: rs(12), paddingVertical: rs(13),
  },
  boutonTxt: { color: "#fff", fontSize: rf(15), fontWeight: "800" },
  version: { textAlign: "center", color: C.textMuted, fontSize: rf(12), marginTop: rs(16) },
});
