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
