/**
 * Service de synchronisation de la file d'attente hors-ligne.
 *
 * Fonctionnement :
 *   1. Quand l'app retrouve une connexion, NetworkWatcher appelle flushQueue().
 *   2. flushQueue() lit toutes les actions en attente dans SQLite.
 *   3. Chaque action est rejouée vers le backend.
 *   4. En cas de succès → supprimée de la file.
 *   5. En cas d'erreur réseau → arrêt (inutile de continuer, on réessaiera plus tard).
 *   6. En cas d'erreur métier (4xx) → marquée "échouée" (attempts++) mais conservée.
 *
 * ── Réconciliation des séances offline ──────────────────────────────────────
 * Quand une séance démarre hors-ligne, elle reçoit un ID local (ex: "offline-seance-…").
 * Pour la synchroniser :
 *   1. On crée la séance sur le serveur → on récupère le vrai UUID.
 *   2. On termine la séance avec le vrai UUID.
 *   3. On soumet le rapport avec ce même UUID.
 *
 * Le mapping offline-id → server-uuid est persisté dans AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { seancesApi, rapportsApi, rapportJournalierApi } from "./api";
import {
  getPendingActions,
  deleteAction,
  markActionFailed,
  resetFailedActions,
  markRapportSynced,
  markRapportJournalierSynced,
  QueueItem,
} from "./db";

export { resetFailedActions };

export const MAX_ATTEMPTS = 5;

const OFFLINE_ID_MAP_KEY = "offline_seance_id_map";

async function getOfflineIdMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_ID_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setOfflineIdMapping(offlineId: string, serverId: string): Promise<void> {
  try {
    const map = await getOfflineIdMap();
    map[offlineId] = serverId;
    await AsyncStorage.setItem(OFFLINE_ID_MAP_KEY, JSON.stringify(map));
  } catch {}
}

export async function clearOfflineIdMap(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_ID_MAP_KEY);
}

export async function flushQueue(): Promise<number> {
  const pending = getPendingActions();
  if (pending.length === 0) return 0;

  console.log(`[Queue] Flush — ${pending.length} action(s) en attente`);
  let synced = 0;

  for (const item of pending) {
    if (item.attempts >= MAX_ATTEMPTS) {
      console.warn(`[Queue] Action ${item.id} (${item.action}) supprimée après ${item.attempts} tentatives`);
      deleteAction(item.id);  // nettoie la file — l'action ne peut plus être récupérée
      continue;
    }

    try {
      await processAction(item);
      deleteAction(item.id);
      synced++;
      console.log(`[Queue] ✅ ${item.action} (id ${item.id}) synchronisé`);
    } catch (err: any) {
      const isNetworkError = !err?.response;
      const errMsg = err?.response?.data?.detail ?? err?.message ?? "Erreur inconnue";

      if (isNetworkError) {
        console.warn(`[Queue] Erreur réseau — arrêt du flush`);
        break;
      } else {
        markActionFailed(item.id, errMsg);
        console.warn(`[Queue] ❌ ${item.action} (id ${item.id}) échoué : ${errMsg}`);
      }
    }
  }

  console.log(`[Queue] Flush terminé — ${synced} synchronisé(s)`);
  return synced;
}

async function processAction(item: QueueItem): Promise<void> {
  const payload = JSON.parse(item.payload);

  switch (item.action) {
    case "FINISH_SEANCE": {
      const { seance_id, ...body } = payload;

      if (seance_id?.startsWith("offline-")) {
        // Réconciliation : démarrer d'abord sur le serveur si nécessaire
        const idMap = await getOfflineIdMap();

        if (!idMap[seance_id]) {
          if (!payload.start_payload) {
            throw new Error(
              `Impossible de réconcilier la séance offline ${seance_id} : payload de démarrage manquant.`
            );
          }
          const { data: started } = await seancesApi.start(payload.start_payload);
          await setOfflineIdMapping(seance_id, started.id);
          idMap[seance_id] = started.id;
        }

        await seancesApi.finish(idMap[seance_id], body);
      } else {
        await seancesApi.finish(seance_id, body);
      }
      break;
    }

    case "SUBMIT_RAPPORT": {
      const { local_rapport_id, seance_id, ...body } = payload;

      let resolvedSeanceId = seance_id;
      if (seance_id?.startsWith("offline-")) {
        const idMap = await getOfflineIdMap();
        resolvedSeanceId = idMap[seance_id] ?? seance_id;
      }

      await rapportsApi.submit({ ...body, seance_id: resolvedSeanceId });
      if (local_rapport_id) markRapportSynced(local_rapport_id);
      break;
    }

    case "SUBMIT_RAPPORT_JOURNALIER": {
      const { local_id, ...body } = payload;
      await rapportJournalierApi.submit(body);
      if (local_id) markRapportJournalierSynced(local_id);
      break;
    }

    default:
      console.warn(`[Queue] Action inconnue : ${(item as any).action}`);
  }
}
