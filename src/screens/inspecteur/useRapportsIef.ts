/**
 * Lot L8 — liste paginée (« charger plus ») des rapports de l'IEF.
 * La première page est gardée en mémoire par jeu de filtres.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { inspecteurApi, InspecteurRapportsFiltres, RapportJournalierListItem } from "../../services/api";
import { cacheInspecteur, messageErreurInspecteur } from "../../utils/inspecteur";

export const TAILLE_PAGE = 20;

type Page = { total: number; items: RapportJournalierListItem[] };

export function cleRapport(id: string) { return `rapport:${id}`; }

function memoriser(items: RapportJournalierListItem[]) {
  for (const r of items) cacheInspecteur.set(cleRapport(String(r.id)), r);
}

export function useRapportsIef(filtres: Omit<InspecteurRapportsFiltres, "skip" | "limit">) {
  const cle = `rapports:${JSON.stringify(filtres)}`;
  const initial = cacheInspecteur.get<Page>(cle);
  const [items, setItems] = useState<RapportJournalierListItem[]>(initial?.items ?? []);
  const [total, setTotal] = useState<number>(initial?.total ?? 0);
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(null);
      setCharge(true);
    } catch (e) {
      if (n === requete.current) setError(messageErreurInspecteur(e, "les rapports"));
    } finally {
      if (n === requete.current) { setLoading(false); setRefreshing(false); }
    }
  }, [cle]);

  useEffect(() => {
    const c = cacheInspecteur.get<Page>(cle);
    setItems(c?.items ?? []);
    setTotal(c?.total ?? 0);
    setCharge(!!c);
    setLoading(!c);
    setError(null);
    recharger();
  }, [cle, recharger]);

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
      setError(null);
    } catch (e) {
      setError(messageErreurInspecteur(e, "la suite des rapports"));
    } finally {
      setLoadingMore(false);
    }
  }, [items, total, loadingMore]);

  return { items, total, loading, refreshing, loadingMore, error, charge, recharger, chargerPlus, reste: Math.max(0, total - items.length) };
}
