/**
 * Stockage sécurisé des données d'authentification.
 *
 * Utilise expo-secure-store (Keychain iOS / Keystore Android) pour les tokens,
 * contrairement à AsyncStorage qui stocke en clair sur le disque.
 *
 * Clés gérées :
 *   - access_token   : JWT d'accès (60 min)
 *   - refresh_token  : JWT de rafraîchissement (30 jours)
 *   - user_role      : rôle de l'utilisateur (chaîne)
 *
 * Limitations de SecureStore :
 *   - Valeur max ~2048 bytes (amplement suffisant pour des JWTs HS256)
 *   - Asynchrone (même API que AsyncStorage)
 *   - Non disponible dans les tests Jest → les tests mockent ce module
 */
import * as SecureStore from "expo-secure-store";

export type SecureKey = "access_token" | "refresh_token" | "user_role";

export async function setSecure(key: SecureKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function getSecure(key: SecureKey): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function deleteSecure(key: SecureKey): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

/**
 * Efface tous les tokens d'authentification.
 * Appelé au logout et quand le refresh token expire.
 */
export async function clearAuthTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync("access_token"),
    SecureStore.deleteItemAsync("refresh_token"),
    SecureStore.deleteItemAsync("user_role"),
  ]);
}
