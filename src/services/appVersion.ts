/**
 * Compatibilité application mobile / API (rapport V2, APP-46).
 *
 * - Chaque requête porte l'en-tête `X-App-Version` (version de app.json).
 * - L'API répond 426 `APP_UPDATE_REQUIRED` sur /app/* quand la version est
 *   inférieure à `MIN_APP_VERSION`. L'application affiche alors un écran de
 *   mise à jour ; la file hors ligne n'est JAMAIS vidée ni pénalisée : les
 *   saisies repartent après la mise à jour.
 */
import Constants from "expo-constants";

export const APP_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

/** "1.2.10" → [1, 2, 10] ; null si illisible (jamais bloquant). */
export function parseVersion(v: string | null | undefined): number[] | null {
  if (!v) return null;
  const m = /^\s*v?(\d+(?:\.\d+){0,3})/.exec(v);
  if (!m) return null;
  const parts = m[1].split(".").map(Number);
  while (parts.length < 3) parts.push(0);
  return parts;
}

export function isOutdated(current: string | null | undefined, minimum: string | null | undefined): boolean {
  const c = parseVersion(current);
  const m = parseVersion(minimum);
  if (!c || !m) return false;
  for (let i = 0; i < Math.max(c.length, m.length); i++) {
    const a = c[i] ?? 0, b = m[i] ?? 0;
    if (a !== b) return a < b;
  }
  return false;
}

export interface UpdateRequiredInfo {
  minVersion:    string | null;
  latestVersion: string | null;
}

/** Erreur API « version trop ancienne » (426 APP_UPDATE_REQUIRED). */
export function isUpdateRequiredError(err: unknown): boolean {
  const r = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  return r?.status === 426 || r?.data?.detail === "APP_UPDATE_REQUIRED";
}

/** Erreur API « mot de passe temporaire à changer » (403 PASSWORD_CHANGE_REQUIRED). */
export function isPasswordChangeRequiredError(err: unknown): boolean {
  const r = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  return r?.status === 403 && r?.data?.detail === "PASSWORD_CHANGE_REQUIRED";
}

/** Délai minimal entre deux vérifications de version au retour dans l'app (données mobiles). */
export const INTERVALLE_VERIF_VERSION_MS = 30 * 60 * 1000;

/**
 * État de mise à jour selon la politique publiée par l'API (/app-version) :
 * « obligatoire » sous la version minimale, « disponible » sous la dernière
 * version publiée, sinon null.
 */
export function etatMiseAJour(
  current: string | null | undefined,
  policy: { min_version?: string | null; latest_version?: string | null } | null | undefined,
): "obligatoire" | "disponible" | null {
  if (!policy) return null;
  if (policy.min_version && isOutdated(current, policy.min_version)) return "obligatoire";
  if (policy.latest_version && isOutdated(current, policy.latest_version)) return "disponible";
  return null;
}
