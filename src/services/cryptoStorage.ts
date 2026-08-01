/**
 * Chiffrement au repos pour le cache AsyncStorage.
 *
 * AsyncStorage (fichiers plist/SQLite du bac à sable de l'app) est stocké en
 * clair sur le disque — lisible sans effort (câble USB, sauvegarde, appareil
 * perdu/volé). Le cache offline contient de vraies données d'élèves et
 * d'enseignants (noms, absences, rapports), donc on chiffre la valeur avant
 * écriture avec une clé AES-256 générée aléatoirement et stockée dans le
 * Keychain/Keystore (expo-secure-store) — jamais transmise, jamais dans
 * AsyncStorage elle-même.
 *
 * Ce chiffrement protège les données QUAND l'app n'est pas déverrouillée
 * (voir AppLockGate) mais que le fichier est lu directement hors de l'app —
 * ce n'est pas un remplacement du verrou applicatif, les deux se complètent.
 */
// ⚠ DOIT rester le tout premier import : installe crypto.getRandomValues avant
// que crypto-js ne capture l'objet crypto au chargement de son module.
import "./cryptoPolyfill";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import CryptoJS from "crypto-js";

const KEY_STORAGE_NAME = "cache_encryption_key_v1";

let cachedKey: string | null = null;

/** Récupère la clé de chiffrement du cache, la génère au premier appel. */
async function getOrCreateKey(): Promise<string> {
  if (cachedKey) return cachedKey;

  let key = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
  if (!key) {
    const bytes = await Crypto.getRandomBytesAsync(32); // 256 bits
    key = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    await SecureStore.setItemAsync(KEY_STORAGE_NAME, key);
  }
  cachedKey = key;
  return key;
}

/** Chiffre une valeur JS (sérialisée en JSON) et l'écrit dans AsyncStorage. */
export async function setEncryptedItem(storageKey: string, value: unknown): Promise<void> {
  const key = await getOrCreateKey();
  const plaintext = JSON.stringify(value);
  const ciphertext = CryptoJS.AES.encrypt(plaintext, key).toString();
  await AsyncStorage.setItem(storageKey, ciphertext);
}

/** Lit et déchiffre une valeur stockée via setEncryptedItem(). */
export async function getEncryptedItem<T = unknown>(storageKey: string): Promise<T | null> {
  const stored = await AsyncStorage.getItem(storageKey);
  if (!stored) return null;
  try {
    const key = await getOrCreateKey();
    const bytes = CryptoJS.AES.decrypt(stored, key);
    const plaintext = bytes.toString(CryptoJS.enc.Utf8);
    if (!plaintext) return null; // clé absente/différente ou donnée corrompue
    return JSON.parse(plaintext) as T;
  } catch {
    // Ancien cache non chiffré (avant migration) ou donnée corrompue —
    // traité comme absent plutôt que de faire planter l'app.
    return null;
  }
}
