/**
 * Lot L8 — cache hors ligne de l'espace inspecteur.
 *
 * Mémoire + persistance chiffrée (AsyncStorage via cryptoStorage), rattachée
 * à l'identifiant du compte :
 *   - persistés : profil, résumé, écoles, personnes par école consultée,
 *     première page de rapports (globale et par école consultée) — jamais les
 *     photos ; au plus MAX_RAPPORTS rapports au total (les listes les plus
 *     anciennes sont abandonnées) ;
 *   - un autre compte ne voit jamais ces données : ouvrir() sur un autre id
 *     purge tout ; la déconnexion et l'expiration de session purgent aussi.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getEncryptedItem, setEncryptedItem } from "./cryptoStorage";

export const PREFIXE_CACHE = "ared_inspecteur_cache_v1:";
export const CLE_PROPRIETAIRE = "ared_inspecteur_cache_owner";
export const MAX_RAPPORTS = 200;

type Entree = { v: unknown; at: number };
type Stocke = { owner: string; entries: Record<string, Entree> };

const memoire = new Map<string, Entree>();
let proprietaire: string | null = null;
let ouverture: Promise<void> = Promise.resolve();
let ecriture: Promise<void> = Promise.resolve();

/** Clés persistées : le reste (filtres, détails) ne vit qu'en mémoire. */
export function estPersistable(cle: string): boolean {
  if (cle === "profil" || cle === "resume" || cle === "ecoles") return true;
  if (cle.startsWith("personnes:")) return true;
  if (cle.startsWith("rapports:")) {
    try {
      const f = JSON.parse(cle.slice("rapports:".length)) as Record<string, unknown>;
      const k = Object.keys(f);
      return k.length === 0 || (k.length === 1 && k[0] === "ecole_id");
    } catch { return false; }
  }
  return false;
}

function nbRapports(e: Entree): number {
  const items = (e.v as { items?: unknown[] } | null)?.items;
  return Array.isArray(items) ? items.length : 0;
}

/** Garde au plus `max` rapports : les listes de rapports les plus récentes d'abord. */
export function limiterRapports(entries: Record<string, Entree>, max = MAX_RAPPORTS): Record<string, Entree> {
  const out: Record<string, Entree> = {};
  const listes = Object.entries(entries).filter(([k]) => k.startsWith("rapports:")).sort((a, b) => b[1].at - a[1].at);
  for (const [k, e] of Object.entries(entries)) if (!k.startsWith("rapports:")) out[k] = e;
  let total = 0;
  for (const [k, e] of listes) {
    const n = nbRapports(e);
    if (total + n > max) continue;
    total += n;
    out[k] = e;
  }
  return out;
}

function persister(): Promise<void> {
  const owner = proprietaire;
  if (!owner) return ecriture;
  const entries: Record<string, Entree> = {};
  for (const [k, e] of memoire) if (estPersistable(k)) entries[k] = e;
  const donnees: Stocke = { owner, entries: limiterRapports(entries) };
  ecriture = ecriture
    .then(() => (proprietaire === owner ? setEncryptedItem(PREFIXE_CACHE + owner, donnees) : undefined))
    .catch(() => {});
  return ecriture;
}

/** Supprime les données persistées de l'espace inspecteur. Un seul compte est
 *  persisté à la fois (ouvrir() purge le précédent) : le pointeur suffit. */
async function purgerStockage(...autres: (string | null)[]): Promise<void> {
  try {
    const pointeur = await AsyncStorage.getItem(CLE_PROPRIETAIRE).catch(() => null);
    const owners = [...new Set([pointeur, ...autres].filter((x): x is string => !!x))];
    await AsyncStorage.multiRemove([CLE_PROPRIETAIRE, ...owners.map((o) => PREFIXE_CACHE + o)]);
  } catch {}
}

export const cacheInspecteur = {
  /** Charge le cache du compte `owner`. Un autre compte précédent est purgé. */
  ouvrir(owner: string): Promise<void> {
    ouverture = ouverture.then(async () => {
      if (proprietaire === owner) return;
      memoire.clear();
      const precedent = await AsyncStorage.getItem(CLE_PROPRIETAIRE).catch(() => null);
      if (precedent && precedent !== owner) await purgerStockage();
      proprietaire = owner;
      await AsyncStorage.setItem(CLE_PROPRIETAIRE, owner).catch(() => {});
      const s = await getEncryptedItem<Stocke>(PREFIXE_CACHE + owner).catch(() => null);
      if (s && s.owner === owner && s.entries) {
        for (const [k, e] of Object.entries(s.entries)) memoire.set(k, e);
        // Les rapports des listes sont consultables hors ligne dans le détail.
        for (const [k, e] of Object.entries(s.entries)) {
          if (!k.startsWith("rapports:")) continue;
          for (const r of ((e.v as { items?: { id: unknown }[] })?.items ?? [])) {
            if (!memoire.has(`rapport:${r.id}`)) memoire.set(`rapport:${r.id}`, { v: r, at: e.at });
          }
        }
      }
    }).catch(() => {});
    return ouverture;
  },

  /** Dernier compte ayant ouvert le cache (démarrage hors ligne). */
  dernierProprietaire: (): Promise<string | null> => AsyncStorage.getItem(CLE_PROPRIETAIRE).catch(() => null),

  attendre: () => ouverture,
  proprietaire: () => proprietaire,

  get: <T>(k: string) => memoire.get(k)?.v as T | undefined,
  /** Horodatage (ms) de la donnée en cache, ou undefined. */
  dateDe: (k: string) => memoire.get(k)?.at,

  set(k: string, v: unknown, at = Date.now()): void {
    memoire.set(k, { v, at });
    if (estPersistable(k)) persister();
  },

  /** Écritures en cours terminées (tests). */
  ecrit: () => ecriture,

  /** Déconnexion / session expirée : mémoire et stockage vidés. */
  async purger(): Promise<void> {
    const ancien = proprietaire;
    memoire.clear();
    proprietaire = null;
    await ecriture.catch(() => {});
    await purgerStockage(ancien);
  },
};
