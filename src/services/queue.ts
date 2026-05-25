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
  archiveFailedAction,
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
      console.warn(`[Queue] Action ${item.id} (${item.action}) archivée après ${item.attempts} tentatives`);
      // Archiver avant de supprimer — visible dans l'écran Profil sous "Erreurs de sync"
      archiveFailedAction({
        action:     item.action,
        payload:    item.payload,
        attempts:   item.attempts,
        last_error: item.last_error,
      });
      deleteAction(item.id);
      continue;
    }

    // Détection des SUBMIT_RAPPORT orphelins :
    // Si la séance est offline et qu'aucun FINISH_SEANCE n'est encore en attente
    // pour elle (son compagnon a été archivé), on archive aussi le rapport.
    if (item.action === "SUBMIT_RAPPORT") {
      const rPayload = JSON.parse(item.payload);
      if (rPayload.seance_id?.startsWith("offline-")) {
        const idMap = await getOfflineIdMap();
        if (!idMap[rPayload.seance_id]) {
          const hasPendingFinish = pending.some(
            p =>
              p.action === "FINISH_SEANCE" &&
              JSON.parse(p.payload).seance_id === rPayload.seance_id,
          );
          if (!hasPendingFinish) {
            console.warn(
              `[Queue] SUBMIT_RAPPORT (id ${item.id}) orphelin — FINISH_SEANCE archivé sans réconciliation, archivage du rapport`,
            );
            archiveFailedAction({
              action:     item.action,
              payload:    item.payload,
              attempts:   item.attempts,
              last_error: "FINISH_SEANCE associé archivé sans réconciliation",
            });
            deleteAction(item.id);
            continue;
          }
        }
      }
    }

    try {
      await processAction(item);
      deleteAction(item.id);
      synced++;
      console.log(`[Queue] ✅ ${item.action} (id ${item.id}) synchronisé`);
    } catch (err: any) {
      const isNetworkError = !err?.response;

      // FastAPI 422 renvoie detail comme un array d'objets — on les sérialise proprement
      const rawDetail = err?.response?.data?.detail;
      const errMsg: string = Array.isArray(rawDetail)
        ? rawDetail.map((e: any) => (typeof e === "object" ? (e?.msg ?? JSON.stringify(e)) : String(e))).join("; ")
        : typeof rawDetail === "string"
          ? rawDetail
          : (err?.message ?? "Erreur inconnue");

      const httpStatus = err?.response?.status ?? "réseau";

      if (isNetworkError) {
        console.warn(`[Queue] Erreur réseau — arrêt du flush`);
        break;
      } else {
        markActionFailed(item.id, errMsg);
        console.warn(`[Queue] ❌ ${item.action} (id ${item.id}) [HTTP ${httpStatus}] échoué : ${errMsg}`);
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
            // Erreur de données (non récupérable par retry réseau).
            // On la lève avec une propriété `.response` pour qu'elle soit traitée
            // comme une erreur métier dans flushQueue (incrémente attempts, ne stoppe pas le flush).
            const detail = `Séance offline ${seance_id} : payload de démarrage manquant — impossible de réconcilier.`;
            const err = new Error(detail);
            Object.assign(err, { response: { data: { detail } } });
            throw err;
          }

          let resolvedServerId: string;
          try {
            console.log(`[Queue] start_payload envoyé →`, JSON.stringify(payload.start_payload));
            const { data: started } = await seancesApi.start(payload.start_payload);
            resolvedServerId = started.id;
          } catch (startErr: any) {
            if (startErr?.response?.status === 409) {
              // Une séance est déjà active sur le serveur → on récupère son ID
              // pour continuer la réconciliation (finish + rapport).
              console.warn(`[Queue] start 409 — récupération de la séance active existante`);
              const { data: active } = await seancesApi.active();
              if (!active?.id) throw startErr; // pas de séance active trouvée, on remonte l'erreur
              resolvedServerId = active.id;
            } else {
              throw startErr;
            }
          }

          await setOfflineIdMapping(seance_id, resolvedServerId);
          idMap[seance_id] = resolvedServerId;
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
        if (!idMap[seance_id]) {
          // La réconciliation FINISH_SEANCE n'a pas encore eu lieu (pas d'entrée idMap).
          // On lève sans .response → traité comme erreur réseau → arrêt du flush
          // sans incrémenter attempts. Sera retryé au prochain cycle.
          console.warn(`[Queue] SUBMIT_RAPPORT (id ${item.id}) — séance offline non encore réconciliée, report au prochain cycle`);
          throw new Error(`Séance offline ${seance_id} pas encore réconciliée — attente de FINISH_SEANCE`);
        }
        resolvedSeanceId = idMap[seance_id];
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
