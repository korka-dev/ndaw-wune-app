/**
 * Pointage des tuteurs par le superviseur.
 *
 * Le serveur attend le numéro du jour de cours (1 = Jour 1). L'écran garde un
 * index (0 = Jour 1) : avant la 1.4.1, cet index partait tel quel, « Jour 1 »
 * était refusé et l'écran renvoyait en boucle (il clignotait).
 */

export interface PointageProf {
  id: string;
  present: boolean | null;
  motif: string | null;
}

/** Index de l'écran (0 = Jour 1) → numéro attendu par le serveur (1 = Jour 1). */
export function jourCoursServeur(index: number | null | undefined): number | null {
  return typeof index === "number" && Number.isFinite(index) && index >= 0 ? index + 1 : null;
}

/** Entrées envoyées au serveur : seulement les tuteurs pointés, motif seulement si absent. */
export function entreesPointage(profs: PointageProf[]) {
  return profs
    .filter(p => p.present !== null)
    .map(p => ({
      teacher_id: p.id,
      present: p.present === true,
      motif: p.present === true ? null : (p.motif ?? "Non justifié"),
    }));
}

/** Message clair pour un envoi refusé ; null = pas de réseau (enregistrer hors ligne). */
export function messageErreurPointage(e: unknown): string | null {
  const err = e as { response?: { status?: number; data?: { detail?: unknown } } } | null;
  if (!err?.response) return null;
  const st = err.response.status;
  if (st === 403) return "Un ou plusieurs tuteurs ne vous sont plus assignés. Tirez l'écran vers le bas pour actualiser la liste.";
  const d = err.response.data?.detail;
  if (typeof d === "string" && d) return `Pointage non enregistré : ${d}`;
  return `Pointage non enregistré (erreur ${st ?? "inconnue"}). Réessayez.`;
}
