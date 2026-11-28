/**
 * Version web (PWA) d'expo-secure-store : stockage du navigateur.
 *
 * Le navigateur n'a pas de trousseau sécurisé : les jetons sont gardés dans le
 * localStorage du site (isolé des autres sites). La déconnexion les efface.
 */
const PREFIXE = "ndawwune.secure.";

function stockage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function getItem(key: string): string | null {
  return stockage()?.getItem(PREFIXE + key) ?? null;
}
export function setItem(key: string, value: string): void {
  stockage()?.setItem(PREFIXE + key, value);
}
export function deleteItem(key: string): void {
  stockage()?.removeItem(PREFIXE + key);
}
export async function getItemAsync(key: string): Promise<string | null> { return getItem(key); }
export async function setItemAsync(key: string, value: string): Promise<void> { setItem(key, value); }
export async function deleteItemAsync(key: string): Promise<void> { deleteItem(key); }
export async function isAvailableAsync(): Promise<boolean> { return stockage() !== null; }

export const WHEN_UNLOCKED = 0;
export const AFTER_FIRST_UNLOCK = 1;
