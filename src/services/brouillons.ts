/**
 * Brouillons persistants (retours terrain, RET01).
 *
 * Une saisie commencée (rapport journalier, rapport superviseur, évaluation)
 * survit à la fermeture forcée de l'application, au retour arrière et à
 * l'expiration de session : elle est enregistrée au fil de la saisie, chiffrée
 * (même clé que le cache, Keystore), et rattachée au compte qui l'a commencée
 * — un autre compte connecté sur le même téléphone ne la voit jamais.
 *
 * Les photos ne sont pas copiées en base64 dans le brouillon (taille) : elles
 * sont recopiées dans le dossier privé de l'application et relues au besoin.
 */
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { base64DepuisDataUri, estWeb } from "../utils/web";
import { getEncryptedItem, setEncryptedItem } from "./cryptoStorage";

export type TypeBrouillon = "rapport_journalier" | "rapport_superviseur" | "evaluation";

export interface Brouillon<T> {
  type:       TypeBrouillon;
  owner_id:   string;
  maj_le:     string;   // ISO, dernière modification
  donnees:    T;
}

const PREFIXE = "brouillon_v1";
const cle = (type: TypeBrouillon, owner: string) => `${PREFIXE}:${type}:${owner}`;
const DOSSIER_PHOTOS = `${FileSystem.documentDirectory ?? ""}brouillons/`;

export async function lireBrouillon<T>(type: TypeBrouillon, owner: string | null | undefined): Promise<Brouillon<T> | null> {
  if (!owner) return null;
  const b = await getEncryptedItem<Brouillon<T>>(cle(type, owner)).catch(() => null);
  // Contrôle de propriété en plus de la clé : jamais la saisie d'un autre compte.
  return b && b.owner_id === owner && b.type === type ? b : null;
}

export async function enregistrerBrouillon<T>(type: TypeBrouillon, owner: string | null | undefined, donnees: T): Promise<void> {
  if (!owner) return;
  const b: Brouillon<T> = { type, owner_id: owner, maj_le: new Date().toISOString(), donnees };
  await setEncryptedItem(cle(type, owner), b);
}

export async function supprimerBrouillon(type: TypeBrouillon, owner: string | null | undefined): Promise<void> {
  if (!owner) return;
  await AsyncStorage.removeItem(cle(type, owner)).catch(() => {});
  if (type === "rapport_journalier" || type === "rapport_superviseur") {
    await FileSystem.deleteAsync(`${DOSSIER_PHOTOS}${type}_${owner}/`, { idempotent: true }).catch(() => {});
  }
}

/** Liste des brouillons du compte (centre de synchronisation : « ce qui reste à faire »). */
export async function brouillonsDuCompte(owner: string | null | undefined): Promise<Brouillon<unknown>[]> {
  if (!owner) return [];
  const types: TypeBrouillon[] = ["rapport_journalier", "rapport_superviseur", "evaluation"];
  const res = await Promise.all(types.map(t => lireBrouillon<unknown>(t, owner)));
  return res.filter((b): b is Brouillon<unknown> => !!b);
}

/** Recopie une photo choisie dans le dossier privé du brouillon (l'original peut être effacé du cache). */
export async function conserverPhoto(type: TypeBrouillon, owner: string, uri: string): Promise<string> {
  if (estWeb) return uri;   // navigateur : la photo est déjà une image data: autonome
  const dossier = `${DOSSIER_PHOTOS}${type}_${owner}/`;
  try {
    await FileSystem.makeDirectoryAsync(dossier, { intermediates: true }).catch(() => {});
    const dest = `${dossier}${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

/** Relit une photo du brouillon ; null si le fichier a disparu. */
export async function relirePhoto(uri: string): Promise<{ uri: string; base64: string } | null> {
  const enLigne = base64DepuisDataUri(uri);
  if (enLigne) return { uri, base64: enLigne };
  if (estWeb) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return { uri, base64 };
  } catch {
    return null;
  }
}

/** Libellé court : « il y a 5 min », « hier à 17:02 ». */
export function depuis(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const min = Math.round((maintenant.getTime() - d.getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const j = new Date(maintenant); j.setHours(0, 0, 0, 0);
  if (d >= j) return `aujourd'hui à ${h}`;
  j.setDate(j.getDate() - 1);
  if (d >= j) return `hier à ${h}`;
  return `le ${d.toLocaleDateString("fr-FR")} à ${h}`;
}
