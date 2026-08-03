/**
 * Réhydratation de l'historique des rapports depuis le serveur.
 *
 * La base locale est vidée à la déconnexion ; le serveur, lui, conserve tout.
 * Ces tests vérifient que le retéléchargement ne crée pas de doublon, y compris
 * pour les rapports envoyés avant l'enregistrement du server_id.
 */
import {
  initDB,
  insertRapportJournalier,
  markRapportJournalierSynced,
  getRapportsJournalier,
  upsertRapportJournalierFromServer,
  clearAllLocalData,
} from "../services/db";

jest.mock("expo-secure-store");

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("expo-sqlite") as { __resetDB: () => void }).__resetDB();
  initDB();
});

const rapportLocal = (id: string, date = "2026-08-01") => ({
  id, date_rapport: date, ief: "Fatick", commune: "Diouroup", ecole: "EE Ndiaganiao",
  superviseur: "M. Faye", nom_tuteur: "M. Diouf", nb_absences: 0, absents: null,
  semaine: 3, jour_cours: 2, difficultes: '["Aucune"]',
  autres_difficultes: null, description_difficultes: null,
  directeur_venu: 1, besoin_appui: 0, domaines_appui: null,
  has_observations: 0, commentaires: null, soumis_en_offline: 0,
  photo_classe: null, photos_classe: null, reponses_questions: null,
});

const rapportServeur = (server_id: string, date = "2026-08-01") => ({
  server_id, date_rapport: date, ief: "Fatick", commune: "Diouroup", ecole: "EE Ndiaganiao",
  superviseur: "M. Faye", nom_tuteur: "M. Diouf", nb_absences: 0, absents: null,
  semaine: 3, jour_cours: 2, difficultes: '["Aucune"]',
  autres_difficultes: null, description_difficultes: null,
  directeur_venu: 1, besoin_appui: 0, domaines_appui: null,
  has_observations: 0, commentaires: null, soumis_en_offline: 0,
  photo_classe: null, photos_classe: null, reponses_questions: null,
  created_at: "2026-08-01T10:00:00Z",
});

describe("Historique des rapports après déconnexion / reconnexion", () => {
  test("après un logout, l'historique du serveur repeuple la base locale", () => {
    insertRapportJournalier(rapportLocal("rj_1"));
    markRapportJournalierSynced("rj_1", "uuid-serveur-1");
    expect(getRapportsJournalier()).toHaveLength(1);

    clearAllLocalData();                       // déconnexion
    expect(getRapportsJournalier()).toHaveLength(0);

    upsertRapportJournalierFromServer(rapportServeur("uuid-serveur-1"));
    const apres = getRapportsJournalier();
    expect(apres).toHaveLength(1);
    expect(apres[0].synced).toBe(1);
    expect(apres[0].server_id).toBe("uuid-serveur-1");
  });

  test("réhydrater deux fois ne duplique pas", () => {
    upsertRapportJournalierFromServer(rapportServeur("uuid-serveur-1"));
    upsertRapportJournalierFromServer(rapportServeur("uuid-serveur-1"));
    upsertRapportJournalierFromServer(rapportServeur("uuid-serveur-1"));
    expect(getRapportsJournalier()).toHaveLength(1);
  });

  test("un rapport envoyé sans server_id est rattaché, pas dupliqué", () => {
    // Ancien comportement : synced=1 mais aucun server_id enregistré
    insertRapportJournalier(rapportLocal("rj_ancien"));
    markRapportJournalierSynced("rj_ancien");        // sans id serveur
    expect(getRapportsJournalier()[0].server_id).toBeFalsy();

    upsertRapportJournalierFromServer(rapportServeur("uuid-serveur-1"));

    const apres = getRapportsJournalier();
    expect(apres).toHaveLength(1);                    // pas de doublon
    expect(apres[0].id).toBe("rj_ancien");            // la ligne d'origine
    expect(apres[0].server_id).toBe("uuid-serveur-1");// désormais supprimable
  });

  test("un rapport encore en attente d'envoi n'est pas écrasé", () => {
    insertRapportJournalier(rapportLocal("rj_attente", "2026-07-30"));  // synced=0
    upsertRapportJournalierFromServer(rapportServeur("uuid-serveur-9", "2026-08-01"));

    const apres = getRapportsJournalier();
    expect(apres).toHaveLength(2);
    expect(apres.find(r => r.id === "rj_attente")?.synced).toBe(0);
  });

  test("plusieurs rapports superviseur le même jour ne se confondent pas", () => {
    // Les rapports superviseur portent tous semaine=1 et jour_cours=1 : un
    // superviseur qui visite trois tuteurs dans la journée en soumet trois,
    // impossibles à distinguer par leur date. Le rattrapage doit tout de même
    // en apparier un par ligne, sans doublon ni perte.
    for (const id of ["s_a", "s_b", "s_c"]) {
      insertRapportJournalier({ ...rapportLocal(id), semaine: 1, jour_cours: 1 });
      markRapportJournalierSynced(id);                 // sans id serveur (ancien code)
    }
    expect(getRapportsJournalier()).toHaveLength(3);

    for (const sid of ["srv1", "srv2", "srv3"]) {
      upsertRapportJournalierFromServer({ ...rapportServeur(sid), semaine: 1, jour_cours: 1 });
    }

    const apres = getRapportsJournalier();
    expect(apres).toHaveLength(3);                              // ni doublon ni perte
    expect(new Set(apres.map(r => r.server_id)).size).toBe(3);  // trois ids distincts
    expect(apres.every(r => r.synced === 1)).toBe(true);
  });

  test("des rapports de dates différentes coexistent", () => {
    upsertRapportJournalierFromServer(rapportServeur("s1", "2026-08-01"));
    upsertRapportJournalierFromServer(rapportServeur("s2", "2026-07-31"));
    expect(getRapportsJournalier()).toHaveLength(2);
  });
});
