import { routeAccueilPourRole, estInspecteur, ROUTE_INSPECTEUR } from "../utils/roleRoute";
import {
  messageErreurInspecteur, difficultesListe, reponsesLisibles, dateDebutPeriode, filtrerEcoles, cacheInspecteur,
} from "../utils/inspecteur";

describe("routage par rôle (lot L8)", () => {
  it("chaque rôle a son espace", () => {
    expect(routeAccueilPourRole("superviseur")).toBe("/(supervisor-tabs)/presences");
    expect(routeAccueilPourRole("inspecteur")).toBe(ROUTE_INSPECTEUR);
    expect(routeAccueilPourRole("enseignant")).toBe("/(tabs)/home");
    expect(routeAccueilPourRole(null)).toBe("/(tabs)/home");
  });

  it("estInspecteur", () => {
    expect(estInspecteur("inspecteur")).toBe(true);
    expect(estInspecteur("superviseur")).toBe(false);
    expect(estInspecteur(undefined)).toBe(false);
  });
});

describe("utilitaires de l'espace inspecteur", () => {
  it("messages d'erreur clairs", () => {
    expect(messageErreurInspecteur(new Error("Network Error"))).toMatch(/connexion/i);
    expect(messageErreurInspecteur({ response: { status: 404 } })).toMatch(/hors de votre IEF/);
    expect(messageErreurInspecteur({ response: { status: 403 } })).toMatch(/inspecteurs/);
  });

  it("difficultés en liste ou en JSON, sans « Aucune »", () => {
    expect(difficultesListe(["Lecture", "Aucune"])).toEqual(["Lecture"]);
    expect(difficultesListe('["Calcul"]')).toEqual(["Calcul"]);
    expect(difficultesListe(null)).toEqual([]);
  });

  it("réponses aux questions lisibles", () => {
    expect(reponsesLisibles({ "Q1": true, "Q2": ["a", "b"] })).toEqual([
      { question: "Q1", reponse: "Oui" }, { question: "Q2", reponse: "a, b" },
    ]);
    expect(reponsesLisibles([{ question: "Q", reponse: "R" }])).toEqual([{ question: "Q", reponse: "R" }]);
  });

  it("période → date de début", () => {
    const j = new Date(2026, 10, 24);
    expect(dateDebutPeriode("tout", j)).toBeUndefined();
    expect(dateDebutPeriode("7j", j)).toBe("2026-11-18");
    expect(dateDebutPeriode("30j", j)).toBe("2026-10-26");
  });

  it("recherche d'école insensible aux accents", () => {
    const e = [
      { nom: "École Thiès Nord", commune: "Thiès", directeur: "M. Diop", code_ecole: 101 },
      { nom: "Keur Massar", commune: "Pikine", directeur: null, code_ecole: 202 },
    ];
    expect(filtrerEcoles(e, "thies").map((x) => x.code_ecole)).toEqual([101]);
    expect(filtrerEcoles(e, "202")).toHaveLength(1);
    expect(filtrerEcoles(e, "  ")).toHaveLength(2);
  });

  it("cache mémoire vidé à la déconnexion", () => {
    cacheInspecteur.set("resume", { ief: "Thiès" });
    expect(cacheInspecteur.get("resume")).toEqual({ ief: "Thiès" });
    cacheInspecteur.clear();
    expect(cacheInspecteur.get("resume")).toBeUndefined();
  });
});
