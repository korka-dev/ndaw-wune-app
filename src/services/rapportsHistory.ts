/**
 * Historique des rapports journaliers — récupération depuis le serveur.
 *
 * Les rapports soumis sont enregistrés à la fois dans la base locale (pour le
 * hors-ligne) et dans la base de données du serveur. Or la base locale est
 * entièrement vidée à la déconnexion : sans cette réhydratation, un tuteur qui
 * se reconnecte retrouvait un historique vide alors que tous ses rapports
 * étaient bien conservés côté serveur.
 *
 * On retélécharge donc l'historique et on le réinjecte en local, marqué comme
 * déjà synchronisé. Les rapports encore en attente d'envoi (synced = 0) ne sont
 * pas touchés : ils n'existent pas encore côté serveur.
 */
import { rapportJournalierApi } from "./api";
import { upsertRapportJournalierFromServer } from "./db";

/** Nombre de rapports rapatriés au maximum (≈ une année scolaire complète). */
const MAX_RAPPORTS = 200;
const PAGE_SIZE = 50;

const bool01 = (v: unknown): number => (v === true || v === 1 ? 1 : 0);

/**
 * Télécharge l'historique du serveur et le réinjecte dans la base locale.
 * @returns le nombre de rapports rapatriés, 0 en cas d'échec (jamais d'exception :
 *          l'écran doit rester utilisable hors-ligne).
 */
export async function hydrateRapportsFromServer(): Promise<number> {
  let importes = 0;
  try {
    for (let page = 0; page * PAGE_SIZE < MAX_RAPPORTS; page++) {
      const { data } = await rapportJournalierApi.list(page, PAGE_SIZE);
      const items: any[] = data?.items ?? [];
      if (items.length === 0) break;

      for (const r of items) {
        upsertRapportJournalierFromServer({
          server_id:               String(r.id),
          date_rapport:            String(r.date_rapport),
          ief:                     r.ief ?? "",
          commune:                 r.commune ?? "",
          ecole:                   r.ecole ?? "",
          superviseur:             r.superviseur ?? "",
          nom_tuteur:              r.nom_tuteur ?? "",
          nb_absences:             Number(r.nb_absences ?? 0),
          absents:                 r.absents ?? null,
          semaine:                 Number(r.semaine ?? 0),
          jour_cours:              Number(r.jour_cours ?? 0),
          difficultes:             r.difficultes ?? "[]",
          autres_difficultes:      r.autres_difficultes ?? null,
          description_difficultes: r.description_difficultes ?? null,
          directeur_venu:          bool01(r.directeur_venu),
          besoin_appui:            bool01(r.besoin_appui),
          domaines_appui:          r.domaines_appui ?? null,
          has_observations:        bool01(r.has_observations),
          commentaires:            r.commentaires ?? null,
          soumis_en_offline:       bool01(r.soumis_en_offline),
          // Les photos sont stockées côté serveur : on conserve l'URL renvoyée.
          photo_classe:            r.photo_classe_url ?? null,
          photos_classe:           r.photos_classe_url ?? null,
          reponses_questions:      r.reponses_questions ?? null,
          created_at:              String(r.created_at ?? new Date().toISOString()),
        });
        importes++;
      }

      if (items.length < PAGE_SIZE) break;   // dernière page
    }
  } catch (e) {
    console.warn("[Rapports] Historique serveur indisponible :", e);
  }
  return importes;
}
