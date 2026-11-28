/**
 * Version web (PWA, lot L12) : petites aides propres au navigateur.
 * Sur le téléphone, `estWeb` vaut false et rien ne change.
 */
import { Platform } from "react-native";

export const estWeb = Platform.OS === "web";

/** Base64 d'une image « data:… » (photo choisie dans le navigateur). */
export function base64DepuisDataUri(uri: string): string | null {
  const i = uri.indexOf(",");
  return uri.startsWith("data:") && i > 0 ? uri.slice(i + 1) : null;
}

/** Télécharge un fichier protégé (jeton) et le propose au navigateur. */
export async function telechargerDansNavigateur(url: string, jeton: string | null, nomFichier: string): Promise<void> {
  const r = await fetch(url, { headers: jeton ? { Authorization: `Bearer ${jeton}` } : undefined });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const objet = URL.createObjectURL(await r.blob());
  try {
    const a = document.createElement("a");
    a.href = objet;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objet), 60_000);
  }
}
