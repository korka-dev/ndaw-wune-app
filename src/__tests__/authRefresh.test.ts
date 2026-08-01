/**
 * Régression — un incident réseau ne doit JAMAIS déconnecter l'utilisateur.
 *
 * Avant correction, tout échec du refresh (coupure réseau, timeout, 502 pendant
 * un redéploiement) effaçait les tokens et renvoyait au login, alors que la
 * session était valide.
 */
import { doitDeconnecter, SessionInvalide } from "../services/api";

const reponse = (status: number) => ({ response: { status }, message: "err" });

describe("Décision de déconnexion après échec du refresh", () => {
  test("le serveur rejette la session → déconnexion", () => {
    expect(doitDeconnecter(reponse(401))).toBe(true);
    expect(doitDeconnecter(reponse(403))).toBe(true);
    expect(doitDeconnecter(new SessionInvalide("plus de refresh token"))).toBe(true);
  });

  test("incident réseau ou serveur → on garde la session", () => {
    expect(doitDeconnecter(new Error("Network Error"))).toBe(false);   // hors-ligne
    expect(doitDeconnecter({ code: "ECONNABORTED" })).toBe(false);      // timeout
    expect(doitDeconnecter(reponse(500))).toBe(false);
    expect(doitDeconnecter(reponse(502))).toBe(false);                  // redéploiement
    expect(doitDeconnecter(reponse(503))).toBe(false);
    expect(doitDeconnecter(reponse(504))).toBe(false);
  });

  test("valeurs inattendues ne provoquent pas de déconnexion", () => {
    expect(doitDeconnecter(undefined)).toBe(false);
    expect(doitDeconnecter(null)).toBe(false);
    expect(doitDeconnecter("boom")).toBe(false);
  });
});
