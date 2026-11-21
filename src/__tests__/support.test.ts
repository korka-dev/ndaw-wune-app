/** APP-45 : références support et signalement des pannes serveur. */
jest.mock("react-native", () => ({ Platform: { OS: "android", Version: 34 } }));

import { corpsSignalement, doitSignaler, nouvelIdRequete, referenceRequete, routeAnonyme } from "../services/support";

const erreur = (status: number | undefined, url = "/app/seances/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed/finish?x=1") => ({
  config: { url, method: "post", headers: { "X-Request-ID": "mob-abc12345" } },
  response: status === undefined ? undefined : { status, headers: { "x-request-id": "mob-abc12345" } },
});

describe("support", () => {
  it("génère une référence de requête bien formée", () => {
    expect(nouvelIdRequete()).toMatch(/^mob-[0-9a-f]{20}$/);
  });

  it("anonymise la route (identifiants, paramètres, hôte)", () => {
    expect(routeAnonyme("https://api.x.org/api/v1/app/eleves/42?search=Fatou")).toBe("/api/v1/app/eleves/:n");
    expect(routeAnonyme(erreur(500).config.url)).toBe("/app/seances/:id/finish");
  });

  it("signale les 5xx une fois par minute et par route, jamais le réseau ni les refus", () => {
    const t = 1_000_000;
    expect(doitSignaler(erreur(undefined), t)).toBe(false);
    expect(doitSignaler(erreur(422), t)).toBe(false);
    expect(doitSignaler(erreur(502), t)).toBe(true);
    expect(doitSignaler(erreur(502), t + 1000)).toBe(false);
    expect(doitSignaler(erreur(502), t + 61_000)).toBe(true);
  });

  it("construit un signalement sans donnée personnelle", () => {
    const c = corpsSignalement(erreur(503), "1.2.0");
    expect(c).toMatchObject({ source: "mobile", statut_http: 503, methode: "POST", route: "/app/seances/:id/finish",
                              reference_requete: "mob-abc12345", app_version: "1.2.0" });
    expect(JSON.stringify(c)).not.toContain("Fatou");
    expect(referenceRequete(erreur(500))).toBe("mob-abc12345");
  });
});
