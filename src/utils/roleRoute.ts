/**
 * Destination d'accueil selon le rôle de l'utilisateur connecté.
 * Source unique utilisée par app/index.tsx, LoginScreen et tout écran qui
 * renvoie l'utilisateur vers « son » espace.
 */
export const ROUTE_TUTEUR      = "/(tabs)/home";
export const ROUTE_SUPERVISEUR = "/(supervisor-tabs)/presences";
export const ROUTE_INSPECTEUR  = "/(inspecteur-tabs)/accueil";

/** Lot L8 : l'inspecteur d'IEF consulte en lecture seule — aucune saisie,
 *  aucune file hors ligne, aucune séance ni rappel. */
export function estInspecteur(role: string | null | undefined): boolean {
  return role === "inspecteur";
}

export function routeAccueilPourRole(role: string | null | undefined): string {
  if (role === "superviseur") return ROUTE_SUPERVISEUR;
  if (estInspecteur(role)) return ROUTE_INSPECTEUR;
  return ROUTE_TUTEUR;
}
