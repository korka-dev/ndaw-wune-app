/**
 * Catégories et destinataires du signalement (RET13), selon le rôle.
 * Lot L8 : l'inspecteur ne signale qu'un problème d'application ou « autre »,
 * à l'assistance technique ou à l'équipe programme — jamais à un superviseur.
 */
import type { Feather } from "@expo/vector-icons";

export type CategorieRemarque = { key: string; label: string; icon: keyof typeof Feather.glyphMap };

export const CATEGORIES_REMARQUE: CategorieRemarque[] = [
  { key: "materiel", label: "Manque de matériel", icon: "box" },
  { key: "local",    label: "Problème de local",  icon: "home" },
  { key: "eleves",   label: "Problème d'élèves",  icon: "users" },
  { key: "securite", label: "Sécurité",           icon: "shield" },
  { key: "pedagogie",   label: "Question pédagogique",          icon: "book-open" },
  { key: "application", label: "Problème avec l'application",   icon: "smartphone" },
  { key: "autre",    label: "Autre problème",     icon: "help-circle" },
];

const CATEGORIES_INSPECTEUR = ["application", "autre"];

export function categoriesPour(role?: string | null): CategorieRemarque[] {
  if (role === "inspecteur") return CATEGORIES_REMARQUE.filter((c) => CATEGORIES_INSPECTEUR.includes(c.key));
  return CATEGORIES_REMARQUE;
}

/** La question pédagogique va au superviseur (tuteur uniquement), le problème
 *  d'application à l'assistance technique, le reste à l'équipe programme. */
export function destinatairePour(categorie: string | null, role?: string | null): { code: string; libelle: string } {
  if (categorie === "pedagogie" && role === "enseignant") return { code: "superviseur", libelle: "votre superviseur" };
  if (categorie === "application") return { code: "support_technique", libelle: "l'assistance technique" };
  return { code: "equipe_programme", libelle: "l'équipe Ndaw Wune" };
}
