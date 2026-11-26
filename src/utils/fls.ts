/** Lot L10 : type d'école affiché dans le profil (français langue seconde). */
export function libelleFls(fls?: boolean | null): string {
  if (fls === true) return "École avec FLS";
  if (fls === false) return "École sans FLS";
  return "Non renseigné";
}
