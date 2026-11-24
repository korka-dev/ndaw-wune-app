/**
 * Lot L8 — Détail d'une école de l'IEF : informations, tuteurs et
 * superviseurs (avec leur dernier rapport), rapports de l'école. Lecture seule.
 */
import React, { useCallback } from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { inspecteurApi, InspecteurEcole, InspecteurPersonne } from "../../services/api";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import { cacheInspecteur, dateLisible } from "../../utils/inspecteur";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import BackButton from "../../components/BackButton";
import { InspHeader, useInspData, Chargement, EtatMessage, BandeauErreur, RapportCarte, Badge, Ligne, insp } from "./InspCommun";
import { useRapportsIef } from "./useRapportsIef";
import { BoutonChargerPlus } from "./InspRapportsScreen";

function Personne({ p }: { p: InspecteurPersonne }) {
  const sup = p.role === "superviseur";
  return (
    <View style={s.personne}>
      <View style={[s.avatar, sup && { backgroundColor: C.primarySoft }]}>
        <Feather name={sup ? "user-check" : "user"} size={rf(16)} color={sup ? C.primaryDark : C.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.pNom} numberOfLines={1}>{p.nom}</Text>
        <Text style={s.pSub} numberOfLines={2}>
          {sup ? "Superviseur" : "Tuteur"}
          {p.classes?.length ? ` · ${p.classes.join(", ")}` : ""}
          {p.telephone ? ` · ${p.telephone}` : ""}
        </Text>
        <Text style={s.pSub}>Dernier rapport : {dateLisible(p.dernier_rapport)}</Text>
      </View>
      <Badge
        texte={`${p.rapports_7_jours} / 7 j`}
        couleur={p.rapports_7_jours > 0 ? C.success : C.textMuted}
        fond={p.rapports_7_jours > 0 ? C.successSoft : C.surfaceAlt}
      />
    </View>
  );
}

export default function InspEcoleDetailScreen() {
  const router = useRouter();
  const { id, nom } = useLocalSearchParams<{ id: string; nom?: string }>();
  const ecoleId = id ? String(id) : null;

  useAndroidBack(useCallback(() => { router.back(); return true; }, [router]));

  const ecole = (cacheInspecteur.get<InspecteurEcole[]>("ecoles") ?? []).find((e) => String(e.id) === ecoleId);
  const pers = useInspData<InspecteurPersonne[]>(
    ecoleId ? `personnes:${ecoleId}` : null,
    async () => (await inspecteurApi.personnes(ecoleId as string)).data,
    "les tuteurs et superviseurs",
  );
  const rap = useRapportsIef({ ecole_id: ecoleId ?? "" });

  const rafraichir = () => { pers.reload(true); rap.recharger(true); };
  const tuteurs = (pers.data ?? []).filter((p) => p.role !== "superviseur");
  const superviseurs = (pers.data ?? []).filter((p) => p.role === "superviseur");

  return (
    <View style={insp.root}>
      <InspHeader onRefresh={rafraichir} refreshing={pers.refreshing || rap.refreshing} />
      <View style={s.topBar}>
        <BackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={s.topTitre} numberOfLines={2}>{ecole?.nom ?? nom ?? "École"}</Text>
          {!!ecole?.commune && <Text style={s.topSub}>{ecole.commune}</Text>}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={insp.scroll}
        refreshControl={<RefreshControl refreshing={pers.refreshing || rap.refreshing} onRefresh={rafraichir} tintColor={C.brand} />}
      >
        {ecole && (
          <>
            <Text style={[insp.sectionLabel, { marginTop: 0 }]}>Informations</Text>
            <View style={insp.bloc}>
              <Ligne label="Commune" valeur={ecole.commune} />
              <Ligne label="Code école" valeur={ecole.code_ecole as any} />
              <Ligne label="Directeur" valeur={ecole.directeur} />
              <Ligne label="Rapports (7 j)" valeur={ecole.rapports_7_jours} />
              <Ligne label="Besoins d'appui (7 j)" valeur={ecole.besoins_appui_7_jours} />
              <Ligne label="Dernier rapport" valeur={dateLisible(ecole.dernier_rapport)} />
            </View>
          </>
        )}

        <Text style={insp.sectionLabel}>Tuteurs et superviseurs</Text>
        {pers.loading && !pers.data ? <Chargement /> : !pers.data ? (
          <EtatMessage icon="wifi-off" texte={pers.error ?? "Aucune donnée."} onRetry={() => pers.reload(true)} />
        ) : pers.data.length === 0 ? (
          <EtatMessage icon="users" texte="Aucun tuteur ni superviseur rattaché à cette école." />
        ) : (
          <View style={insp.bloc}>
            {!!pers.error && <View style={{ padding: rs(8) }}><BandeauErreur texte={pers.error} /></View>}
            {[...superviseurs, ...tuteurs].map((p) => <Personne key={`${p.role}-${p.id}`} p={p} />)}
          </View>
        )}

        <Text style={insp.sectionLabel}>Rapports de l'école{rap.charge ? ` (${rap.total})` : ""}</Text>
        {!!rap.error && rap.charge && <BandeauErreur texte={rap.error} />}
        {rap.loading && !rap.charge ? <Chargement /> : !rap.charge ? (
          <EtatMessage icon="wifi-off" texte={rap.error ?? "Aucune donnée."} onRetry={() => rap.recharger(true)} />
        ) : rap.items.length === 0 ? (
          <EtatMessage icon="file-text" texte="Aucun rapport reçu pour cette école." />
        ) : (
          <>
            {rap.items.map((r) => (
              <RapportCarte
                key={String(r.id)}
                r={r}
                avecEcole={false}
                onPress={() => router.push({ pathname: "/(inspecteur-tabs)/rapport-ief", params: { id: String(r.id) } } as any)}
              />
            ))}
            <BoutonChargerPlus reste={rap.reste} loading={rap.loadingMore} onPress={rap.chargerPlus} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  topBar: {
    flexDirection: "row", alignItems: "center", gap: rs(10), paddingHorizontal: rs(16), paddingVertical: rs(12),
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  topTitre: { fontSize: rf(17), fontWeight: "700", color: C.text },
  topSub: { fontSize: rf(13), color: C.textMuted, marginTop: rs(1) },
  personne: {
    flexDirection: "row", alignItems: "center", gap: rs(10), padding: rs(12),
    borderBottomWidth: 1, borderBottomColor: C.border + "80",
  },
  avatar: { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: C.brandSoft, alignItems: "center", justifyContent: "center" },
  pNom: { fontSize: rf(15), fontWeight: "700", color: C.text },
  pSub: { fontSize: rf(12.5), color: C.textMuted, marginTop: rs(1) },
});
