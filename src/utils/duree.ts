/**
 * Durées des tâches du planning.
 *
 * Les créneaux sont stockés côté serveur avec une heure de début et de fin,
 * mais le planning affiché au tuteur ne montre plus d'horaires : seule la
 * durée de chaque tâche est présentée. Les heures restent utilisées en
 * interne (tri des créneaux, détection de la tâche courante, notifications).
 */

/** "HH:MM" ou "HH:MM:SS" → minutes depuis minuit. */
export function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Durée d'un créneau en minutes (jamais négative). */
export function segDurMin(debut: string, fin: string): number {
  return Math.max(0, toMin(fin) - toMin(debut));
}

/** Libellé lisible d'une durée : "45 min", "1 h", "1 h 30". */
export function dureeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Libellé de durée d'un créneau, directement depuis ses heures. */
export function segDureeLabel(debut: string, fin: string): string {
  return dureeLabel(segDurMin(debut, fin));
}
