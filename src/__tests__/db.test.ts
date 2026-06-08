/**
 * Tests unitaires — Service db.ts (SQLite local)
 *
 * Vérifie les opérations CRUD sur les 4 tables :
 *   - offline_queue
 *   - rapports_cache
 *   - rapports_journalier
 *   - failed_queue
 */

import {
  initDB,
  enqueueAction,
  getPendingActions,
  deleteAction,
  markActionFailed,
  resetFailedActions,
  clearQueue,
  upsertRapportCache,
  markRapportSynced,
  getCachedRapports,
  clearRapportsCache,
  insertRapportJournalier,
  markRapportJournalierSynced,
  getRapportsJournalier,
  clearRapportsJournalier,
  archiveFailedAction,
  getFailedActions,
  clearFailedQueue,
  clearAllLocalData,
} from "../services/db";

// Note : expo-sqlite et async-storage sont déjà redirigés vers les mocks manuels
// via moduleNameMapper dans package.json — pas besoin d'appeler jest.mock().
// Appeler jest.mock() créerait un registre de mocks séparé et une instance
// différente de celle utilisée par le code de production, cassant le reset.
jest.mock("expo-secure-store");

beforeEach(() => {
  // Réinitialiser la DB et AsyncStorage avant chaque test.
  // On passe par require() pour utiliser exactement la même résolution
  // (moduleNameMapper) que le code de production dans db.ts / queue.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("expo-sqlite") as { __resetDB: () => void }).__resetDB();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@react-native-async-storage/async-storage") as { __resetStore: () => void }).__resetStore();
  initDB();
});

// ── offline_queue ─────────────────────────────────────────────────────────────

describe("offline_queue", () => {
  test("enqueueAction → crée une ligne avec attempts=0", () => {
    const id = enqueueAction("FINISH_SEANCE", { seance_id: "abc" });
    expect(id).toBeGreaterThan(0);
    const pending = getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0].action).toBe("FINISH_SEANCE");
    expect(pending[0].attempts).toBe(0);
    expect(pending[0].last_error).toBeNull();
  });

  test("deleteAction → supprime uniquement l'action ciblée", () => {
    const id1 = enqueueAction("FINISH_SEANCE", { seance_id: "aaa" });
    const id2 = enqueueAction("SUBMIT_RAPPORT", { seance_id: "bbb", contenu: "Test" });
    deleteAction(id1);
    const pending = getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(id2);
  });

  test("markActionFailed → incrémente attempts et enregistre l'erreur", () => {
    const id = enqueueAction("FINISH_SEANCE", { seance_id: "abc" });
    const future = new Date(Date.now() + 60_000).toISOString();
    markActionFailed(id, "Timeout réseau", future);
    markActionFailed(id, "Erreur serveur", future);
    const pending = getPendingActions();
    expect(pending[0].attempts).toBe(2);
    expect(pending[0].last_error).toBe("Erreur serveur");
    expect(pending[0].next_retry_at).toBe(future);
  });

  test("resetFailedActions → remet attempts à 0 et efface le backoff pour les actions bloquées", () => {
    const id = enqueueAction("FINISH_SEANCE", { seance_id: "abc" });
    const future = new Date(Date.now() + 60_000).toISOString();
    for (let i = 0; i < 5; i++) markActionFailed(id, "erreur", future);
    expect(getPendingActions()[0].attempts).toBe(5);
    resetFailedActions();
    expect(getPendingActions()[0].attempts).toBe(0);
    expect(getPendingActions()[0].next_retry_at).toBeNull();
  });

  test("clearQueue → vide entièrement la file", () => {
    enqueueAction("FINISH_SEANCE", { seance_id: "a" });
    enqueueAction("SUBMIT_RAPPORT", { seance_id: "b", contenu: "x" });
    clearQueue();
    expect(getPendingActions()).toHaveLength(0);
  });
});

// ── rapports_cache ─────────────────────────────────────────────────────────────

describe("rapports_cache", () => {
  test("upsertRapportCache → insère un rapport non synchronisé", () => {
    upsertRapportCache({
      id: "rp-1", seance_id: "s-1", classe: "CE2", matiere: "Maths",
      date_seance: "2026-05-23", contenu: "Fractions", points_positifs: null,
      difficultes: null, synced: 0,
    });
    const rapports = getCachedRapports();
    expect(rapports).toHaveLength(1);
    expect(rapports[0].id).toBe("rp-1");
    expect(rapports[0].synced).toBe(0);
  });

  test("markRapportSynced → passe synced à 1", () => {
    upsertRapportCache({
      id: "rp-2", seance_id: "s-2", classe: "CM1", matiere: null,
      date_seance: "2026-05-23", contenu: "Grammaire", points_positifs: null,
      difficultes: null, synced: 0,
    });
    markRapportSynced("rp-2");
    expect(getCachedRapports()[0].synced).toBe(1);
  });

  test("clearRapportsCache → vide la table", () => {
    upsertRapportCache({
      id: "rp-3", seance_id: "s-3", classe: "CP", matiere: null,
      date_seance: "2026-05-23", contenu: "Lecture", points_positifs: null,
      difficultes: null, synced: 0,
    });
    clearRapportsCache();
    expect(getCachedRapports()).toHaveLength(0);
  });
});

// ── rapports_journalier ───────────────────────────────────────────────────────

describe("rapports_journalier", () => {
  const baseRapport = {
    id: "rj-1", date_rapport: "2026-05-23", ief: "Dakar", commune: "Plateau",
    ecole: "École A", superviseur: "Alpha", nom_tuteur: "Binta",
    nb_absences: 2, absents: null, semaine: 3, jour_cours: 2,
    difficultes: "[]", autres_difficultes: null, description_difficultes: null,
    directeur_venu: 1, besoin_appui: 0, domaines_appui: null,
    has_observations: 0, commentaires: null, soumis_en_offline: 1,
    photo_classe: null,
  };

  test("insertRapportJournalier → insère avec synced=0", () => {
    insertRapportJournalier(baseRapport);
    const rapports = getRapportsJournalier();
    expect(rapports).toHaveLength(1);
    expect(rapports[0].id).toBe("rj-1");
    expect(rapports[0].synced).toBe(0);
  });

  test("markRapportJournalierSynced → passe synced à 1", () => {
    insertRapportJournalier(baseRapport);
    markRapportJournalierSynced("rj-1");
    expect(getRapportsJournalier()[0].synced).toBe(1);
  });

  test("clearRapportsJournalier → vide la table", () => {
    insertRapportJournalier(baseRapport);
    clearRapportsJournalier();
    expect(getRapportsJournalier()).toHaveLength(0);
  });
});

// ── failed_queue ──────────────────────────────────────────────────────────────

describe("failed_queue", () => {
  test("archiveFailedAction → ajoute une entrée dans failed_queue", () => {
    archiveFailedAction({
      action: "SUBMIT_RAPPORT", payload: '{"seance_id":"abc"}',
      attempts: 5, last_error: "403 Forbidden",
    });
    const failed = getFailedActions();
    expect(failed).toHaveLength(1);
    expect(failed[0].action).toBe("SUBMIT_RAPPORT");
    expect(failed[0].last_error).toBe("403 Forbidden");
  });

  test("clearFailedQueue → vide la table", () => {
    archiveFailedAction({
      action: "FINISH_SEANCE", payload: '{}', attempts: 5, last_error: "err",
    });
    clearFailedQueue();
    expect(getFailedActions()).toHaveLength(0);
  });
});

// ── Migrations versionnées (PRAGMA user_version) ─────────────────────────────

describe("migrations", () => {
  test("initDB() amène la base à la dernière version sans erreur", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqlite = require("expo-sqlite") as { openDatabaseSync: () => { getFirstSync: <T>(sql: string) => T | null } };
    const db = sqlite.openDatabaseSync();
    const row = db.getFirstSync<{ user_version: number }>("PRAGMA user_version");
    expect(row?.user_version).toBeGreaterThan(0);
  });

  test("initDB() est idempotent — un second appel ne change rien", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqlite = require("expo-sqlite") as { openDatabaseSync: () => { getFirstSync: <T>(sql: string) => T | null } };
    const db = sqlite.openDatabaseSync();
    const before = db.getFirstSync<{ user_version: number }>("PRAGMA user_version")?.user_version;

    initDB();

    const after = db.getFirstSync<{ user_version: number }>("PRAGMA user_version")?.user_version;
    expect(after).toBe(before);
  });
});

// ── clearAllLocalData ─────────────────────────────────────────────────────────

describe("clearAllLocalData", () => {
  test("efface toutes les tables en une seule fois", () => {
    enqueueAction("FINISH_SEANCE", { seance_id: "a" });
    upsertRapportCache({
      id: "r1", seance_id: "s1", classe: "CE1", matiere: null,
      date_seance: "2026-05-23", contenu: "x", points_positifs: null,
      difficultes: null, synced: 0,
    });
    archiveFailedAction({ action: "SUBMIT_RAPPORT", payload: "{}", attempts: 5, last_error: "e" });

    clearAllLocalData();

    expect(getPendingActions()).toHaveLength(0);
    expect(getCachedRapports()).toHaveLength(0);
    expect(getFailedActions()).toHaveLength(0);
  });
});
