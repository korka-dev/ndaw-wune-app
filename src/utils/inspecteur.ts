/**
 * Lot L8 — utilitaires purs de l'espace inspecteur (consultation seule).
 */
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";

/** « 24 nov. 2026 » ; tiret si absent ; la chaîne brute si illisible. */
export function dateLisible(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "d MMM yyyy", { locale: fr }); }
  catch { return iso; }
}

/** « lundi 24 novembre 2026 » pour l'en-tête du détail. */
export function dateLongue(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "EEEE d MMMM yyyy", { locale: fr }); }
  catch { return iso; }
}

/** Message d'erreur clair : hors ligne, hors périmètre (404), accès refusé. */
export function messageErreurInspecteur(e: unknown, quoi = "les données"): string {
  const err = e as { response?: { status?: number; data?: { detail?: unknown } } } | null;
  if (!err?.response) return `Pas de connexion Internet : impossible de charger ${quoi}. Réessayez une fois connecté.`;
  const st = err.response.status;
  if (st === 404) return "Élément introuvable ou hors de votre IEF.";
  if (st === 403) return "Accès réservé aux inspecteurs d'IEF.";
  const d = err.response.data?.detail;
  return typeof d === "string" && d ? d : `Impossible de charger ${quoi} (erreur ${st ?? "inconnue"}).`;
}

/** Les difficultés arrivent en liste ou en chaîne JSON selon la version. */
export function difficultesListe(v: unknown): string[] {
  let l: unknown = v;
  if (typeof v === "string") {
    try { l = JSON.parse(v); } catch { l = v ? [v] : []; }
  }
  if (!Array.isArray(l)) return [];
  return l.map(String).filter((x) => x && x !== "Aucune");
}

/** Réponses aux questions complémentaires, en paires lisibles. */
export function reponsesLisibles(v: unknown): { question: string; reponse: string }[] {
  if (!v) return [];
  const txt = (x: unknown) => {
    if (x === null || x === undefined || x === "") return "—";
    if (typeof x === "boolean") return x ? "Oui" : "Non";
    if (Array.isArray(x)) return x.map(String).join(", ");
    return typeof x === "object" ? JSON.stringify(x) : String(x);
  };
  if (Array.isArray(v)) {
    return v.map((r: any, i) => ({
      question: String(r?.question ?? r?.libelle ?? r?.label ?? `Question ${i + 1}`),
      reponse: txt(r?.reponse ?? r?.valeur ?? r?.value ?? r),
    }));
  }
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).map(([q, r]) => ({ question: q, reponse: txt(r) }));
  }
  return [];
}

export type Periode = "tout" | "7j" | "30j";

/** Date de début (YYYY-MM-DD) correspondant à une période, ou undefined. */
export function dateDebutPeriode(p: Periode, aujourdHui: Date = new Date()): string | undefined {
  if (p === "7j") return format(subDays(aujourdHui, 6), "yyyy-MM-dd");
  if (p === "30j") return format(subDays(aujourdHui, 29), "yyyy-MM-dd");
  return undefined;
}

/** Filtre local de la liste des écoles (nom, commune, directeur, code). */
export function filtrerEcoles<T extends { nom: string; commune?: string | null; directeur?: string | null; code_ecole?: unknown }>(
  ecoles: T[], recherche: string,
): T[] {
  const q = recherche.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!q) return ecoles;
  const norm = (x: unknown) => String(x ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return ecoles.filter((e) =>
    [e.nom, e.commune, e.directeur, e.code_ecole].some((c) => norm(c).includes(q)));
}

// ── Cache mémoire simple (durée de la session de l'application) ──────────────
const memo = new Map<string, unknown>();
export const cacheInspecteur = {
  get: <T>(k: string) => memo.get(k) as T | undefined,
  set: (k: string, v: unknown) => { memo.set(k, v); },
  clear: () => memo.clear(),
};
