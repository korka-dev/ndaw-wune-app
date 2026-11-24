/**
 * Lot L8 — liste paginée (« charger plus ») des rapports de l'IEF.
 * La première page est gardée dans le cache de l'espace inspecteur ; celle
 * sans filtre et celle de chaque école consultée restent disponibles hors ligne.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { inspecteurApi, InspecteurRapportsFiltres, RapportJournalierListItem } from "../../services/api";
import { estErreurReseau, messageErreurInspecteur } from "../../utils/inspecteur";
import { cacheInspecteur } from "../../services/inspecteurCache";
import { useStore } from "../../store/useStore";
import { texteBandeau } from "./InspCommun";

export const TAILLE_PAGE = 20;

type Page = { total: number; items: RapportJournalierListItem[] };

export function cleRapport(id: string) { return `rapport:${id}`; }

function memoriser(items: RapportJournalierListItem[]) {
  for (const r of items) cacheInspecteur.set(cleRapport(String(r.id)), r);
}

export function useRapportsIef(filtres: Omit<InspecteurRapportsFiltres, "skip" | "limit">) {
  const enLigne = useStore((st) => st.isOnline);
  const cle = `rapports:${JSON.stringify(filtres)}`;
  const initial = cacheInspecteur.get<Page>(cle);
  const [items, setItems] = useState<RapportJournalierListItem[]>(initial?.items ?? []);
  const [total, setTotal] = useState<number>(initial?.total ?? 0);
  const [at, setAt] = useState<number | undefined>(cacheInspecteur.dateDe(cle));
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<{ texte: string; reseau: boolean } | null>(null);
  const [charge, setCharge] = useState(!!initial);
  const filtresRef = useRef(filtres);
  filtresRef.current = filtres;
  const requete = useRef(0);

  const recharger = useCallback(async (manuel = false) => {
    const n = ++requete.current;
    if (manuel) setRefreshing(true);
    try {
      const { data } = await inspecteurApi.rapports({ ...filtresRef.current, skip: 0, limit: TAILLE_PAGE });
      if (n !== requete.current) return; // filtres changés entre-temps
      memoriser(data.items);
      cacheInspecteur.set(cle, { total: data.total, items: data.items });
      setItems(data.items);
      setTotal(data.total);
      setAt(cacheInspecteur.dateDe(cle));
      setErr(null);
      setCharge(true);
    } catch (e) {
      if (n === requete.current) setErr({ texte: messageErreurInspecteur(e, "les rapports"), reseau: estErreurReseau(e) });
    } finally {
      if (n === requete.current) { setLoading(false); setRefreshing(false); }
    }
  }, [cle]);

  useEffect(() => {
    let actif = true;
    cacheInspecteur.attendre().then(() => {
      if (!actif) return;
      const c = cacheInspecteur.get<Page>(cle);
      setItems(c?.items ?? []);
      setTotal(c?.total ?? 0);
      setAt(cacheInspecteur.dateDe(cle));
      setCharge(!!c);
      setLoading(!c);
      setErr(null);
      recharger();
    });
    return () => { actif = false; };
  }, [cle, recharger]);

  useEffect(() => { if (enLigne && err?.reseau) recharger(); }, [enLigne]); // eslint-disable-line react-hooks/exhaustive-deps

  const chargerPlus = useCallback(async () => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    const n = requete.current;
    try {
      const { data } = await inspecteurApi.rapports({ ...filtresRef.current, skip: items.length, limit: TAILLE_PAGE });
      if (n !== requete.current) return;
      memoriser(data.items);
      const vus = new Set(items.map((r) => String(r.id)));
      setItems([...items, ...data.items.filter((r) => !vus.has(String(r.id)))]);
      setTotal(data.total);
      setErr(null);
    } catch (e) {
      setErr({ texte: messageErreurInspecteur(e, "la suite des rapports"), reseau: estErreurReseau(e) });
    } finally {
      setLoadingMore(false);
    }
  }, [items, total, loadingMore]);

  return {
    items, total, loading, refreshing, loadingMore, charge, recharger, chargerPlus,
    error: err?.texte ?? null,
    bandeau: texteBandeau(charge, enLigne, err, at),
    reste: Math.max(0, total - items.length),
  };
}
