/**
 * Polyfill de `crypto.getRandomValues` pour le runtime React Native (Hermes).
 *
 * POURQUOI CE FICHIER SÉPARÉ — et pourquoi il doit être importé EN PREMIER :
 *
 * crypto-js capture l'objet `crypto` dans une variable de closure au moment où
 * son module est évalué (voir node_modules/crypto-js/core.js) :
 *
 *     var crypto;
 *     if (typeof globalThis !== 'undefined' && globalThis.crypto) {
 *         crypto = globalThis.crypto;      // ← capture unique, définitive
 *     }
 *
 * Deux conséquences :
 *   1. Poser le polyfill APRÈS l'import de crypto-js est inutile : les imports
 *      ES sont évalués avant le corps du module, donc la capture a déjà eu lieu.
 *   2. REMPLACER globalThis.crypto par un nouvel objet est inutile aussi :
 *      crypto-js conserve la référence de l'ancien.
 *
 * D'où : un module dédié, importé avant crypto-js, qui complète l'objet
 * existant sur place au lieu de le remplacer.
 *
 * Sans ce polyfill, AES.encrypt lève « Native crypto module could not be used
 * to get secure random number » — le cache chiffré n'est jamais écrit et
 * l'application perd tout son fonctionnement hors-ligne.
 */
import * as ExpoCrypto from "expo-crypto";

const g = globalThis as any;

if (!g.crypto) {
  // Aucun objet crypto : on en crée un (non énumérable, comme le standard).
  g.crypto = {};
}

if (typeof g.crypto.getRandomValues !== "function") {
  // Mutation SUR PLACE de l'objet existant — ne jamais réassigner g.crypto ici,
  // sinon les modules l'ayant déjà capturé garderaient l'ancienne référence.
  g.crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T =>
    ExpoCrypto.getRandomValues(array as any) as unknown as T;
}

export {};
