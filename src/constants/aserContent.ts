/**
 * Contenu de l'outil de sélection ASER par langue d'enseignement.
 * Source : "Outil de selection-ASER_<langue>.docx"
 * Chaque école utilise une seule langue (Wolof, Sereer ou Pulaar).
 */

export type LangueEnseignement = "Wolof" | "Sereer" | "Pulaar";

export interface AserContent {
  lettres: string;
  syllabes: string;
  mots: string;
  operations: string[];
}

export const ASER_CONTENT: Record<LangueEnseignement, AserContent> = {
  Wolof: {
    lettres:  "a l t e n r m k g s",
    syllabes: "gi bi ak ko di am la nu ay de",
    mots:     "meew tali kalaas kàddu baat liggeey tuuti garab bokk dafay",
    operations: ["22 + 35 =", "34 + 12 =", "19 - 7 =", "45 - 33 ="],
  },
  Sereer: {
    lettres:  "a l t e n r m k g s",
    syllabes: "wo si ka ko ta am fi nu at de",
    mots:     "met tali kalaas yaru bat laamit fuuli simin fog mayu",
    operations: ["22 + 35 =", "34 + 12 =", "19 - 7 =", "45 - 33 ="],
  },
  Pulaar: {
    lettres:  "a l t e n r m k g s",
    syllabes: "as yo kii ko ta am fi nii to de",
    mots:     "bee makko galle lekkol maama kadi tawii woni maa goggo",
    operations: ["22 + 35 =", "34 + 12 =", "19 - 7 =", "45 - 33 ="],
  },
};

/** Type de support ASER associé à une compétence (pour affichage de référence). */
export type AserSupportType = "lettres" | "syllabes" | "mots" | "operations" | null;

/**
 * Compétences de l'évaluation ASER (identiques pour toutes les classes,
 * seul le contenu — lettres/syllabes/mots — change selon la langue de l'école).
 */
export const ASER_COMPETENCES: { id: "lettres" | "syllabes" | "mots" | "operations"; label: string }[] = [
  { id: "lettres",    label: "Lecture · Sons des lettres" },
  { id: "syllabes",   label: "Lecture · Syllabes" },
  { id: "mots",       label: "Lecture · Mots" },
  { id: "operations", label: "Mathématiques · Opérations" },
];

export function getAserSupport(competenceId: string): AserSupportType {
  return (["lettres", "syllabes", "mots", "operations"] as const).includes(competenceId as any)
    ? (competenceId as AserSupportType)
    : null;
}

export function normaliseLangue(langue?: string | null): LangueEnseignement {
  const l = (langue ?? "").trim().toLowerCase();
  if (l.startsWith("se") || l.startsWith("sereer") || l.startsWith("seereer")) return "Sereer";
  if (l.startsWith("pu")) return "Pulaar";
  return "Wolof";
}
