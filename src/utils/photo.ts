/**
 * Photos des rapports : réduites avant stockage et envoi (données mobiles).
 * Une photo de 12 Mpx (1 à 3 Mo) devient une image de 1280 px de large
 * (~150 à 250 Ko), largement suffisante pour illustrer une séance.
 */
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

export const LARGEUR_MAX_PHOTO = 1280;
export const QUALITE_PHOTO = 0.6;

/** Redimensionnement à appliquer (null : image déjà assez petite). */
export function redimensionnement(largeur?: number, hauteur?: number): { width: number } | null {
  if (!largeur || largeur <= LARGEUR_MAX_PHOTO) return null;
  return { width: LARGEUR_MAX_PHOTO };
}

/** Réduit la photo ; en cas d'échec, l'original est conservé (jamais de perte). */
export async function compresserPhoto(asset: { uri: string; width?: number; height?: number; base64?: string | null }):
  Promise<{ uri: string; base64: string | null }> {
  try {
    const resize = redimensionnement(asset.width, asset.height);
    const res = await manipulateAsync(asset.uri, resize ? [{ resize }] : [],
      { compress: QUALITE_PHOTO, format: SaveFormat.JPEG, base64: true });
    return { uri: res.uri, base64: res.base64 ?? null };
  } catch {
    return { uri: asset.uri, base64: asset.base64 ?? null };
  }
}
