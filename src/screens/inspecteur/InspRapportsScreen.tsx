/**
 * Lot L8 — Rapports journaliers des tuteurs et superviseurs de l'IEF
 * (lecture seule) : filtres « besoin d'appui » et période, « charger plus ».
 */
import React, { useMemo, useState } from "react";
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import { dateDebutPeriode, Periode } from "../../utils/inspecteur";
import { InspHeader, Chargement, EtatMessage, BandeauErreur, RapportCarte, Chip, insp } from "./InspCommun";
import { useRapportsIef } from "./useRapportsIef";

export function BoutonChargerPlus({ reste, loading, onPress }: { reste: number; loading: boolean; onPress: () => void }) {
  if (reste <= 0) return null;
  return (
    <TouchableOpacity style={s.plus} onPress={onPress} disabled={loading} activeOpacity={0.7}>
      {loading ? <ActivityIndicator color={C.brand} /> : <Text style={s.plusTxt}>Charger plus ({reste} restant{reste > 1 ? "s" : ""})</Text>}
    </TouchableOpacity>
  );
}

export default function InspRapportsScreen() {
  const router = useRouter();
  const [besoinAppui, setBesoinAppui] = useState(false);
  const [periode, setPeriode] = useState<Periode>("tout");

  const filtres = useMemo(() => ({
    ...(besoinAppui ? { besoin_appui: true } : {}),
    ...(dateDebutPeriode(periode) ? { date_debut: dateDebutPeriode(periode) } : {}),
  }), [besoinAppui, periode]);

  const r = useRapportsIef(filtres);

  return (
    <View style={insp.root}>
      <InspHeader onRefresh={() => r.recharger(true)} refreshing={r.refreshing} />
      <FlatList
        data={r.items}
        keyExtractor={(x) => String(x.id)}
        contentContainerStyle={insp.scroll}
        refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={() => r.recharger(true)} tintColor={C.brand} />}
        ListHeaderComponent={
          <View style={{ marginBottom: rs(12) }}>
            <Text style={insp.titre}>Rapports</Text>
            <Text style={insp.sousTitre}>
              {r.charge ? `${r.total} rapport${r.total > 1 ? "s" : ""} des tuteurs et superviseurs` : "Rapports des tuteurs et superviseurs"}
            </Text>
            <View style={[insp.chips, { marginTop: rs(14) }]}>
              <Chip texte="Tout" actif={periode === "tout"} onPress={() => setPeriode("tout")} />
              <Chip texte="7 jours" actif={periode === "7j"} onPress={() => setPeriode("7j")} />
              <Chip texte="30 jours" actif={periode === "30j"} onPress={() => setPeriode("30j")} />
            </View>
            <View style={[insp.chips, { marginTop: rs(8) }]}>
              <Chip texte="Besoin d'appui uniquement" actif={besoinAppui} onPress={() => setBesoinAppui((v) => !v)} />
            </View>
            {!!r.bandeau && <View style={{ marginTop: rs(12) }}><BandeauErreur texte={r.bandeau} /></View>}
          </View>
        }
        ListEmptyComponent={
          r.loading ? <Chargement /> : !r.charge ? (
            <EtatMessage icon="wifi-off" texte={r.error ?? "Aucune donnée."} onRetry={() => r.recharger(true)} />
          ) : (
            <EtatMessage icon="file-text" texte={besoinAppui || periode !== "tout" ? "Aucun rapport pour ces filtres." : "Aucun rapport reçu pour le moment."} />
          )
        }
        renderItem={({ item }) => (
          <RapportCarte r={item} onPress={() => router.push({ pathname: "/(inspecteur-tabs)/rapport-ief", params: { id: String(item.id) } } as any)} />
        )}
        ListFooterComponent={<BoutonChargerPlus reste={r.reste} loading={r.loadingMore} onPress={r.chargerPlus} />}
      />
    </View>
  );
}

const s = StyleSheet.create({
  plus: { marginTop: rs(4), paddingVertical: rs(13), borderRadius: rs(12), borderWidth: 1, borderColor: C.brand, alignItems: "center", backgroundColor: C.surface },
  plusTxt: { color: C.brand, fontWeight: "800", fontSize: rf(14.5) },
});
