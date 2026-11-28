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

type ProfilRole = {
  role?: string | null;
  title?: string | null;
  /** Fourni par /auth/me depuis l'API L13 : tuteur, superviseur, inspecteur ou null. */
  espace_mobile?: string | null;
} | null | undefined;

/**
 * Rôle « d'espace » à utiliser dans l'app : enseignant, superviseur ou inspecteur,
 * ou null pour un compte du seul tableau de bord (admin, évaluateur).
 *
 * Un compte coordonnateur (non évaluateur) est un superviseur de terrain : la page
 * « Comptes » du dashboard créait ces comptes sous le libellé « Superviseur ». Sans
 * cette règle l'app les rangeait dans l'espace tuteur.
 */
export function roleEspace(profil: ProfilRole): string | null {
  if (!profil) return null;
  if (profil.espace_mobile !== undefined) {
    if (profil.espace_mobile === "tuteur") return "enseignant";
    if (profil.espace_mobile === "superviseur" || profil.espace_mobile === "inspecteur") return profil.espace_mobile;
    return null;
  }
  const role = profil.role ?? null;
  if (role === "enseignant" || role === "superviseur" || role === "inspecteur") return role;
  if (role === "coordonnateur" && (profil.title ?? "").trim().toLowerCase() !== "evaluateur") return "superviseur";
  return null;
}
