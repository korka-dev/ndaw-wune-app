/**
 * Lot L8 — Détail d'un rapport journalier pour l'inspecteur.
 * Lecture seule : aucune action d'annulation, de correction ni de retour.
 * (RapportDetailScreen lit la base locale du tuteur et porte l'annulation :
 * il n'est pas réutilisable ici.)
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Image, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { inspecteurApi, RapportJournalierListItem } from "../../services/api";
import { getSecure } from "../../services/secureStorage";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import { dateCourte } from "../../utils/statutRapport";
import { absencesInspecteur, dateLongue, difficultesListe, reponsesLisibles } from "../../utils/inspecteur";
import { useAndroidBack } from "../../hooks/useAndroidBack";
import BackButton from "../../components/BackButton";
import { InspHeader, useInspData, Chargement, EtatMessage, BandeauErreur, Badge, Ligne, insp } from "./InspCommun";
import { cleRapport } from "./useRapportsIef";

export default function InspRapportDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const rid = id ? String(id) : null;
  // Jeton relu à l'ouverture (il a pu être renouvelé) pour charger les photos.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { getSecure("access_token").then(setToken).catch(() => {}); }, []);

  useAndroidBack(useCallback(() => { router.back(); return true; }, [router]));

  const { data: r, loading, refreshing, error, bandeau, reload } = useInspData<RapportJournalierListItem>(
    rid ? cleRapport(rid) : null,
    async () => (await inspecteurApi.rapport(rid as string)).data,
    "le rapport",
  );

  const diffs = r ? difficultesListe(r.difficultes) : [];
  const reponses = r ? reponsesLisibles(r.reponses_questions) : [];
  const nbPhotos = r?.nb_photos ?? 0;
  const absences = absencesInspecteur(r?.nb_absences, r?.absents);

  return (
    <View style={insp.root}>
      <InspHeader onRefresh={() => reload(true)} refreshing={refreshing} />
      <View style={s.topBar}>
        <BackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={s.topTitre} numberOfLines={1}>{r ? dateLongue(r.date_rapport) : "Rapport"}</Text>
          {!!r && <Text style={s.topSub} numberOfLines={1}>{r.nom_tuteur ?? "—"}{r.ecole ? ` · ${r.ecole}` : ""}</Text>}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={insp.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={C.brand} />}
      >
        {loading && !r ? <Chargement /> : !r ? (
          <EtatMessage icon="alert-circle" texte={error ?? "Rapport introuvable."} onRetry={() => reload(true)} />
        ) : (
          <>
            {!!bandeau && <BandeauErreur texte={bandeau} />}

            <View style={s.badges}>
              {r.besoin_appui && <Badge texte="Besoin d'appui" couleur={C.danger} fond={C.dangerSoft} />}
              {r.semaine != null && <Badge texte={`Semaine ${r.semaine}`} couleur={C.brand} fond={C.brandSoft} />}
              {r.jour_cours != null && <Badge texte={`Jour ${r.jour_cours}`} couleur={C.brand} fond={C.brandSoft} />}
            </View>

            {(r.statut === "annule" || r.statut === "corrige") && (
              <View style={[s.boite, { backgroundColor: r.statut === "annule" ? C.dangerSoft : C.warnSoft }]}>
                <Text style={[s.boiteTitre, { color: r.statut === "annule" ? C.danger : C.warn }]}>
                  {r.statut === "annule" ? "Rapport annulé par son auteur" : `Rapport corrigé${r.version ? ` (version ${r.version})` : ""}`}
                </Text>
                {!!r.statut_motif && <Text style={s.boiteTxt}>Motif : {r.statut_motif}</Text>}
              </View>
            )}

            {!!r.retour_superviseur && (
              <View style={[s.boite, { backgroundColor: C.brandSoft }]}>
                <Text style={[s.boiteTitre, { color: C.brand }]}>Retour du superviseur</Text>
                <Text style={[s.boiteTxt, { color: C.text }]}>{r.retour_superviseur}</Text>
                {(r.retour_par || r.retour_le) && (
                  <Text style={s.boiteTxt}>{r.retour_par ?? ""}{r.retour_le ? ` · ${dateCourte(r.retour_le)}` : ""}</Text>
                )}
              </View>
            )}

            <Text style={insp.sectionLabel}>Lieu</Text>
            <View style={insp.bloc}>
              <Ligne label="École" valeur={r.ecole} />
              <Ligne label="Commune" valeur={r.commune} />
              <Ligne label="IEF" valeur={r.ief} />
              <Ligne label="Superviseur" valeur={r.superviseur} />
              <Ligne label="Auteur" valeur={r.nom_tuteur} />
            </View>

            <Text style={insp.sectionLabel}>Absences</Text>
            <View style={insp.bloc}>
              <Ligne label="Nombre" valeur={absences.nombre} />
              {/* Noms masqués aux inspecteurs par défaut : mention explicite, jamais de liste vide. */}
              {!!absences.noms && <Ligne label="Noms" valeur={absences.noms} />}
            </View>

            <Text style={insp.sectionLabel}>Difficultés</Text>
            <View style={insp.bloc}>
              <Ligne label="Difficultés" valeur={diffs.length ? diffs.join(", ") : "Aucune"} />
              {!!r.autres_difficultes && <Ligne label="Autres" valeur={r.autres_difficultes} />}
              {!!r.description_difficultes && <Ligne label="Description" valeur={r.description_difficultes} />}
            </View>

            <Text style={insp.sectionLabel}>Supervision</Text>
            <View style={insp.bloc}>
              <Ligne label="Directeur venu" valeur={r.directeur_venu ? "Oui" : "Non"} />
              <Ligne label="Besoin d'appui" valeur={r.besoin_appui ? "Oui" : "Non"} />
              {r.besoin_appui && !!r.domaines_appui && <Ligne label="Domaines" valeur={r.domaines_appui} />}
            </View>

            {!!r.commentaires && (
              <>
                <Text style={insp.sectionLabel}>Observations</Text>
                <View style={insp.bloc}><Ligne label="Commentaires" valeur={r.commentaires} /></View>
              </>
            )}

            {reponses.length > 0 && (
              <>
                <Text style={insp.sectionLabel}>Questions complémentaires</Text>
                <View style={insp.bloc}>
                  {reponses.map((q, i) => (
                    <View key={i} style={s.question}>
                      <Text style={s.qLib}>{q.question}</Text>
                      <Text style={s.qRep}>{q.reponse}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {nbPhotos > 0 && (
              <>
                <Text style={insp.sectionLabel}>Photo{nbPhotos > 1 ? "s" : ""} de la classe ({nbPhotos})</Text>
                {token ? (
                  <View style={s.photos}>
                    {Array.from({ length: nbPhotos }, (_, i) => (
                      <Image
                        key={i}
                        // Photo servie à la demande par l'API, avec le jeton (comme APP-37).
                        source={{ uri: inspecteurApi.photoUrl(String(r.id), i), headers: { Authorization: `Bearer ${token}` } }}
                        style={nbPhotos === 1 ? s.photoPleine : s.photoVignette}
                        resizeMode="cover"
                      />
                    ))}
                  </View>
                ) : <Chargement />}
              </>
            )}

            <Text style={s.pied}>
              {r.submitted_at ? `Reçu le ${dateCourte(r.submitted_at)}` : r.created_at ? `Reçu le ${dateCourte(r.created_at)}` : ""}
            </Text>
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
  topTitre: { fontSize: rf(17), fontWeight: "700", color: C.text, textTransform: "capitalize" },
  topSub: { fontSize: rf(13), color: C.textMuted, marginTop: rs(1) },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: rs(6), marginBottom: rs(4) },
  boite: { borderRadius: rs(12), padding: rs(12), marginTop: rs(12) },
  boiteTitre: { fontSize: rf(14.5), fontWeight: "800" },
  boiteTxt: { fontSize: rf(13), color: C.textMuted, marginTop: rs(4), lineHeight: rf(18) },
  question: { paddingHorizontal: rs(14), paddingVertical: rs(12), borderBottomWidth: 1, borderBottomColor: C.border + "80" },
  qLib: { fontSize: rf(13.5), color: C.textMuted },
  qRep: { fontSize: rf(15), color: C.text, fontWeight: "600", marginTop: rs(3) },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: rs(8) },
  photoPleine: { width: "100%", aspectRatio: 4 / 3, borderRadius: rs(14), backgroundColor: C.border },
  photoVignette: { width: "31.5%", aspectRatio: 1, borderRadius: rs(12), backgroundColor: C.border },
  pied: { fontSize: rf(12.5), color: C.textMuted, textAlign: "center", marginTop: rs(20) },
});
