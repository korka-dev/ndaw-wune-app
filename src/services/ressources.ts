/**
 * Synchronisation automatique des ressources pédagogiques hors-ligne.
 *
 * Appelé par NetworkWatcher après chaque sync réussie.
 * Stratégie :
 *   1. Récupère la liste des docs depuis le serveur.
 *   2. Vérifie ce qui est déjà présent en local (AsyncStorage + FileSystem).
 *   3. Télécharge uniquement les nouveaux docs manquants, en Wi-Fi et
 *      s'ils sont petits (≤ 5 Mo, hors vidéos) — RET11.
 *   4. Nettoie les fichiers locaux dont le doc a été supprimé côté serveur.
 *
 * Idempotent — un document déjà téléchargé et présent sur le disque
 * ne sera jamais re-téléchargé.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Network from "expo-network";
import { ressourcesApi } from "./api";
import { getSecure } from "./secureStorage";

export const RESSOURCES_DOWNLOADS_KEY = "@ressources_offline_v1";
export const RESSOURCES_DOCS_CACHE_KEY = "@ressources_docs_list_v1";

// RET11 — limiter la charge sur le téléphone : téléchargement automatique
// seulement en Wi-Fi, des petits documents, jamais des vidéos. Le reste se
// télécharge à la demande (bouton ↓ de l'écran Ressources).
const AUTO_MAX_OCTETS = 5 * 1024 * 1024;

export function telechargeableAuto(doc: { file_size?: number; resource_type?: string | null; mime_type?: string }): boolean {
  if (doc.resource_type === "video" || (doc.mime_type ?? "").startsWith("video/")) return false;
  return (doc.file_size ?? 0) > 0 && (doc.file_size ?? 0) <= AUTO_MAX_OCTETS;
}

function buildLocalUri(doc: { id: string; original_filename: string }): string {
  const ext = doc.original_filename.split(".").pop()?.toLowerCase() ?? "bin";
  return `${FileSystem.documentDirectory}ressource_${doc.id}.${ext}`;
}

export async function syncRessourcesOffline(): Promise<void> {
  try {
    // 1. Liste serveur (métadonnées uniquement — léger)
    const { data: docs } = await ressourcesApi.list();
    if (!Array.isArray(docs) || docs.length === 0) return;

    // Mettre à jour le cache de la liste (utilisé par l'écran Ressources hors-ligne)
    AsyncStorage.setItem(RESSOURCES_DOCS_CACHE_KEY, JSON.stringify(docs)).catch(() => {});

    // 2. Téléchargements persistés
    const raw = await AsyncStorage.getItem(RESSOURCES_DOWNLOADS_KEY);
    const saved: Record<string, string> = raw ? JSON.parse(raw) : {};

    // 3. Vérifier l'existence réelle des fichiers (évite les entrées fantômes
    //    laissées par un désinstall partiel ou un nettoyage OS)
    const verified: Record<string, string> = {};
    await Promise.all(
      Object.entries(saved).map(async ([id, uri]) => {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) verified[id] = uri;
      })
    );

    const serverIds = new Set<string>(docs.map((d: any) => d.id));
    const updated: Record<string, string> = { ...verified };
    let changed = false;

    // 4. Télécharger les nouveaux docs (pas encore en local) — Wi-Fi seulement
    const token = await getSecure("access_token");
    if (!token) return;
    let wifi = false;
    try { wifi = (await Network.getNetworkStateAsync()).type === Network.NetworkStateType.WIFI; } catch {}

    for (const doc of docs) {
      if (updated[doc.id]) continue; // déjà présent → skip
      if (!wifi || !telechargeableAuto(doc)) continue; // à la demande (RET11)

      const uri = buildLocalUri(doc);
      try {
        const res = await FileSystem.downloadAsync(
          ressourcesApi.downloadUrl(doc.id),
          uri,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.status === 200) {
          updated[doc.id] = uri;
          changed = true;
          console.log(`[Ressources] ✅ Auto-téléchargé : ${doc.title}`);
        } else {
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          console.warn(`[Ressources] ❌ Échec HTTP ${res.status} : ${doc.title}`);
        }
      } catch (e) {
        // Erreur réseau sur ce fichier → on passe au suivant, on ne bloque pas tout
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        console.warn(`[Ressources] ❌ Erreur réseau : ${doc.title}`, e);
      }
    }

    // 5. Nettoyer les fichiers locaux dont le doc a été supprimé côté serveur
    for (const [id, uri] of Object.entries(updated)) {
      if (!serverIds.has(id)) {
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        delete updated[id];
        changed = true;
        console.log(`[Ressources] 🗑 Supprimé du disque (retiré par l'admin) : ${id}`);
      }
    }

    // 6. Persister si l'état local a changé
    if (changed || Object.keys(verified).length !== Object.keys(saved).length) {
      await AsyncStorage.setItem(RESSOURCES_DOWNLOADS_KEY, JSON.stringify(updated));
    }
  } catch (e) {
    // Erreur réseau globale ou auth → ne pas bloquer le reste de la sync
    console.warn("[Ressources] syncRessourcesOffline échoué :", e);
  }
}
