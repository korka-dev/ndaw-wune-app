/**
 * Service de cache offline.
 * Stocke le SyncPayload dans AsyncStorage pour utilisation sans connexion.
 * Les valeurs sont chiffrées au repos (voir cryptoStorage.ts) — le cache
 * contient de vraies données d'élèves et d'enseignants.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncApi } from "./api";
import { getEncryptedItem, setEncryptedItem } from "./cryptoStorage";

const SYNC_KEY      = "ared_sync_payload";
const SYNC_DATE_KEY = "ared_sync_date";
const SUP_EVALS_KEY  = "ared_supervisor_evaluations";
const SUP_ELEVES_KEY = "ared_supervisor_eleves";
const SUP_COMPETENCES_KEY = "ared_evaluation_competences";
const SUP_DIFFICULTES_KEY = "ared_supervisor_difficultes";
const SUP_RAPPORT_QUESTIONS_KEY = "ared_supervisor_rapport_questions";
const SUP_RAPPORT_LIBELLES_KEY = "ared_supervisor_rapport_libelles";
const TEACHER_EVALS_KEY   = "ared_teacher_evaluations";

export interface SyncPayload {
  synced_at: string;
  profile: {
    id: string; name: string; title: string | null;
    email: string | null; phone: string | null;
    role: string; status?: string | null;
    school_id: string | null;
    niveau?: string[] | null; classes: string[] | null;
    groupe_recherche?: string | null;       // "traitement" | "controle"
    app_access?: string;                    // "full" | "timer_only"
  };
  school: {
    id: string; name: string;
    code_ecole?: number | null;
    region: string | null;
    city: string | null;
    director: string | null;
    director_phone?: string | null;
    langue?: string | null;
  } | null;
  active_session: {
    id: string; name: string; date_debut: string; date_fin: string;
    status: string; description: string | null;
  } | null;
  planning: {
    id: string; jour: number; heure_debut: string; heure_fin: string;
    semaine?: number | null;       // semaine du programme concernée (null = toutes)
    classe: string; matiere: string | null;
    titre: string | null;          // titre du segment (ex: "Accueil & rituels")
  }[];
  eleves?: { id: string; nom: string; prenom: string | null; classe: string }[];
  rapport_questions?: {
    id: string; label: string; type: string;
    options: string[] | null; required: boolean; ordre: number;
  }[];
  rapport_difficultes?: { id: string; label: string; ordre: number }[];
  rapport_libelles?: Record<string, string>;
  nb_semaines?: number;   // nombre de semaines de progression proposées au tuteur (défaut 10)
  nb_jours?: number;      // nombre de jours par semaine proposés au tuteur (défaut 3)
  stats?: {
    nb_eleves?: number;
    nb_tests?: number;
    nb_fiches?: number;
  };
}

export async function fetchAndCache(): Promise<SyncPayload> {
  const { data } = await syncApi.sync();
  await setEncryptedItem(SYNC_KEY, data);
  await AsyncStorage.setItem(SYNC_DATE_KEY, new Date().toISOString());
  return data as SyncPayload;
}

export async function getCached(): Promise<SyncPayload | null> {
  return getEncryptedItem<SyncPayload>(SYNC_KEY);
}

export async function getLastSyncDate(): Promise<string | null> {
  return AsyncStorage.getItem(SYNC_DATE_KEY);
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.multiRemove([SYNC_KEY, SYNC_DATE_KEY, SUP_EVALS_KEY, SUP_ELEVES_KEY, SUP_COMPETENCES_KEY, SUP_DIFFICULTES_KEY, SUP_RAPPORT_QUESTIONS_KEY, SUP_RAPPORT_LIBELLES_KEY, TEACHER_EVALS_KEY]);
}

/** Questions complémentaires (configurées par l'admin) destinées au rapport du superviseur. */
export interface SupRapportQuestionItem {
  id: string; label: string; type: string;
  options: string[] | null; required: boolean; ordre: number;
}

export async function getCachedSupRapportQuestions(): Promise<SupRapportQuestionItem[] | null> {
  return getEncryptedItem<SupRapportQuestionItem[]>(SUP_RAPPORT_QUESTIONS_KEY);
}

export async function setCachedSupRapportQuestions(items: SupRapportQuestionItem[]): Promise<void> {
  await setEncryptedItem(SUP_RAPPORT_QUESTIONS_KEY, items);
}

export async function getCachedSupRapportLibelles(): Promise<Record<string, string> | null> {
  return getEncryptedItem<Record<string, string>>(SUP_RAPPORT_LIBELLES_KEY);
}

export async function setCachedSupRapportLibelles(items: Record<string, string>): Promise<void> {
  await setEncryptedItem(SUP_RAPPORT_LIBELLES_KEY, items);
}

/** Cache local des compétences d'évaluation configurées par l'admin (superviseur), pour usage hors-ligne. */
export interface EvaluationCompetenceItem {
  id: string; label: string; code: string; ordre: number;
}

export async function getCachedEvaluationCompetences(): Promise<EvaluationCompetenceItem[] | null> {
  return getEncryptedItem<EvaluationCompetenceItem[]>(SUP_COMPETENCES_KEY);
}

export async function setCachedEvaluationCompetences(items: EvaluationCompetenceItem[]): Promise<void> {
  await setEncryptedItem(SUP_COMPETENCES_KEY, items);
}

/** Cache local des classes/élèves du superviseur, pour consultation hors-ligne. */
export async function getCachedSupEleves(): Promise<any[] | null> {
  return getEncryptedItem<any[]>(SUP_ELEVES_KEY);
}

export async function setCachedSupEleves(classes: any[]): Promise<void> {
  await setEncryptedItem(SUP_ELEVES_KEY, classes);
}

/**
 * Cache local des évaluations élèves (superviseur), pour relecture/écriture hors-ligne.
 * Stocké sous forme de paires [clé, résultat] — clé = "<competence>:<eleve_id>".
 */
export async function getCachedEvaluations(): Promise<[string, string][]> {
  return (await getEncryptedItem<[string, string][]>(SUP_EVALS_KEY)) ?? [];
}

export async function setCachedEvaluations(entries: [string, string][]): Promise<void> {
  await setEncryptedItem(SUP_EVALS_KEY, entries);
}

/** Cache local des difficultés signalées par les enseignants assignés (superviseur), pour consultation hors-ligne. */
export interface DifficulteItem {
  id: string;
  teacher_id: string;
  teacher_name: string;
  ecole: string;
  date_rapport: string;
  difficultes: string[];
  autres_difficultes: string | null;
  description_difficultes: string | null;
  nb_absences: number;
  absents: string | null;
  resolutions: Record<string, boolean>;
}

export async function getCachedDifficultes(): Promise<DifficulteItem[] | null> {
  return getEncryptedItem<DifficulteItem[]>(SUP_DIFFICULTES_KEY);
}

export async function setCachedDifficultes(items: DifficulteItem[]): Promise<void> {
  await setEncryptedItem(SUP_DIFFICULTES_KEY, items);
}

/** Cache local des évaluations reçues par l'enseignant (depuis les superviseurs). */
export interface TeacherEvalItem {
  eleve_id:        string;
  nom:             string;
  prenom:          string | null;
  classe:          string;
  competence:      string;
  resultat:        string;   // acquis | en_cours | a_aider
  date_eval:       string;
  commentaire:     string | null;
  superviseur_nom: string | null;
}

export async function getCachedTeacherEvaluations(): Promise<TeacherEvalItem[]> {
  return (await getEncryptedItem<TeacherEvalItem[]>(TEACHER_EVALS_KEY)) ?? [];
}

export async function setCachedTeacherEvaluations(items: TeacherEvalItem[]): Promise<void> {
  await setEncryptedItem(TEACHER_EVALS_KEY, items);
}
