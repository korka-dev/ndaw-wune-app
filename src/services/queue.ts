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
import { seancesApi, rapportsApi, rapportJournalierApi, superviseurApi } from "./api";
import {
  getPendingActions,
  deleteAction,
  markActionFailed,
  resetFailedActions as resetFailedActionsDB,
  markRapportSynced,
  markRapportJournalierSynced,
  markSupervisorPresenceSynced,
  archiveFailedAction,
  QueueItem,
} from "./db";

export const MAX_ATTEMPTS = 5;

export function resetFailedActions(): void {
  resetFailedActionsDB(MAX_ATTEMPTS);
}

// ── Backoff exponentiel avec jitter ───────────────────────────────────────────
//
// Évite l'effet "thundering herd" : si plusieurs appareils retrouvent la
// connexion en même temps, ils ne doivent pas tous rejouer leurs actions
// échouées au même instant ni au même rythme. Le délai croît avec le nombre
// de tentatives (5s, 10s, 20s, 40s, …, plafonné à 5 min) et reçoit un jitter
// aléatoire de ±30 % pour désynchroniser les appareils entre eux.

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS  = 5 * 60_000;
const JITTER_RATIO  = 0.3;

function computeNextRetryAt(attempts: number): string {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
  const jitter = exponential * JITTER_RATIO * (Math.random() * 2 - 1);
  const delayMs = Math.max(0, Math.round(exponential + jitter));
  return new Date(Date.now() + delayMs).toISOString();
}

function isDueForRetry(item: QueueItem): boolean {
  if (!item.next_retry_at) return true;
  return new Date(item.next_retry_at).getTime() <= Date.now();
}

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

    // Backoff exponentiel : une action déjà en échec attend son créneau avant
    // d'être rejouée, pour ne pas marteler le serveur à chaque flush (30 s).
    if (item.attempts > 0 && !isDueForRetry(item)) {
      console.log(`[Queue] Action ${item.id} (${item.action}) en attente de backoff — prochaine tentative à ${item.next_retry_at}`);
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
      // Différé sans pénalité : SUBMIT_RAPPORT attend que FINISH_SEANCE réconcilie
      // l'ID offline. On saute sans incrémenter attempts pour ne pas archiver le rapport.
      if ((err as any).__deferNoPenalty) {
        console.log(`[Queue] ⏳ ${item.action} (id ${item.id}) différé — prochaine tentative au prochain flush`);
        continue;
      }

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
        const nextRetryAt = computeNextRetryAt(item.attempts + 1);
        markActionFailed(item.id, errMsg, nextRetryAt);
        console.warn(`[Queue] ❌ ${item.action} (id ${item.id}) [HTTP ${httpStatus}] échoué : ${errMsg} — prochaine tentative à ${nextRetryAt}`);
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
          // La réconciliation FINISH_SEANCE n'a pas encore eu lieu.
          // On lève AVEC .response → erreur métier → le flush CONTINUE et attempts s'incrémente.
          // Après MAX_ATTEMPTS, l'action sera archivée (orpheline irrécupérable).
          console.warn(`[Queue] SUBMIT_RAPPORT (id ${item.id}) — séance offline non encore réconciliée, report au prochain cycle`);
          const deferErr = new Error(`Séance offline ${seance_id} pas encore réconciliée — attente de FINISH_SEANCE`);
          Object.assign(deferErr, { __deferNoPenalty: true });
          throw deferErr;
        }
        resolvedSeanceId = idMap[seance_id];
      }

      await rapportsApi.submit({ ...body, seance_id: resolvedSeanceId });
      if (local_rapport_id) markRapportSynced(local_rapport_id);
      break;
    }

    case "SUBMIT_RAPPORT_JOURNALIER": {
      const { local_id, ...body } = payload;
      const res = await rapportJournalierApi.submit(body);
      if (local_id) markRapportJournalierSynced(local_id, res?.data?.id);
      break;
    }

    case "REPORT_MISSED_SEANCE": {
      // Idempotent côté serveur — on envoie simplement le payload
      await seancesApi.reportMissed(payload);
      break;
    }

    case "SUBMIT_EVALUATIONS": {
      // Idempotent côté serveur (upsert par eleve/competence/date) — re-soumission sans risque
      const { evaluations } = payload as {
        evaluations: {
          eleve_id: string; competence: string; resultat: string;
          date_eval: string; commentaire?: string;
        }[];
      };
      await superviseurApi.submitEvaluations(evaluations);
      break;
    }

    case "SUBMIT_PRESENCE_CHECK": {
      // Idempotent côté serveur (upsert) — le serveur accepte les re-soumissions
      const { date_jour, entries } = payload as {
        date_jour: string;
        entries: { teacher_id: string; present: boolean; motif: string | null }[];
      };
      await superviseurApi.submitPresenceCheck(date_jour, entries);
      markSupervisorPresenceSynced(date_jour);
      break;
    }

    default:
      console.warn(`[Queue] Action inconnue : ${(item as any).action}`);
  }
}
