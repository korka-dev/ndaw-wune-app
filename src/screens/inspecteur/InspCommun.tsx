/**
 * Lot L8 — éléments communs de l'espace inspecteur (consultation seule) :
 * en-tête avec profil/déconnexion, chargement avec cache mémoire, états
 * vide/erreur et carte de rapport.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import AppHeader from "../../components/AppHeader";
import ProfileSheet from "../../components/ProfileSheet";
import { useStore } from "../../store/useStore";
import { C } from "../../utils/theme";
import { rf, rs } from "../../utils/responsive";
import { cacheInspecteur, dateLisible, messageErreurInspecteur } from "../../utils/inspecteur";
import type { RapportJournalierListItem } from "../../services/api";

/** En-tête « Espace Inspecteur » ; le bouton d'actualisation recharge l'écran. */
export function InspHeader({ onRefresh, refreshing }: { onRefresh?: () => void; refreshing?: boolean }) {
  const { user, isOnline } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppHeader
        userName={user?.name ?? ""}
        onAvatarPress={() => setOpen(true)}
        onSyncPress={onRefresh}
        syncing={!!refreshing}
        isOnline={isOnline}
        sectionLabel="Espace Inspecteur"
      />
      <ProfileSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Charge une ressource avec un cache mémoire : la dernière valeur connue
 * s'affiche tout de suite, puis est rafraîchie depuis le serveur.
 */
export function useInspData<T>(cle: string | null, charger: () => Promise<T>, quoi: string) {
  const [data, setData] = useState<T | undefined>(() => (cle ? cacheInspecteur.get<T>(cle) : undefined));
  const [loading, setLoading] = useState(data === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chargerRef = useRef(charger);
  chargerRef.current = charger;

  const reload = useCallback(async (manuel = false) => {
    if (!cle) return;
    if (manuel) setRefreshing(true);
    try {
      const v = await chargerRef.current();
      cacheInspecteur.set(cle, v);
      setData(v);
      setError(null);
    } catch (e) {
      setError(messageErreurInspecteur(e, quoi));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cle, quoi]);

  useEffect(() => {
    if (!cle) return;
    const c = cacheInspecteur.get<T>(cle);
    setData(c);
    setLoading(c === undefined);
    reload();
  }, [cle, reload]);

  return { data, loading, refreshing, error, reload };
}

export function Chargement() {
  return (
    <View style={s.centre}>
      <ActivityIndicator color={C.brand} />
      <Text style={s.centreTxt}>Chargement…</Text>
    </View>
  );
}

export function EtatMessage({ icon, texte, onRetry }: { icon: keyof typeof Feather.glyphMap; texte: string; onRetry?: () => void }) {
  return (
    <View style={s.centre}>
      <Feather name={icon} size={rf(34)} color={C.textMuted} />
      <Text style={s.centreTxt}>{texte}</Text>
      {onRetry && (
        <TouchableOpacity style={s.retryBtn} onPress={onRetry} activeOpacity={0.7}>
          <Text style={s.retryTxt}>Réessayer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Bandeau discret quand des données en mémoire sont montrées malgré une erreur. */
export function BandeauErreur({ texte }: { texte: string }) {
  return (
    <View style={s.bandeau}>
      <Feather name="wifi-off" size={rf(13)} color={C.warn} />
      <Text style={s.bandeauTxt}>{texte}</Text>
    </View>
  );
}

export function RapportCarte({ r, onPress, avecEcole = true }: { r: RapportJournalierListItem; onPress: () => void; avecEcole?: boolean }) {
  return (
    <TouchableOpacity style={s.carte} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={s.carteTitre} numberOfLines={1}>{r.nom_tuteur || "—"}</Text>
        <Text style={s.carteSub} numberOfLines={1}>
          {dateLisible(r.date_rapport)}{avecEcole && r.ecole ? ` · ${r.ecole}` : ""}
        </Text>
        <View style={s.badges}>
          {r.besoin_appui && <Badge texte="Besoin d'appui" couleur={C.danger} fond={C.dangerSoft} />}
          {r.statut === "corrige" && <Badge texte="Corrigé" couleur={C.warn} fond={C.warnSoft} />}
          {r.statut === "annule" && <Badge texte="Annulé" couleur={C.textMuted} fond={C.surfaceAlt} />}
          <Badge texte={`${r.nb_absences ?? 0} absent${(r.nb_absences ?? 0) > 1 ? "s" : ""}`} couleur={C.textMuted} fond={C.surfaceAlt} />
        </View>
      </View>
      <Feather name="chevron-right" size={rf(20)} color={C.textMuted} />
    </TouchableOpacity>
  );
}

export function Badge({ texte, couleur, fond }: { texte: string; couleur: string; fond: string }) {
  return (
    <View style={[s.badge, { backgroundColor: fond }]}>
      <Text style={[s.badgeTxt, { color: couleur }]}>{texte}</Text>
    </View>
  );
}

export const insp = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: rs(16), paddingBottom: rs(32) },
  titre: { fontSize: rf(20), fontWeight: "800", color: C.text },
  sousTitre: { fontSize: rf(13.5), color: C.textMuted, marginTop: rs(2) },
  sectionLabel: {
    fontSize: rf(12), fontWeight: "700", color: C.brand, textTransform: "uppercase",
    letterSpacing: 0.6, marginBottom: rs(8), marginTop: rs(18),
  },
  bloc: { backgroundColor: C.surface, borderRadius: rs(14), borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  ligne: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: rs(14), paddingVertical: rs(12), borderBottomWidth: 1, borderBottomColor: C.border + "80",
  },
  ligneLabel: { fontSize: rf(15), color: C.textMuted, fontWeight: "500", marginRight: rs(16), flexShrink: 0 },
  ligneValeur: { fontSize: rf(15), color: C.text, fontWeight: "600", flex: 1, textAlign: "right" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: rs(8) },
  chip: { paddingHorizontal: rs(12), paddingVertical: rs(7), borderRadius: rs(20), borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipActif: { backgroundColor: C.brand, borderColor: C.brand },
  chipTxt: { fontSize: rf(13), fontWeight: "700", color: C.text },
  chipTxtActif: { color: "#fff" },
});

export function Ligne({ label, valeur }: { label: string; valeur: string | number | null | undefined }) {
  return (
    <View style={insp.ligne}>
      <Text style={insp.ligneLabel}>{label}</Text>
      <Text style={insp.ligneValeur} numberOfLines={6}>{valeur === null || valeur === undefined || valeur === "" ? "—" : String(valeur)}</Text>
    </View>
  );
}

export function Chip({ texte, actif, onPress }: { texte: string; actif: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[insp.chip, actif && insp.chipActif]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[insp.chipTxt, actif && insp.chipTxtActif]}>{texte}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  centre: { alignItems: "center", justifyContent: "center", paddingVertical: rs(48), paddingHorizontal: rs(24), gap: rs(10) },
  centreTxt: { fontSize: rf(14.5), color: C.textMuted, textAlign: "center", lineHeight: rf(20) },
  retryBtn: { marginTop: rs(6), paddingHorizontal: rs(18), paddingVertical: rs(10), borderRadius: rs(10), backgroundColor: C.brand },
  retryTxt: { color: "#fff", fontWeight: "800", fontSize: rf(14) },
  bandeau: { flexDirection: "row", alignItems: "center", gap: rs(8), backgroundColor: C.warnSoft, borderRadius: rs(10), padding: rs(10), marginBottom: rs(12) },
  bandeauTxt: { flex: 1, fontSize: rf(12.5), color: C.text },
  carte: {
    flexDirection: "row", alignItems: "center", gap: rs(10), backgroundColor: C.surface, borderRadius: rs(14),
    borderWidth: 1, borderColor: C.border, padding: rs(14), marginBottom: rs(10),
  },
  carteTitre: { fontSize: rf(15.5), fontWeight: "700", color: C.text },
  carteSub: { fontSize: rf(13), color: C.textMuted, marginTop: rs(2) },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: rs(6), marginTop: rs(8) },
  badge: { borderRadius: rs(20), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  badgeTxt: { fontSize: rf(11.5), fontWeight: "700" },
});
