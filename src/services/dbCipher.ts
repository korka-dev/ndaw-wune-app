/**
 * Base locale chiffrée (rapport V2, APP-14 — version prudente).
 *
 * La base SQLite (file d'attente, rapports non envoyés, pointages, cache des
 * tuteurs) est chiffrée par SQLCipher (plugin expo-sqlite `useSQLCipher`).
 * La clé — 256 bits aléatoires — est générée au premier lancement et stockée
 * dans le Keychain / Keystore (expo-secure-store), jamais sur disque en clair
 * ni transmise.
 *
 * Migration : la base en clair d'une version précédente (`ared_offline.db`)
 * est recopiée dans la base chiffrée via `sqlcipher_export`, puis supprimée.
 * En cas d'échec, l'application continue sur l'ancienne base (aucune perte
 * de saisie non envoyée) et la migration est retentée au lancement suivant.
 * Si SQLCipher n'est pas présent dans le binaire (Expo Go, build ancien),
 * on reste sur la base en clair — le verrou applicatif (AppLockGate) et le
 * chiffrement du cache AsyncStorage restent actifs.
 */
import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

export const BASE_CLAIRE = "ared_offline.db";
export const BASE_CHIFFREE = "ared_offline_chiffre.db";
const CLE_SECURE_STORE = "sqlite_cipher_key_v1";
const DRAPEAU_MIGRATION = "sqlite_cipher_migre_v1";

export type EtatChiffrement = "chiffree" | "claire_sans_sqlcipher" | "claire_migration_en_echec";
let _etat: EtatChiffrement = "claire_sans_sqlcipher";
/** État observé au dernier démarrage (affiché dans le centre de synchronisation / diagnostics). */
export const etatChiffrement = (): EtatChiffrement => _etat;

function aleatoireHex(n: number): string {
  let octets: Uint8Array;
  try { octets = Crypto.getRandomBytes(n); }
  catch {
    octets = new Uint8Array(n);
    (globalThis as any).crypto?.getRandomValues?.(octets);
  }
  return Array.from(octets).map(b => b.toString(16).padStart(2, "0")).join("");
}

function cle(): string {
  let k = SecureStore.getItem(CLE_SECURE_STORE);
  if (!k) {
    k = aleatoireHex(32);
    SecureStore.setItem(CLE_SECURE_STORE, k);
  }
  return k;
}

/** Clé brute SQLCipher (hex), sans dérivation PBKDF2 — la clé est déjà aléatoire. */
const pragmaCle = (k: string) => `"x'${k}'"`;

function sqlcipherDisponible(db: SQLite.SQLiteDatabase): boolean {
  try {
    const r = db.getFirstSync<{ cipher_version?: string }>("PRAGMA cipher_version;");
    return !!r?.cipher_version;
  } catch { return false; }
}

function migrerDepuisClaire(k: string): void {
  const chemin = `${SQLite.defaultDatabaseDirectory}/${BASE_CHIFFREE}`.replace(/^file:\/\//, "");
  const claire = SQLite.openDatabaseSync(BASE_CLAIRE);
  try {
    const v = claire.getFirstSync<{ user_version: number }>("PRAGMA user_version;")?.user_version ?? 0;
    claire.execSync(`ATTACH DATABASE '${chemin.replace(/'/g, "''")}' AS chiffree KEY ${pragmaCle(k)};`);
    claire.execSync("SELECT sqlcipher_export('chiffree');");
    claire.execSync(`PRAGMA chiffree.user_version = ${Number(v) | 0};`);
    claire.execSync("DETACH DATABASE chiffree;");
  } finally {
    claire.closeSync?.();
  }
  SQLite.deleteDatabaseSync(BASE_CLAIRE);
}

/**
 * Ouvre la base locale : chiffrée si possible, en migrant l'ancienne base
 * en clair une seule fois.
 */
export function ouvrirBaseLocale(): SQLite.SQLiteDatabase {
  let k: string;
  try { k = cle(); }
  catch {
    // Keystore indisponible : impossible de garder une clé sûre → base en clair.
    _etat = "claire_sans_sqlcipher";
    return SQLite.openDatabaseSync(BASE_CLAIRE);
  }

  const dejaMigre = SecureStore.getItem(DRAPEAU_MIGRATION) === "1";
  if (!dejaMigre) {
    // Vérifie la présence de SQLCipher sur une base temporaire en mémoire.
    const sonde = SQLite.openDatabaseSync(":memory:");
    const dispo = sqlcipherDisponible(sonde);
    sonde.closeSync?.();
    if (!dispo) {
      _etat = "claire_sans_sqlcipher";
      return SQLite.openDatabaseSync(BASE_CLAIRE);
    }
    try {
      migrerDepuisClaire(k);
      SecureStore.setItem(DRAPEAU_MIGRATION, "1");
    } catch (e) {
      console.error("[DB] Migration vers la base chiffrée en échec — on garde la base existante :", e);
      _etat = "claire_migration_en_echec";
      return SQLite.openDatabaseSync(BASE_CLAIRE);
    }
  }

  let db = SQLite.openDatabaseSync(BASE_CHIFFREE);
  db.execSync(`PRAGMA key = ${pragmaCle(k)};`); // doit précéder toute autre requête
  try {
    db.getFirstSync("SELECT count(*) AS n FROM sqlite_master;");
  } catch (e) {
    // Clé différente (Keystore réinitialisé) : la base est illisible et irrécupérable.
    // On repart d'une base vide plutôt que de bloquer l'application.
    console.error("[DB] Base chiffrée illisible avec la clé actuelle — réinitialisation :", e);
    db.closeSync?.();
    SQLite.deleteDatabaseSync(BASE_CHIFFREE);
    db = SQLite.openDatabaseSync(BASE_CHIFFREE);
    db.execSync(`PRAGMA key = ${pragmaCle(k)};`);
  }
  _etat = "chiffree";
  return db;
}
