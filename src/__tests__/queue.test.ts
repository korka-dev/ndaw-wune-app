/**
 * Tests d'intégration — Service de queue offline (flushQueue)
 *
 * Ces tests couvrent les scénarios critiques :
 *   1. Flush réussi d'une action FINISH_SEANCE classique
 *   2. Réconciliation d'une séance démarrée hors ligne (ID local → UUID serveur)
 *   3. Arrêt du flush sur erreur réseau (les actions restent en queue)
 *   4. Archivage d'une action après MAX_ATTEMPTS tentatives métier
 *   5. Flush d'un SUBMIT_RAPPORT avec ID de séance offline résolu
 *   6. Flush d'un SUBMIT_RAPPORT_JOURNALIER
 *
 * Stratégie :
 *   - expo-sqlite → mock en mémoire (src/__mocks__/expo-sqlite.ts)
 *   - expo-secure-store → mock en mémoire
 *   - Appels API (seancesApi, rapportsApi, etc.) → jest.mock
 */

import { initDB, enqueueAction, getPendingActions, getFailedActions, markActionFailed } from "../services/db";
import { flushQueue, MAX_ATTEMPTS } from "../services/queue";

// ── Mocks des APIs ────────────────────────────────────────────────────────────

jest.mock("../services/api", () => ({
  seancesApi: {
    start:  jest.fn(),
    finish: jest.fn(),
  },
  rapportsApi: {
    submit: jest.fn(),
  },
  rapportJournalierApi: {
    submit: jest.fn(),
  },
}));

// Note : async-storage est déjà redirigé vers le mock manuel via moduleNameMapper.
// On ne l'enregistre pas avec jest.mock() ici pour éviter un registre de mocks
// séparé qui casserait le reset (instance différente de celle de queue.ts).
jest.mock("expo-secure-store");

import { seancesApi, rapportsApi, rapportJournalierApi } from "../services/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SERVER_UUID = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";
const OFFLINE_ID  = "offline-seance-1700000000000";

function resetMocks() {
  jest.clearAllMocks();
  (seancesApi.start  as jest.Mock).mockResolvedValue({ data: { id: SERVER_UUID } });
  (seancesApi.finish as jest.Mock).mockResolvedValue({ data: {} });
  (rapportsApi.submit as jest.Mock).mockResolvedValue({ data: {} });
  (rapportJournalierApi.submit as jest.Mock).mockResolvedValue({ data: {} });
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  // Réinitialiser TOUT l'état entre les tests.
  // On passe par require() pour utiliser exactement la même résolution
  // (moduleNameMapper) que le code de production dans db.ts / queue.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("expo-sqlite") as { __resetDB: () => void }).__resetDB();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@react-native-async-storage/async-storage") as { __resetStore: () => void }).__resetStore();
  initDB();
  resetMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("flushQueue — cas nominaux", () => {
  test("FINISH_SEANCE avec un ID serveur réel : appelle finish directement", async () => {
    enqueueAction("FINISH_SEANCE", {
      seance_id:     SERVER_UUID,
      finished_at:   "2026-05-23T10:00:00Z",
      duree_minutes: 45,
    });

    const count = await flushQueue();

    expect(count).toBe(1);
    expect(seancesApi.start).not.toHaveBeenCalled();
    expect(seancesApi.finish).toHaveBeenCalledWith(SERVER_UUID, expect.objectContaining({
      finished_at:   "2026-05-23T10:00:00Z",
      duree_minutes: 45,
    }));
    expect(getPendingActions()).toHaveLength(0);
  });

  test("SUBMIT_RAPPORT avec ID serveur : appelle submit directement", async () => {
    enqueueAction("SUBMIT_RAPPORT", {
      seance_id: SERVER_UUID,
      contenu:   "Leçon bien déroulée.",
    });

    const count = await flushQueue();

    expect(count).toBe(1);
    expect(rapportsApi.submit).toHaveBeenCalledWith(expect.objectContaining({
      seance_id: SERVER_UUID,
      contenu:   "Leçon bien déroulée.",
    }));
    expect(getPendingActions()).toHaveLength(0);
  });

  test("SUBMIT_RAPPORT_JOURNALIER : appelle rapportJournalierApi.submit", async () => {
    enqueueAction("SUBMIT_RAPPORT_JOURNALIER", {
      date_rapport:  "2026-05-23",
      superviseur:   "Alpha Diallo",
      difficultes:   "[]",
      directeur_venu: false,
    });

    const count = await flushQueue();

    expect(count).toBe(1);
    expect(rapportJournalierApi.submit).toHaveBeenCalledWith(expect.objectContaining({
      date_rapport: "2026-05-23",
      superviseur:  "Alpha Diallo",
    }));
  });

  test("plusieurs actions en queue : toutes synchronisées dans l'ordre", async () => {
    enqueueAction("FINISH_SEANCE",           { seance_id: SERVER_UUID, finished_at: "2026-05-23T09:00:00Z", duree_minutes: 30 });
    enqueueAction("SUBMIT_RAPPORT_JOURNALIER", { date_rapport: "2026-05-23", superviseur: "Test", difficultes: "[]", directeur_venu: false });

    const count = await flushQueue();

    expect(count).toBe(2);
    expect(getPendingActions()).toHaveLength(0);
  });
});

describe("flushQueue — réconciliation ID offline → UUID serveur", () => {
  test("FINISH_SEANCE avec ID offline : crée la séance puis la termine", async () => {
    enqueueAction("FINISH_SEANCE", {
      seance_id:     OFFLINE_ID,
      finished_at:   "2026-05-23T11:00:00Z",
      duree_minutes: 60,
      start_payload: {
        classe:       "CE2",
        session_id:   "sess-001",
        date_seance:  "2026-05-23",
        started_at:   "2026-05-23T10:00:00Z",
      },
    });

    const count = await flushQueue();

    expect(count).toBe(1);
    // 1. start() doit avoir été appelé avec le payload d'origine
    expect(seancesApi.start).toHaveBeenCalledWith(expect.objectContaining({
      classe:      "CE2",
      session_id:  "sess-001",
    }));
    // 2. finish() doit utiliser le vrai UUID retourné par le serveur
    expect(seancesApi.finish).toHaveBeenCalledWith(SERVER_UUID, expect.objectContaining({
      duree_minutes: 60,
    }));
    expect(getPendingActions()).toHaveLength(0);
  });

  test("SUBMIT_RAPPORT avec ID offline résolu : utilise l'UUID mappé", async () => {
    // 1. D'abord enqueuer et flusher la séance pour créer le mapping
    enqueueAction("FINISH_SEANCE", {
      seance_id:     OFFLINE_ID,
      finished_at:   "2026-05-23T11:00:00Z",
      duree_minutes: 60,
      start_payload: { classe: "CE2", session_id: "sess-001", date_seance: "2026-05-23", started_at: "2026-05-23T10:00:00Z" },
    });
    await flushQueue();

    resetMocks();
    // Remettre le mock start pour qu'il ne soit pas rappelé
    (seancesApi.start as jest.Mock).mockResolvedValue({ data: { id: SERVER_UUID } });

    // 2. Maintenant enqueuer le rapport avec l'ID offline
    enqueueAction("SUBMIT_RAPPORT", {
      seance_id: OFFLINE_ID,
      contenu:   "Cours terminé avec succès.",
    });
    await flushQueue();

    // Le rapport doit être soumis avec l'UUID serveur (mapping résolu)
    expect(rapportsApi.submit).toHaveBeenCalledWith(expect.objectContaining({
      seance_id: SERVER_UUID,
    }));
  });

  test("FINISH_SEANCE offline sans start_payload : erreur métier, attempts incrémenté", async () => {
    enqueueAction("FINISH_SEANCE", {
      seance_id:     OFFLINE_ID,
      finished_at:   "2026-05-23T11:00:00Z",
      duree_minutes: 60,
      // start_payload manquant intentionnellement
    });

    const count = await flushQueue();

    // Traitée comme erreur métier : le flush continue (count=0 car rien d'autre),
    // l'action reste en queue avec attempts=1
    expect(count).toBe(0);
    expect(getPendingActions()).toHaveLength(1);
    expect(getPendingActions()[0].attempts).toBe(1);
  });
});

describe("flushQueue — gestion des erreurs", () => {
  test("erreur réseau : arrêt immédiat, les actions restent en queue", async () => {
    // Simuler une erreur réseau (pas de response)
    (seancesApi.finish as jest.Mock).mockRejectedValue(new Error("Network Error"));

    enqueueAction("FINISH_SEANCE", { seance_id: SERVER_UUID, finished_at: "2026-05-23T10:00:00Z", duree_minutes: 30 });
    enqueueAction("FINISH_SEANCE", { seance_id: SERVER_UUID, finished_at: "2026-05-23T10:30:00Z", duree_minutes: 30 });

    const count = await flushQueue();

    expect(count).toBe(0);
    // Les deux actions restent en queue (le flush s'est arrêté à la première erreur réseau)
    expect(getPendingActions()).toHaveLength(2);
    // Aucune tentative incrémentée (erreur réseau = pas une faute de l'action)
    expect(getPendingActions()[0].attempts).toBe(0);
  });

  test("erreur métier (4xx) : action marquée failed, flush continue", async () => {
    // Première action : erreur 409 serveur (conflit)
    (seancesApi.finish as jest.Mock)
      .mockRejectedValueOnce({ response: { status: 409, data: { detail: "Séance déjà terminée." } } })
      .mockResolvedValue({ data: {} });

    enqueueAction("FINISH_SEANCE", { seance_id: SERVER_UUID, finished_at: "2026-05-23T10:00:00Z", duree_minutes: 30 });
    enqueueAction("FINISH_SEANCE", { seance_id: SERVER_UUID, finished_at: "2026-05-23T11:00:00Z", duree_minutes: 45 });

    const count = await flushQueue();

    // Seule la 2ème action a réussi
    expect(count).toBe(1);
    // La 1ère reste en queue avec attempts=1
    const pending = getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts).toBe(1);
    expect(pending[0].last_error).toBe("Séance déjà terminée.");
  });

  test(`après ${MAX_ATTEMPTS} tentatives : archivage et suppression de la queue`, async () => {
    // Simuler une action déjà à MAX_ATTEMPTS tentatives (import statique en tête de fichier)
    const id = enqueueAction("FINISH_SEANCE", {
      seance_id: SERVER_UUID, finished_at: "2026-05-23T10:00:00Z", duree_minutes: 30,
    });

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      markActionFailed(id, "Erreur serveur persistante", new Date(Date.now() - 1000).toISOString());
    }

    // L'action a maintenant MAX_ATTEMPTS tentatives → elle doit être archivée
    const count = await flushQueue();

    expect(count).toBe(0);
    // Supprimée de la queue active
    expect(getPendingActions()).toHaveLength(0);
    // Archivée dans failed_queue
    const failed = getFailedActions();
    expect(failed).toHaveLength(1);
    expect(failed[0].action).toBe("FINISH_SEANCE");
    expect(failed[0].last_error).toBe("Erreur serveur persistante");
    // L'API n'a pas été appelée (action retirée avant l'appel)
    expect(seancesApi.finish).not.toHaveBeenCalled();
  });

  test("backoff exponentiel : une action en échec programme next_retry_at dans le futur", async () => {
    (seancesApi.finish as jest.Mock)
      .mockRejectedValue({ response: { status: 409, data: { detail: "Conflit" } } });

    enqueueAction("FINISH_SEANCE", { seance_id: SERVER_UUID, finished_at: "2026-05-23T10:00:00Z", duree_minutes: 30 });

    const before = Date.now();
    await flushQueue();

    const pending = getPendingActions();
    expect(pending[0].attempts).toBe(1);
    expect(pending[0].next_retry_at).not.toBeNull();
    // La prochaine tentative est programmée dans le futur (backoff > 0)
    expect(new Date(pending[0].next_retry_at as string).getTime()).toBeGreaterThan(before);
  });

  test("backoff exponentiel : une action pas encore due n'est pas rejouée", async () => {
    (seancesApi.finish as jest.Mock).mockResolvedValue({ data: {} });

    const id = enqueueAction("FINISH_SEANCE", { seance_id: SERVER_UUID, finished_at: "2026-05-23T10:00:00Z", duree_minutes: 30 });
    // Simuler un échec récent avec un prochain essai programmé dans 10 minutes
    markActionFailed(id, "Erreur serveur", new Date(Date.now() + 10 * 60_000).toISOString());

    const count = await flushQueue();

    // L'action est ignorée tant que son créneau de backoff n'est pas atteint
    expect(count).toBe(0);
    expect(seancesApi.finish).not.toHaveBeenCalled();
    expect(getPendingActions()).toHaveLength(1);
    expect(getPendingActions()[0].attempts).toBe(1);
  });

  test("backoff exponentiel : une action dont le créneau est passé est rejouée", async () => {
    (seancesApi.finish as jest.Mock).mockResolvedValue({ data: {} });

    const id = enqueueAction("FINISH_SEANCE", { seance_id: SERVER_UUID, finished_at: "2026-05-23T10:00:00Z", duree_minutes: 30 });
    // Le créneau de backoff est déjà passé
    markActionFailed(id, "Erreur serveur", new Date(Date.now() - 1000).toISOString());

    const count = await flushQueue();

    expect(count).toBe(1);
    expect(seancesApi.finish).toHaveBeenCalled();
    expect(getPendingActions()).toHaveLength(0);
  });

  test("queue vide : retourne 0 sans appels API", async () => {
    const count = await flushQueue();
    expect(count).toBe(0);
    expect(seancesApi.finish).not.toHaveBeenCalled();
  });
});
