/**
 * Références support (rapport V2, APP-45).
 *
 * - Chaque requête porte un `X-Request-ID` (mob-…) repris dans les journaux de
 *   l'API : l'erreur affichée dans le centre de synchronisation se retrouve
 *   côté serveur à partir de sa référence.
 * - Une réponse 5xx est signalée à `/client-errors` (une fois par minute et par
 *   route au plus). Les coupures réseau, fréquentes sur le terrain et déjà
 *   gérées par la file d'attente, ne sont pas signalées.
 * Aucun contenu personnel : chemin sans paramètres, statut, version, référence.
 */
import { Platform } from "react-native";

export function nouvelIdRequete(): string {
  let hex = "";
  for (let i = 0; i < 20; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return `mob-${hex}`;
}

type ErreurHttp = {
  config?: { url?: string; method?: string; headers?: Record<string, unknown> };
  response?: { status?: number; headers?: Record<string, unknown> };
};

/** Référence de la requête en échec : celle renvoyée par l'API, sinon celle envoyée. */
export function referenceRequete(err: unknown): string | undefined {
  const e = err as ErreurHttp;
  const r = e?.response?.headers?.["x-request-id"] ?? e?.config?.headers?.["X-Request-ID"];
  return typeof r === "string" ? r : undefined;
}

/** Route d'API sans paramètres ni identifiants (UUID, nombres) : aucune donnée métier. */
export function routeAnonyme(url?: string): string | undefined {
  if (!url) return undefined;
  return url
    .split("?")[0]
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .slice(0, 200);
}

const recents = new Map<string, number>();

export function doitSignaler(err: unknown, maintenant = Date.now()): boolean {
  const e = err as ErreurHttp;
  const st = e?.response?.status;
  if (st === undefined || st < 500) return false;
  const cle = `${st}|${routeAnonyme(e.config?.url)}`;
  if ((recents.get(cle) ?? 0) > maintenant - 60_000) return false;
  recents.set(cle, maintenant);
  return true;
}

export function corpsSignalement(err: unknown, appVersion: string) {
  const e = err as ErreurHttp;
  return {
    source: "mobile" as const,
    app_version: appVersion,
    plateforme: `${Platform.OS} ${String(Platform.Version)}`.slice(0, 40),
    type: "http" as const,
    statut_http: e?.response?.status,
    methode: e?.config?.method?.toUpperCase(),
    route: routeAnonyme(e?.config?.url),
    reference_requete: referenceRequete(err),
    survenue_le: new Date().toISOString(),
  };
}
