/**
 * Lot L8 — Accueil de l'inspecteur : résumé de son IEF (lecture seule).
 */
import React from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { inspecteurApi, InspecteurResume } from "../../services/api";
import { useStore } from "../../store/useStore";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import { dateLisible } from "../../utils/inspecteur";
import { InspHeader, useInspData, Chargement, EtatMessage, BandeauErreur, insp } from "./InspCommun";

function Tuile({ icon, valeur, libelle, alerte }: { icon: keyof typeof Feather.glyphMap; valeur: number | string; libelle: string; alerte?: boolean }) {
  return (
    <View style={s.tuile}>
      <Feather name={icon} size={rf(20)} color={alerte ? C.danger : C.brand} />
      <Text style={[s.tuileVal, alerte && { color: C.danger }]}>{valeur}</Text>
      <Text style={s.tuileLib}>{libelle}</Text>
    </View>
  );
}

export default function InspAccueilScreen() {
  const router = useRouter();
  const user = useStore((st) => st.user);
  const { data, loading, refreshing, error, bandeau, reload } = useInspData<InspecteurResume>(
    "resume", async () => (await inspecteurApi.resume()).data, "le résumé de l'IEF");

  const ief = data?.ief ?? user?.ief ?? null;

  return (
    <View style={insp.root}>
      <InspHeader onRefresh={() => reload(true)} refreshing={refreshing} />
      <ScrollView
        contentContainerStyle={insp.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={C.brand} />}
      >
        <Text style={insp.titre}>{ief ? `IEF de ${ief}` : "Votre IEF"}</Text>
        <Text style={insp.sousTitre}>Bonjour {user?.name ?? ""} — consultation des écoles et des rapports.</Text>

        {loading && !data ? <Chargement /> : !data ? (
          <EtatMessage icon="wifi-off" texte={error ?? "Aucune donnée."} onRetry={() => reload(true)} />
        ) : (
          <>
            {!!bandeau && <View style={{ marginTop: rs(12) }}><BandeauErreur texte={bandeau} /></View>}
            {!ief && (
              <View style={{ marginTop: rs(12) }}>
                <BandeauErreur texte="Aucune IEF n'est rattachée à votre compte. Contactez l'administrateur ARED." />
              </View>
            )}
            <Text style={insp.sectionLabel}>Périmètre</Text>
            <View style={s.grille}>
              <Tuile icon="home" valeur={data.nb_ecoles} libelle="Écoles" />
              <Tuile icon="users" valeur={data.nb_tuteurs} libelle="Tuteurs" />
              <Tuile icon="user-check" valeur={data.nb_superviseurs} libelle="Superviseurs" />
            </View>

            <Text style={insp.sectionLabel}>7 derniers jours</Text>
            <View style={s.grille}>
              <Tuile icon="file-text" valeur={data.rapports_7_jours} libelle="Rapports reçus" />
              <Tuile icon="alert-triangle" valeur={data.besoins_appui_7_jours} libelle="Besoins d'appui" alerte={data.besoins_appui_7_jours > 0} />
            </View>

            <Text style={insp.sectionLabel}>Dernier rapport</Text>
            <View style={[insp.bloc, { padding: rs(14) }]}>
              <Text style={s.dernier}>{data.dernier_rapport ? dateLisible(data.dernier_rapport) : "Aucun rapport reçu pour le moment"}</Text>
            </View>

            <TouchableOpacity style={s.lien} onPress={() => router.push("/(inspecteur-tabs)/rapports-ief" as any)} activeOpacity={0.7}>
              <Feather name="file-text" size={rf(16)} color="#fff" />
              <Text style={s.lienTxt}>Voir les rapports</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.lien, s.lienSec]} onPress={() => router.push("/(inspecteur-tabs)/ecoles" as any)} activeOpacity={0.7}>
              <Feather name="home" size={rf(16)} color={C.brand} />
              <Text style={[s.lienTxt, { color: C.brand }]}>Voir les écoles</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  grille: { flexDirection: "row", gap: rs(10) },
  tuile: {
    flex: 1, backgroundColor: C.surface, borderRadius: rs(14), borderWidth: 1, borderColor: C.border,
    paddingVertical: rs(14), alignItems: "center", gap: rs(4),
  },
  tuileVal: { fontSize: rf(24), fontWeight: "800", color: C.text },
  tuileLib: { fontSize: rf(12.5), color: C.textMuted, textAlign: "center" },
  dernier: { fontSize: rf(15), fontWeight: "600", color: C.text },
  lien: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8), marginTop: rs(20),
    backgroundColor: C.brand, borderRadius: rs(12), paddingVertical: rs(13),
  },
  lienSec: { marginTop: rs(10), backgroundColor: C.surface, borderWidth: 1, borderColor: C.brand },
  lienTxt: { color: "#fff", fontSize: rf(15), fontWeight: "800" },
});
