/**
 * Écran Détail d'un rapport journalier — page dédiée (pas de modal)
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, TextInput, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

import { rs, rf } from "../utils/responsive";
import { C } from "../utils/theme";
import { getRapportJournalierById, setRapportJournalierStatut, getFailedActions } from "../services/db";
import { statutRapport, rejetsParRapport, dateCourte } from "../utils/statutRapport";
import { rapportJournalierApi } from "../services/api";
import { errorMessage } from "../services/queue";
import { useStore } from "../store/useStore";
import { getSecure } from "../services/secureStorage";
import AppHeader from "../components/AppHeader";
import ProfileSheet from "../components/ProfileSheet";
import BackButton from "../components/BackButton";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try { return format(parseISO(iso), "EEEE d MMMM yyyy", { locale: fr }); }
  catch { return iso; }
}

// ── Composants ──────────────────────────────────────────────────────────────

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoLine}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={4}>{value}</Text>
    </View>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <View style={s.block}>{children}</View>;
}

// ── Écran ────────────────────────────────────────────────────────────────────

export default function RapportDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isOnline, syncOffline } = useStore();
  // Jeton courant (relu à l'ouverture : il a pu être renouvelé) pour les photos.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { getSecure("access_token").then(setToken).catch(() => {}); }, []);
  const [profileOpen, setProfileOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // APP-31 : annulation motivée (le rapport reste sur le serveur, statut « annulé »).
  const [motif, setMotif] = useState<string | null>(null);
  const [annulant, setAnnulant] = useState(false);
  const [annulErreur, setAnnulErreur] = useState<string | null>(null);
  const [, setRefresh] = useState(0);

  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try { await syncOffline(true); } catch {} finally { setSyncing(false); }
  };

  const header = (
    <AppHeader
      userName={user?.name ?? ""}
      onAvatarPress={() => setProfileOpen(true)}
      onSyncPress={handleManualSync}
      syncing={syncing}
      isOnline={isOnline}
      sectionLabel="Espace Tuteur"
    />
  );

  const item = id ? getRapportJournalierById(id) : null;

  if (!item) {
    return (
      <View style={s.root}>
        {header}
        <View style={s.topBar}>
          <BackButton onPress={() => router.back()} style={{ marginRight: rs(10) }} />
          <Text style={s.topTitle}>Rapport</Text>
        </View>
        <View style={s.notFound}>
          <Feather name="alert-circle" size={rf(36)} color={C.border} />
          <Text style={s.notFoundTxt}>Rapport introuvable</Text>
        </View>
        <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
      </View>
    );
  }

  const synced = item.synced === 1;
  const annule = item.statut === "annule";
  let rejets = new Map<string, string | null>();
  try { rejets = rejetsParRapport(getFailedActions()); } catch {}
  const st = statutRapport(item, rejets);

  const annuler = async () => {
    if (!item.server_id) return;
    if (!motif || motif.trim().length < 3) {
      setAnnulErreur("Indiquez le motif de l'annulation (3 caractères minimum).");
      return;
    }
    setAnnulant(true);
    setAnnulErreur(null);
    try {
      const { data } = await rapportJournalierApi.annuler(item.server_id, motif.trim());
      setRapportJournalierStatut(item.id, data?.statut ?? "annule", data?.statut_motif ?? motif.trim(), data?.version ?? null);
      setMotif(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setAnnulErreur(errorMessage(e));
    } finally {
      setAnnulant(false);
    }
  };

  let diffs: string[] = [];
  try { diffs = JSON.parse(item.difficultes); } catch {}
  const diffsLabel = diffs.length && diffs[0] !== "Aucune"
    ? diffs.join(", ") : "Aucune";

  return (
    <View style={s.root}>
      {header}

      {/* ── Barre titre ── */}
      <View style={s.topBar}>
        <BackButton onPress={() => router.back()} style={{ marginRight: rs(10) }} />
        <View style={{ flex: 1 }}>
          <Text style={s.topTitle} numberOfLines={1}>
            {fmtDate(item.date_rapport)}
          </Text>
          <Text style={s.topSub}>Semaine {item.semaine} · Jour {item.jour_cours}</Text>
        </View>
        <View style={[s.badge, synced ? s.badgeOk : s.badgeProgress]}>
          <Feather
            name={synced ? "check-circle" : "loader"}
            size={rf(11)}
            color={synced ? C.success : C.warn}
          />
          <Text style={[s.badgeTxt, { color: synced ? C.success : C.warn }]}>
            {st.libelle}
          </Text>
        </View>
      </View>

      {/* ── Contenu ── */}
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >

        {/* RET02 : preuve de réception, date d'activité distincte de la date de réception */}
        <View style={[s.statutBox, { backgroundColor: st.code === "recu" ? C.successSoft : st.code === "a_verifier" ? C.dangerSoft : C.warnSoft }]}>
          <Text style={[s.statutTitre, { color: st.code === "recu" ? C.success : st.code === "a_verifier" ? C.danger : C.warn }]}>
            {st.libelle}
          </Text>
          <Text style={s.statutMotif}>Activité du {fmtDate(item.date_rapport)}</Text>
          {!!st.detail && <Text style={s.statutMotif}>{st.detail}</Text>}
          {st.tardif && <Text style={s.statutMotif}>Envoi tardif : reçu après le jour de l'activité.</Text>}
          {st.code === "a_verifier" && (
            <TouchableOpacity onPress={() => router.push("/sync-center" as any)}>
              <Text style={[s.statutMotif, { color: C.brand, fontWeight: "700" }]}>Ouvrir le centre d'envoi pour relancer →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* RET05 : retour du superviseur */}
        {!!item.retour_superviseur && (
          <View style={[s.statutBox, { backgroundColor: C.brandSoft }]}>
            <Text style={[s.statutTitre, { color: C.brand }]}>Retour du superviseur</Text>
            <Text style={[s.statutMotif, { color: C.text }]}>{item.retour_superviseur}</Text>
            {(item.retour_par || item.retour_le) && (
              <Text style={s.statutMotif}>
                {item.retour_par ?? ""}{item.retour_le ? ` · ${dateCourte(item.retour_le)}` : ""}
              </Text>
            )}
          </View>
        )}

        {/* Statut serveur (APP-31) */}
        {(annule || item.statut === "corrige") && (
          <View style={[s.statutBox, annule ? s.statutAnnule : s.statutCorrige]}>
            <Text style={[s.statutTitre, { color: annule ? C.danger : C.warn }]}>
              {annule ? "Rapport annulé" : `Rapport corrigé${item.version ? ` (version ${item.version})` : ""}`}
            </Text>
            {!!item.statut_motif && <Text style={s.statutMotif}>Motif : {item.statut_motif}</Text>}
            {annule && (
              <Text style={s.statutMotif}>Il reste consultable mais ne compte plus dans le suivi.</Text>
            )}
          </View>
        )}

        {/* Lieu */}
        <Text style={s.sectionLabel}>Lieu</Text>
        <Block>
          <InfoLine label="École"       value={item.ecole} />
          <InfoLine label="Commune"     value={item.commune} />
          <InfoLine label="IEF"         value={item.ief} />
          <InfoLine label="Superviseur" value={item.superviseur} />
        </Block>

        {/* Absences */}
        <Text style={s.sectionLabel}>Absences</Text>
        <Block>
          <InfoLine
            label="Nombre"
            value={`${item.nb_absences} élève${item.nb_absences > 1 ? "s" : ""}`}
          />
          {item.absents ? (
            <InfoLine label="Noms" value={item.absents} />
          ) : null}
        </Block>

        {/* Progression */}
        <Text style={s.sectionLabel}>Progression</Text>
        <Block>
          <InfoLine label="Semaine"    value={`Semaine ${item.semaine} sur 25`} />
          <InfoLine label="Jour cours" value={`Jour ${item.jour_cours}`} />
        </Block>

        {/* Difficultés */}
        <Text style={s.sectionLabel}>Difficultés</Text>
        <Block>
          <InfoLine label="Difficultés" value={diffsLabel} />
          {item.autres_difficultes ? (
            <InfoLine label="Autres" value={item.autres_difficultes} />
          ) : null}
          {item.description_difficultes ? (
            <InfoLine label="Description" value={item.description_difficultes} />
          ) : null}
        </Block>

        {/* Supervision */}
        <Text style={s.sectionLabel}>Supervision</Text>
        <Block>
          <InfoLine label="Directeur venu" value={item.directeur_venu ? "Oui" : "Non"} />
          <InfoLine label="Besoin d'appui" value={item.besoin_appui   ? "Oui" : "Non"} />
          {item.besoin_appui && item.domaines_appui ? (
            <InfoLine label="Domaines" value={item.domaines_appui} />
          ) : null}
        </Block>

        {/* Observations */}
        {item.has_observations === 1 && item.commentaires ? (
          <>
            <Text style={s.sectionLabel}>Observations</Text>
            <Block>
              <InfoLine label="Commentaires" value={item.commentaires} />
            </Block>
          </>
        ) : null}

        {/* Photos */}
        {(() => {
          let uris: string[] = [];
          if (item.photos_classe) {
            try { uris = JSON.parse(item.photos_classe); } catch {}
          }
          if (uris.length === 0 && item.photo_classe) {
            uris = [item.photo_classe];
          }
          if (uris.length === 0) return null;
          return (
            <>
              <Text style={s.sectionLabel}>
                Photo{uris.length > 1 ? "s" : ""} de la classe ({uris.length})
              </Text>
              <View style={s.photoGrid}>
                {uris.map((uri, i) => (
                  <Image
                    key={i}
                    // APP-37 : photo servie par l'API à la demande, avec le jeton.
                    source={uri.startsWith("http") && token
                      ? { uri, headers: { Authorization: `Bearer ${token}` } }
                      : { uri }}
                    style={uris.length === 1 ? s.photoFull : s.photoThumb}
                    resizeMode="cover"
                  />
                ))}
              </View>
            </>
          );
        })()}

        {/* Annuler un rapport envoyé (motif obligatoire, APP-31) */}
        {synced && !!item.server_id && !annule && (
          motif === null ? (
            <TouchableOpacity style={s.annulerBtn} onPress={() => setMotif("")} disabled={!isOnline}>
              <Feather name="x-circle" size={rf(15)} color={isOnline ? C.danger : C.textMuted} />
              <Text style={[s.annulerTxt, !isOnline && { color: C.textMuted }]}>
                {isOnline ? "Annuler ce rapport" : "Annulation possible avec une connexion"}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={s.annulerBox}>
              <Text style={s.sectionLabel}>Pourquoi annuler ce rapport ?</Text>
              <TextInput
                value={motif}
                onChangeText={setMotif}
                placeholder="Ex. : rapport envoyé pour la mauvaise date"
                placeholderTextColor={C.textMuted}
                style={s.motifInput}
                multiline
                maxLength={500}
              />
              <Text style={s.statutMotif}>
                Le rapport n'est pas effacé : il est marqué « annulé » et ne compte plus dans le suivi.
              </Text>
              {!!annulErreur && <Text style={s.annulErr}>{annulErreur}</Text>}
              <View style={{ flexDirection: "row", gap: rs(10), marginTop: rs(10) }}>
                <TouchableOpacity style={[s.confirmBtn, annulant && { opacity: 0.6 }]} onPress={annuler} disabled={annulant}>
                  {annulant ? <ActivityIndicator color="#fff" /> : <Text style={s.confirmTxt}>Confirmer l'annulation</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.retourBtn} onPress={() => { setMotif(null); setAnnulErreur(null); }}>
                  <Text style={s.retourTxt}>Retour</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        )}

        <View style={{ height: rs(32) }} />
      </ScrollView>

      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  /* Barre titre */
  topBar: {
    flexDirection:    "row",
    alignItems:       "center",
    paddingHorizontal: rs(16),
    paddingVertical:  rs(12),
    backgroundColor:  C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: rs(10),
  },
  topTitle: { fontSize: rf(17), fontWeight: "700", color: C.text, textTransform: "capitalize" },
  topSub:   { fontSize: rf(13), color: C.textMuted, marginTop: rs(1) },

  /* Badge */
  badge: {
    flexDirection: "row", alignItems: "center", gap: rs(4),
    borderRadius: rs(20), paddingHorizontal: rs(8), paddingVertical: rs(4),
    flexShrink: 0,
  },
  badgeOk:       { backgroundColor: C.successSoft },
  badgeProgress: { backgroundColor: C.warnSoft },
  badgeTxt:      { fontSize: rf(12), fontWeight: "700" },

  /* Contenu */
  scroll: { padding: rs(16) },

  /* Statut / annulation (APP-31) */
  statutBox:     { borderRadius: rs(12), padding: rs(12), marginBottom: rs(12) },
  statutAnnule:  { backgroundColor: C.dangerSoft },
  statutCorrige: { backgroundColor: C.warnSoft },
  statutTitre:   { fontSize: rf(14.5), fontWeight: "800" },
  statutMotif:   { fontSize: rf(13), color: C.textMuted, marginTop: rs(4), lineHeight: rf(18) },
  annulerBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: rs(8), marginTop: rs(20), paddingVertical: rs(12), borderRadius: rs(12), borderWidth: 1, borderColor: C.border },
  annulerTxt:    { fontSize: rf(14), fontWeight: "700", color: C.danger },
  annulerBox:    { marginTop: rs(20) },
  motifInput:    { minHeight: rs(70), borderWidth: 1, borderColor: C.border, borderRadius: rs(10), padding: rs(10), fontSize: rf(14), color: C.text, backgroundColor: C.surface, textAlignVertical: "top" },
  annulErr:      { fontSize: rf(13), color: C.danger, marginTop: rs(6) },
  confirmBtn:    { flex: 1, backgroundColor: C.danger, borderRadius: rs(10), paddingVertical: rs(12), alignItems: "center" },
  confirmTxt:    { color: "#fff", fontSize: rf(14), fontWeight: "800" },
  retourBtn:     { paddingVertical: rs(12), paddingHorizontal: rs(14), borderRadius: rs(10), backgroundColor: C.surfaceAlt },
  retourTxt:     { fontSize: rf(14), fontWeight: "700", color: C.text },

  sectionLabel: {
    fontSize:      rf(12),
    fontWeight:    "700",
    color:         C.brand,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom:  rs(8),
    marginTop:     rs(16),
  },

  block: {
    backgroundColor: C.surface,
    borderRadius:    rs(14),
    borderWidth:     1,
    borderColor:     C.border,
    overflow:        "hidden",
  },

  infoLine: {
    flexDirection:    "row",
    justifyContent:   "space-between",
    alignItems:       "flex-start",
    paddingHorizontal: rs(14),
    paddingVertical:  rs(12),
    borderBottomWidth: 1,
    borderBottomColor: C.border + "80",
  },
  infoLabel: {
    fontSize:   rf(15),
    color:      C.textMuted,
    fontWeight: "500",
    flexShrink: 0,
    marginRight: rs(16),
  },
  infoValue: {
    fontSize:   rf(15),
    color:      C.text,
    fontWeight: "600",
    flex:       1,
    textAlign:  "right",
  },

  /* Photos */
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rs(8),
  },
  photoFull: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: rs(14),
    backgroundColor: C.border,
  },
  photoThumb: {
    width: "31.5%",
    aspectRatio: 1,
    borderRadius: rs(12),
    backgroundColor: C.border,
  },

  /* Not found */
  notFound: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: rs(12),
  },
  notFoundTxt: {
    fontSize: rf(16), color: C.textMuted,
  },
});
