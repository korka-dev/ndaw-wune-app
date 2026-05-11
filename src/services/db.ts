/**
 * Base de données SQLite locale — ARED NdawWune
 *
 * Tables :
 *   offline_queue   — file d'attente des actions à synchroniser
 *   rapports_cache  — rapports soumis (consultables hors-ligne)
 *
 * Utilisé via expo-sqlite ~15 (API synchrone openDatabaseSync).
 */
import * as SQLite from "expo-sqlite";

// ── Types ─────────────────────────────────────────────────────────────────────

export type QueueAction =
  | "FINISH_SEANCE"    // terminer une séance démarrée en ligne
  | "SUBMIT_RAPPORT";  // envoyer un rapport rédigé hors-ligne

export interface QueueItem {
  id:         number;
  action:     QueueAction;
  payload:    string;        // JSON sérialisé
  attempts:   number;        // nombre de tentatives échouées
  last_error: string | null; // dernier message d'erreur
  created_at: string;        // ISO 8601
}

export interface RapportCache {
  id:              string;
  seance_id:       string;
  classe:          string;
  matiere:         string | null;
  date_seance:     string;
  contenu:         string;
  points_positifs: string | null;
  difficultes:     string | null;
  synced:          number; // 0 = hors-ligne, 1 = synchronisé
  created_at:      string;
}

// ── Initialisation ────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;

function getDB(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync("ared_offline.db");
    _db.execSync("PRAGMA journal_mode = WAL;");   // meilleures perfs en écriture
    _db.execSync("PRAGMA foreign_keys = ON;");
  }
  return _db;
}

/**
 * Crée les tables si elles n'existent pas encore.
 * À appeler une seule fois au démarrage de l'application.
 */
export function initDB(): void {
  const db = getDB();

  // File d'attente des actions hors-ligne
  db.execSync(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      action     TEXT    NOT NULL,
      payload    TEXT    NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Cache des rapports (consultables hors-ligne)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS rapports_cache (
      id              TEXT PRIMARY KEY,
      seance_id       TEXT NOT NULL,
      classe          TEXT NOT NULL,
      matiere         TEXT,
      date_seance     TEXT NOT NULL,
      contenu         TEXT NOT NULL,
      points_positifs TEXT,
      difficultes     TEXT,
      synced          INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Offline Queue — écriture ──────────────────────────────────────────────────

/**
 * Ajoute une action à la file d'attente.
 * Retourne l'id de la ligne insérée.
 */
export function enqueueAction(action: QueueAction, payload: object): number {
  const db  = getDB();
  const json = JSON.stringify(payload);
  const result = db.runSync(
    `INSERT INTO offline_queue (action, payload) VALUES (?, ?)`,
    [action, json],
  );
  console.log(`[Queue] Enqueued ${action} → id ${result.lastInsertRowId}`);
  return result.lastInsertRowId;
}

/**
 * Retourne toutes les actions en attente, triées par ordre de création.
 */
export function getPendingActions(): QueueItem[] {
  const db = getDB();
  return db.getAllSync<QueueItem>(
    `SELECT * FROM offline_queue ORDER BY id ASC`,
  );
}

/**
 * Supprime une action de la file (après synchronisation réussie).
 */
export function deleteAction(id: number): void {
  getDB().runSync(`DELETE FROM offline_queue WHERE id = ?`, [id]);
}

/**
 * Incrémente le compteur d'erreurs et enregistre le dernier message.
 * Permet de détecter les actions bloquées (ex : serveur rejette en dur).
 */
export function markActionFailed(id: number, error: string): void {
  getDB().runSync(
    `UPDATE offline_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
    [error, id],
  );
}

/**
 * Vide complètement la file (à l'appel de logout).
 */
export function clearQueue(): void {
  getDB().execSync(`DELETE FROM offline_queue`);
}

// ── Rapports Cache — écriture ─────────────────────────────────────────────────

/**
 * Insère ou met à jour un rapport dans le cache local.
 */
export function upsertRapportCache(rapport: Omit<RapportCache, "created_at">): void {
  const db = getDB();
  db.runSync(
    `INSERT OR REPLACE INTO rapports_cache
       (id, seance_id, classe, matiere, date_seance,
        contenu, points_positifs, difficultes, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rapport.id,
      rapport.seance_id,
      rapport.classe,
      rapport.matiere ?? null,
      rapport.date_seance,
      rapport.contenu,
      rapport.points_positifs ?? null,
      rapport.difficultes ?? null,
      rapport.synced,
    ],
  );
}

/**
 * Marque un rapport comme synchronisé avec le serveur.
 */
export function markRapportSynced(id: string): void {
  getDB().runSync(
    `UPDATE rapports_cache SET synced = 1 WHERE id = ?`,
    [id],
  );
}

/**
 * Retourne tous les rapports du cache, du plus récent au plus ancien.
 */
export function getCachedRapports(): RapportCache[] {
  return getDB().getAllSync<RapportCache>(
    `SELECT * FROM rapports_cache ORDER BY date_seance DESC`,
  );
}

/**
 * Vide le cache des rapports (logout).
 */
export function clearRapportsCache(): void {
  getDB().execSync(`DELETE FROM rapports_cache`);
}

// ── Nettoyage complet (logout) ────────────────────────────────────────────────

export function clearAllLocalData(): void {
  clearQueue();
  clearRapportsCache();
}
