/**
 * Mock de expo-secure-store pour les tests Jest.
 * Stocke les valeurs en mémoire (Map) au lieu du Keychain/Keystore.
 */
const store = new Map<string, string>();

export const setItemAsync = jest.fn(async (key: string, value: string) => {
  store.set(key, value);
});

export const getItemAsync = jest.fn(async (key: string): Promise<string | null> => {
  return store.get(key) ?? null;
});

export const deleteItemAsync = jest.fn(async (key: string) => {
  store.delete(key);
});

/** Utilitaire de test : réinitialise le store entre les cas de test. */
export function __resetStore() {
  store.clear();
  jest.clearAllMocks();
}
