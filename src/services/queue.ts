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
import { isPasswordChangeRequiredError, isUpdateRequiredError } from "./appVersion";
import { referenceRequete } from "./support";
import { seancesApi, rapportsApi, rapportJournalierApi, superviseurApi } from "./api";
import {
  getPendingActions,
  getLocalOwner,
  deleteAction,
  markActionFailed,
  markActionDeferred,
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

// ── Classement des erreurs (APP-16) ───────────────────────────────────────────
//
//   network   : pas de réponse → arrêt du flush, rien n'est compté
//   temporary : 408 / 429 / 5xx → nouvelle tentative plus tard, SANS compter
//               d'échec (une panne serveur n'archive jamais une saisie)
//   conflict  : 409 explicite (même clé, autre contenu ; séance déjà clôturée
//               avec d'autres valeurs) → archivée tout de suite, visible et
//               rejouable depuis le centre de synchronisation
//   refused   : autre 4xx (données refusées) → tentatives comptées puis archive

export type ErrorKind = "network" | "temporary" | "conflict" | "refused";

const CONFLICT_CODES = new Set(["IDEMPOTENCY_CONFLICT", "SEANCE_DEJA_CLOTUREE"]);

export function classifyError(err: unknown): ErrorKind {
  const r = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  if (!r) return "network";
  const st = r.status ?? 0;
  if (st === 408 || st === 429 || st >= 500) return "temporary";
  const detail = r.data?.detail as { code?: string } | undefined;
  if (st === 409 && detail && typeof detail === "object" && CONFLICT_CODES.has(detail.code ?? "")) {
    return "conflict";
  }
  return "refused";
}

export function errorMessage(err: unknown): string {
  // APP-45 : une panne serveur affiche la référence à transmettre au support.
  const st = (err as { response?: { status?: number } })?.response?.status ?? 0;
  const ref = st >= 500 ? referenceRequete(err) : undefined;
  const msg = messageBrut(err);
  return ref ? `${msg} (réf. ${ref})` : msg;
}

function messageBrut(err: unknown): string {
  const rawDetail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (Array.isArray(rawDetail)) {
    return rawDetail.map((e: any) => (typeof e === "object" ? (e?.msg ?? JSON.stringify(e)) : String(e))).join("; ");
  }
  if (typeof rawDetail === "string") return rawDetail;
  if (rawDetail && typeof rawDetail === "object" && "message" in rawDetail) {
    const d = rawDetail as { message: unknown; erreurs?: { index?: number; erreur?: string }[] };
    // Lot d'évaluations refusé (APP-29 : LOT_INVALIDE / HORS_PERIMETRE) : on
    // cite les premières lignes en cause pour que l'agent sache quoi corriger.
    const lignes = Array.isArray(d.erreurs)
      ? d.erreurs.slice(0, 3).map((e) => `n°${(e.index ?? 0) + 1} : ${e.erreur ?? "refusée"}`)
      : [];
    const reste = Array.isArray(d.erreurs) && d.erreurs.length > 3 ? ` (+${d.erreurs.length - 3})` : "";
    return String(d.message) + (lignes.length ? ` — ${lignes.join(" ; ")}${reste}` : "");
  }
  return (err as { message?: string })?.message ?? "Erreur inconnue";
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

/**
 * Un seul envoi à la fois : retour réseau, retour au premier plan et bouton de
 * synchronisation manuelle peuvent tous déclencher flushQueue() en même temps.
 * Les appels simultanés partagent la même exécution — aucune action n'est
 * envoyée deux fois en parallèle.
 */
let _flushInFlight: Promise<number> | null = null;

export function flushQueue(): Promise<number> {
  if (_flushInFlight) return _flushInFlight;
  _flushInFlight = _flushQueueInner().finally(() => { _flushInFlight = null; });
  return _flushInFlight;
}

async function _flushQueueInner(): Promise<number> {
  const pending = getPendingActions();
  if (pending.length === 0) return 0;

  console.log(`[Queue] Flush — ${pending.length} action(s) en attente`);
  let synced = 0;
  const owner = getLocalOwner();

  for (const item of pending) {
    // APP-17/20 : si le compte change pendant l'envoi (déconnexion, autre
    // utilisateur), on s'arrête — aucune action n'est envoyée sous une autre identité.
    if (!owner || getLocalOwner() !== owner || (item.owner_id && item.owner_id !== owner)) {
      console.warn("[Queue] Changement de compte pendant l'envoi — arrêt du flush");
      break;
    }

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
    if (!isDueForRetry(item)) {
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

      // APP-46 / APP-08 : version trop ancienne ou mot de passe temporaire à
      // changer. Ce n'est pas une erreur de la saisie : on arrête le flush SANS
      // pénalité ni archivage. Tout repartira après la mise à jour / l'activation.
      if (isUpdateRequiredError(err) || isPasswordChangeRequiredError(err)) {
        console.warn(`[Queue] Envoi suspendu (${err?.response?.data?.detail}) — file conservée`);
        break;
      }

      const errMsg = errorMessage(err);
      const httpStatus = err?.response?.status ?? "réseau";

      switch (classifyError(err)) {
        case "network":
          console.warn(`[Queue] Erreur réseau — arrêt du flush`);
          return synced;
        case "temporary":
          markActionDeferred(item.id, `Serveur indisponible (HTTP ${httpStatus}) — nouvel essai automatique`, computeNextRetryAt(item.attempts + 1));
          console.warn(`[Queue] ⏸ ${item.action} (id ${item.id}) [HTTP ${httpStatus}] incident temporaire — arrêt du flush`);
          return synced;
        case "conflict":
          archiveFailedAction({
            action:     item.action,
            payload:    item.payload,
            attempts:   item.attempts + 1,
            last_error: `Conflit : ${errMsg}`,
          });
          deleteAction(item.id);
          console.warn(`[Queue] ⚠ ${item.action} (id ${item.id}) conflit — archivé pour arbitrage : ${errMsg}`);
          break;
        default: {
          const nextRetryAt = computeNextRetryAt(item.attempts + 1);
          markActionFailed(item.id, errMsg, nextRetryAt);
          console.warn(`[Queue] ❌ ${item.action} (id ${item.id}) [HTTP ${httpStatus}] refusé : ${errMsg} — prochaine tentative à ${nextRetryAt}`);
        }
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

          // APP-16/18 : la séance hors ligne est envoyée en une fois, avec son
          // identifiant local stable. Le serveur la crée une seule fois (rejeu
          // sans doublon) et ne la confond JAMAIS avec une autre séance active.
          const { start_payload, ...finish } = body as Record<string, unknown> & { start_payload?: object };
          const { data: done } = await seancesApi.complete({
            ...payload.start_payload,
            ...finish,
            client_seance_id: seance_id,
          });
          const resolvedServerId: string = done.id;

          await setOfflineIdMapping(seance_id, resolvedServerId);
          return; // séance créée ET clôturée par /complete
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
      // Clé d'opération = identifiant local du rapport (APP-16), y compris pour
      // les actions mises en file par une version précédente de l'app.
      const res = await rapportJournalierApi.submit({ ...body, client_op_id: body.client_op_id ?? local_id ?? `queue-${item.id}-${item.created_at}` });
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
      const { date_jour, entries, semaine, jour_cours } = payload as {
        date_jour: string;
        semaine?: number | null;
        jour_cours?: number | null;
        entries: { teacher_id: string; present: boolean; motif: string | null }[];
      };
      await superviseurApi.submitPresenceCheck(date_jour, entries, { semaine, jour_cours });
      markSupervisorPresenceSynced(date_jour);
      break;
    }

    case "SUBMIT_REMARQUE": {
      const { remarquesApi } = await import("./api");
      await remarquesApi.submit(payload as { categorie: string; message: string; ecole?: string | null });
      break;
    }

    default:
      console.warn(`[Queue] Action inconnue : ${(item as any).action}`);
  }
}
