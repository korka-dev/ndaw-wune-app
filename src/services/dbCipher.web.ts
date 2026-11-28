/**
 * Version web (PWA) de la base locale : expo-sqlite en WebAssembly, stockée
 * dans le navigateur (OPFS). Pas de SQLCipher sur le web : base non chiffrée,
 * propre à ce site et à ce navigateur.
 */
import { Alert } from "react-native";
import * as SQLite from "expo-sqlite";

export const BASE_CLAIRE = "ared_offline.db";
export const BASE_CHIFFREE = "ared_offline_chiffre.db";
export type EtatChiffrement = "chiffree" | "claire_sans_sqlcipher" | "claire_migration_en_echec";
export const etatChiffrement = (): EtatChiffrement => "claire_sans_sqlcipher";

/**
 * Base de secours quand le navigateur refuse la base locale : les lectures
 * renvoient « rien », les écritures sont ignorées. Les écrans fonctionnent
 * alors normalement en ligne (données du serveur), sans cache hors-ligne.
 */
function baseVide(): SQLite.SQLiteDatabase {
  const rien = { changes: 0, lastInsertRowId: 0 };
  return {
    execSync: () => {},
    runSync: () => rien,
    getAllSync: () => [],
    getFirstSync: () => null,
    closeSync: () => {},
  } as unknown as SQLite.SQLiteDatabase;
}

/**
 * Le stockage du navigateur (OPFS) n'accepte qu'une seule page à la fois :
 * si NDAW WUNE est ouverte dans plusieurs onglets (ou onglet Safari + icône
 * de l'écran d'accueil), les suivantes ne peuvent pas ouvrir la base, et
 * expo-sqlite refuse alors toute base, même en mémoire. Plutôt que de casser
 * les écrans (« Impossible de charger les enseignants »…), on continue sans
 * cache local et on explique comment retrouver le mode hors-ligne.
 */
export function ouvrirBaseLocale(): SQLite.SQLiteDatabase {
  try {
    return SQLite.openDatabaseSync(BASE_CLAIRE);
  } catch (e) {
    console.warn("[DB] Base locale du navigateur indisponible, l'app continue sans cache hors-ligne :", e);
    Alert.alert(
      "NDAW WUNE est ouverte ailleurs",
      "L'application semble ouverte dans un autre onglet. Elle fonctionne, mais sans enregistrement hors-ligne.\n\n" +
        "Fermez les autres onglets NDAW WUNE, puis rouvrez l'application.",
    );
    return baseVide();
  }
}
