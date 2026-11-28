/**
 * Bus d'événement minimaliste pour signaler un échec d'authentification
 * (refresh token expiré) depuis l'intercepteur axios vers les composants React.
 *
 * Évite l'import circulaire : api.ts → useStore.ts → api.ts.
 */

type AuthFailureCallback = () => void;

let _callback: AuthFailureCallback | null = null;

export function onAuthFailure(cb: AuthFailureCallback | null): void {
  _callback = cb;
}

export function dispatchAuthFailure(): void {
  _callback?.();
}

// ── Mot de passe temporaire à changer (APP-08) ────────────────────────────────
let _pwdCallback: (() => void) | null = null;

export function onPasswordChangeRequired(cb: (() => void) | null): void {
  _pwdCallback = cb;
}

export function dispatchPasswordChangeRequired(): void {
  _pwdCallback?.();
}

// ── Version trop ancienne (APP-46) ────────────────────────────────────────────
export interface UpdateRequiredPayload {
  minVersion:    string | null;
  latestVersion: string | null;
  /** « disponible » : nouvelle version proposée (on peut continuer) ; défaut : obligatoire. */
  mode?:         "obligatoire" | "disponible";
  /** Lien de téléchargement de l'APK publié par l'API (APP_DOWNLOAD_URL). */
  downloadUrl?:  string | null;
}

const _updateListeners = new Set<(info: UpdateRequiredPayload) => void>();

export function onUpdateRequired(cb: (info: UpdateRequiredPayload) => void): () => void {
  _updateListeners.add(cb);
  return () => { _updateListeners.delete(cb); };
}

export function dispatchUpdateRequired(info: UpdateRequiredPayload): void {
  _updateListeners.forEach((cb) => cb(info));
}
