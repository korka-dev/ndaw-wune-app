/**
 * Jours proposés dans le sélecteur de période.
 *
 * Le « jour » d'un créneau est un index de programme défini par l'admin
 * (Jour 1, Jour 2…), pas un jour calendaire : un même « Jour 3 » peut tomber
 * n'importe quel jour de la semaine selon l'école.
 */

/**
 * Réunit les jours configurés par l'admin (`nbJours`, dashboard « Semaines &
 * jours de progression ») et ceux réellement présents dans le planning
 * synchronisé.
 *
 * Les deux sources sont nécessaires : la configuration seule masquerait un
 * créneau planifié au-delà de nb_jours, et le planning seul empêcherait de
 * choisir un jour encore vide — c'était le cas avant, le sélecteur restait
 * bloqué sur les seuls jours déjà planifiés.
 *
 * @returns indices de jour (0 = Jour 1), triés, sans doublon.
 */
export function joursDisponibles(
  planning: { jour: number }[],
  nbJours: number,
): number[] {
  const total = Number.isFinite(nbJours) && nbJours > 0 ? Math.floor(nbJours) : 0;
  const set = new Set<number>(Array.from({ length: total }, (_, i) => i));
  for (const p of planning) {
    if (Number.isFinite(p?.jour)) set.add(p.jour);
  }
  return Array.from(set).sort((a, b) => a - b);
}
