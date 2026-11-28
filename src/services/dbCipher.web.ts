/**
 * Version web (PWA) de la base locale : expo-sqlite en WebAssembly, stockée
 * dans le navigateur (OPFS). Pas de SQLCipher sur le web : base non chiffrée,
 * propre à ce site et à ce navigateur.
 */
import * as SQLite from "expo-sqlite";

export const BASE_CLAIRE = "ared_offline.db";
export const BASE_CHIFFREE = "ared_offline_chiffre.db";
export type EtatChiffrement = "chiffree" | "claire_sans_sqlcipher" | "claire_migration_en_echec";
export const etatChiffrement = (): EtatChiffrement => "claire_sans_sqlcipher";

export function ouvrirBaseLocale(): SQLite.SQLiteDatabase {
  return SQLite.openDatabaseSync(BASE_CLAIRE);
}
