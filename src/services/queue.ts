/**
 * Service de synchronisation de la file d'attente hors-ligne.
 *
 * Fonctionnement :
 *   1. Quand l'app retrouve une connexion, NetworkWatcher appelle flushQueue().
 *   2. flushQueue() lit toutes les actions en attente dans SQLite.
 *   3. Chaque action est rejouée vers le backend.
 *   4. En cas de succès → supprimée de la file.
 *   5. En cas d'erreur réseau → conservée pour la prochaine tentative.
 *   6. En cas d'erreur métier (4xx) → marquée "échouée" (attempts++) mais conservée
 *      pour investigation (ne bloque pas les autres actions).
 */
import { seancesApi, rapportsApi, rapportJournalierApi } from "./api";
import {
  getPendingActions,
  deleteAction,
  markActionFailed,
  markRapportSynced,
  markRapportJournalierSynced,
  QueueItem,
} from "./db";

export const MAX_ATTEMPTS = 5; // au-delà, on abandonne silencieusement

/**
 * Rejoue toutes les actions en attente.
 * À appeler dès que la connexion est rétablie.
 *
 * @returns nombre d'actions synchronisées avec succès
 */
export async function flushQueue(): Promise<number> {
  const pending = getPendingActions();
  if (pending.length === 0) return 0;

  console.log(`[Queue] Flush — ${pending.length} action(s) en attente`);
  let synced = 0;

  for (const item of pending) {
    // Ignorer les actions qui ont trop échoué
    if (item.attempts >= MAX_ATTEMPTS) {
      console.warn(`[Queue] Action ${item.id} (${item.action}) abandonnée après ${item.attempts} tentatives`);
      continue;
    }

    try {
      await processAction(item);
      deleteAction(item.id);
      synced++;
      console.log(`[Queue] ✅ ${item.action} (id ${item.id}) synchronisé`);
    } catch (err: any) {
      const isNetworkError = !err?.response; // pas de réponse = erreur réseau
      const errMsg = err?.response?.data?.detail ?? err?.message ?? "Erreur inconnue";

      if (isNetworkError) {
        // Erreur réseau → on arrête tout (inutile de continuer)
        console.warn(`[Queue] Erreur réseau — arrêt du flush`);
        break;
      } else {
        // Erreur métier (4xx) → on marque et on continue avec le suivant
        markActionFailed(item.id, errMsg);
        console.warn(`[Queue] ❌ ${item.action} (id ${item.id}) échoué : ${errMsg}`);
      }
    }
  }

  console.log(`[Queue] Flush terminé — ${synced} synchronisé(s)`);
  return synced;
}

// ── Traitement par type d'action ──────────────────────────────────────────────

async function processAction(item: QueueItem): Promise<void> {
  const payload = JSON.parse(item.payload);

  switch (item.action) {
    case "FINISH_SEANCE": {
      const { seance_id, ...body } = payload;
      await seancesApi.finish(seance_id, body);
      break;
    }

    case "SUBMIT_RAPPORT": {
      const { local_rapport_id, ...body } = payload;
      await rapportsApi.submit(body);
      if (local_rapport_id) {
        markRapportSynced(local_rapport_id);
      }
      break;
    }

    case "SUBMIT_RAPPORT_JOURNALIER": {
      const { local_id, ...body } = payload;
      await rapportJournalierApi.submit(body);
      if (local_id) {
        markRapportJournalierSynced(local_id);
      }
      break;
    }

    default:
      console.warn(`[Queue] Action inconnue : ${(item as any).action}`);
  }
}
