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
  | "FINISH_SEANCE"               // terminer une séance démarrée en ligne
  | "SUBMIT_RAPPORT"              // envoyer un rapport de séance rédigé hors-ligne
  | "SUBMIT_RAPPORT_JOURNALIER";  // envoyer un rapport journalier rédigé hors-ligne

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

  // Cache des rapports de séance (consultables hors-ligne)
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

  // Rapports journaliers tuteur — stockés hors-ligne avant sync
  db.execSync(`
    CREATE TABLE IF NOT EXISTS rapports_journalier (
      id                       TEXT PRIMARY KEY,
      date_rapport             TEXT NOT NULL,
      ief                      TEXT NOT NULL,
      commune                  TEXT NOT NULL,
      ecole                    TEXT NOT NULL,
      superviseur              TEXT NOT NULL,
      nom_tuteur               TEXT NOT NULL,
      nb_absences              INTEGER NOT NULL DEFAULT 0,
      absents                  TEXT,
      semaine                  INTEGER NOT NULL,
      jour_cours               INTEGER NOT NULL,
      difficultes              TEXT NOT NULL,
      autres_difficultes       TEXT,
      description_difficultes  TEXT,
      directeur_venu           INTEGER NOT NULL,
      besoin_appui             INTEGER NOT NULL,
      domaines_appui           TEXT,
      has_observations         INTEGER NOT NULL,
      commentaires             TEXT,
      soumis_en_offline        INTEGER NOT NULL DEFAULT 1,
      photo_classe             TEXT,    -- URI locale de la photo prise par le tuteur
      synced                   INTEGER NOT NULL DEFAULT 0,
      created_at               TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  // Migration douce : ajouter la colonne photo_classe si elle n'existe pas encore
  try {
    getDB().execSync(`ALTER TABLE rapports_journalier ADD COLUMN photo_classe TEXT`);
  } catch { /* colonne déjà présente */ }
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
 * Réinitialise le compteur de tentatives de toutes les actions échouées.
 * Utile après une panne serveur résolue — permet de rejouer les actions bloquées.
 */
export function resetFailedActions(): void {
  getDB().runSync(
    `UPDATE offline_queue SET attempts = 0, last_error = NULL WHERE attempts >= ?`,
    [5],
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

// ── Rapports Journalier — types ───────────────────────────────────────────────

export interface RapportJournalierLocal {
  id:                      string;
  date_rapport:            string;   // ISO date YYYY-MM-DD
  ief:                     string;
  commune:                 string;
  ecole:                   string;
  superviseur:             string;
  nom_tuteur:              string;
  nb_absences:             number;
  absents:                 string | null;
  semaine:                 number;
  jour_cours:              number;
  difficultes:             string;   // JSON array sérialisé
  autres_difficultes:      string | null;
  description_difficultes: string | null;
  directeur_venu:          number;   // 0/1
  besoin_appui:            number;   // 0/1
  domaines_appui:          string | null;
  has_observations:        number;   // 0/1
  commentaires:            string | null;
  soumis_en_offline:       number;   // 0/1
  photo_classe:            string | null;  // URI locale de la photo
  synced:                  number;   // 0/1
  created_at:              string;
}

// ── Rapports Journalier — écriture ────────────────────────────────────────────

/**
 * Insère un rapport journalier dans la DB locale.
 * synced=0 par défaut (en attente de synchronisation).
 */
export function insertRapportJournalier(r: Omit<RapportJournalierLocal, "created_at" | "synced">): void {
  const db = getDB();
  db.runSync(
    `INSERT INTO rapports_journalier (
      id, date_rapport, ief, commune, ecole, superviseur, nom_tuteur,
      nb_absences, absents, semaine, jour_cours, difficultes,
      autres_difficultes, description_difficultes,
      directeur_venu, besoin_appui, domaines_appui,
      has_observations, commentaires, soumis_en_offline, photo_classe, synced
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
    [
      r.id, r.date_rapport, r.ief, r.commune, r.ecole, r.superviseur, r.nom_tuteur,
      r.nb_absences, r.absents ?? null, r.semaine, r.jour_cours, r.difficultes,
      r.autres_difficultes ?? null, r.description_difficultes ?? null,
      r.directeur_venu, r.besoin_appui, r.domaines_appui ?? null,
      r.has_observations, r.commentaires ?? null, r.soumis_en_offline,
      r.photo_classe ?? null,
    ],
  );
}

/**
 * Marque un rapport journalier comme synchronisé avec le serveur.
 */
export function markRapportJournalierSynced(id: string): void {
  getDB().runSync(
    `UPDATE rapports_journalier SET synced = 1 WHERE id = ?`,
    [id],
  );
}

/**
 * Retourne tous les rapports journaliers, du plus récent au plus ancien.
 */
export function getRapportsJournalier(): RapportJournalierLocal[] {
  return getDB().getAllSync<RapportJournalierLocal>(
    `SELECT * FROM rapports_journalier ORDER BY date_rapport DESC, created_at DESC`,
  );
}

/**
 * Vide la table des rapports journaliers (logout).
 */
export function clearRapportsJournalier(): void {
  getDB().execSync(`DELETE FROM rapports_journalier`);
}

// ── Nettoyage complet (logout) ────────────────────────────────────────────────

export function clearAllLocalData(): void {
  clearQueue();
  clearRapportsCache();
  clearRapportsJournalier();
}
