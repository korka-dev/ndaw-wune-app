/**
 * Lot L8 — Écoles de l'IEF de l'inspecteur, avec recherche (lecture seule).
 */
import React, { useMemo, useState } from "react";
import { View, Text, FlatList, RefreshControl, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { inspecteurApi, InspecteurEcole } from "../../services/api";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import { dateLisible, filtrerEcoles } from "../../utils/inspecteur";
import { InspHeader, useInspData, Chargement, EtatMessage, BandeauErreur, Badge, insp } from "./InspCommun";

export default function InspEcolesScreen() {
  const router = useRouter();
  const [recherche, setRecherche] = useState("");
  const { data, loading, refreshing, error, reload } = useInspData<InspecteurEcole[]>(
    "ecoles", async () => (await inspecteurApi.ecoles()).data, "les écoles");

  const liste = useMemo(() => filtrerEcoles(data ?? [], recherche), [data, recherche]);

  return (
    <View style={insp.root}>
      <InspHeader onRefresh={() => reload(true)} refreshing={refreshing} />
      <FlatList
        data={liste}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={insp.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={C.brand} />}
        ListHeaderComponent={
          <View>
            <Text style={insp.titre}>Écoles</Text>
            <Text style={insp.sousTitre}>
              {data ? `${data.length} école${data.length > 1 ? "s" : ""} dans votre IEF` : "Écoles de votre IEF"}
            </Text>
            <View style={s.recherche}>
              <Feather name="search" size={rf(16)} color={C.textMuted} />
              <TextInput
                value={recherche}
                onChangeText={setRecherche}
                placeholder="Rechercher (nom, commune, directeur, code)"
                placeholderTextColor={C.textMuted}
                style={s.rechercheInput}
                autoCorrect={false}
              />
              {!!recherche && (
                <TouchableOpacity onPress={() => setRecherche("")} hitSlop={8}>
                  <Feather name="x" size={rf(16)} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            {!!error && !!data && <BandeauErreur texte={error} />}
          </View>
        }
        ListEmptyComponent={
          loading ? <Chargement /> : !data ? (
            <EtatMessage icon="wifi-off" texte={error ?? "Aucune donnée."} onRetry={() => reload(true)} />
          ) : (
            <EtatMessage icon="home" texte={recherche ? "Aucune école ne correspond à la recherche." : "Aucune école dans votre IEF."} />
          )
        }
        renderItem={({ item: e }) => (
          <TouchableOpacity
            style={s.carte}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: "/(inspecteur-tabs)/ecole-ief", params: { id: String(e.id), nom: e.nom } } as any)}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.nom} numberOfLines={2}>{e.nom}</Text>
              <Text style={s.sub} numberOfLines={1}>
                {[e.commune, e.code_ecole ? `code ${e.code_ecole}` : null].filter(Boolean).join(" · ") || "—"}
              </Text>
              <Text style={s.sub}>
                {e.nb_tuteurs} tuteur{e.nb_tuteurs > 1 ? "s" : ""} · {e.nb_superviseurs} superviseur{e.nb_superviseurs > 1 ? "s" : ""}
                {" · "}dernier rapport : {dateLisible(e.dernier_rapport)}
              </Text>
              <View style={s.badges}>
                <Badge texte={`${e.rapports_7_jours} rapport${e.rapports_7_jours > 1 ? "s" : ""} / 7 j`} couleur={C.brand} fond={C.brandSoft} />
                {e.besoins_appui_7_jours > 0 && (
                  <Badge texte={`${e.besoins_appui_7_jours} besoin${e.besoins_appui_7_jours > 1 ? "s" : ""} d'appui`} couleur={C.danger} fond={C.dangerSoft} />
                )}
              </View>
            </View>
            <Feather name="chevron-right" size={rf(20)} color={C.textMuted} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  recherche: {
    flexDirection: "row", alignItems: "center", gap: rs(8), marginTop: rs(14), marginBottom: rs(14),
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: rs(12), paddingHorizontal: rs(12),
  },
  rechercheInput: { flex: 1, paddingVertical: rs(10), fontSize: rf(14.5), color: C.text },
  carte: {
    flexDirection: "row", alignItems: "center", gap: rs(10), backgroundColor: C.surface, borderRadius: rs(14),
    borderWidth: 1, borderColor: C.border, padding: rs(14), marginBottom: rs(10),
  },
  nom: { fontSize: rf(15.5), fontWeight: "700", color: C.text },
  sub: { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: rs(6), marginTop: rs(8) },
});
