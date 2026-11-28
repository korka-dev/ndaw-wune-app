import { roleEspace, routeAccueilPourRole, ROUTE_SUPERVISEUR, ROUTE_TUTEUR, ROUTE_INSPECTEUR } from "../utils/roleRoute";

describe("roleEspace", () => {
  it("suit l'espace annoncé par le serveur", () => {
    expect(roleEspace({ role: "coordonnateur", espace_mobile: "superviseur" })).toBe("superviseur");
    expect(roleEspace({ role: "enseignant", espace_mobile: "tuteur" })).toBe("enseignant");
    expect(roleEspace({ role: "inspecteur", espace_mobile: "inspecteur" })).toBe("inspecteur");
    expect(roleEspace({ role: "admin", espace_mobile: null })).toBeNull();
  });

  it("sans espace annoncé (ancienne API), range un coordonnateur chez les superviseurs", () => {
    expect(roleEspace({ role: "superviseur" })).toBe("superviseur");
    expect(roleEspace({ role: "coordonnateur", title: null })).toBe("superviseur");
    expect(roleEspace({ role: "coordonnateur", title: " Evaluateur " })).toBeNull();
    expect(roleEspace({ role: "admin" })).toBeNull();
    expect(roleEspace(null)).toBeNull();
  });

  it("un superviseur n'atterrit jamais dans l'espace tuteur", () => {
    expect(routeAccueilPourRole(roleEspace({ role: "coordonnateur", espace_mobile: "superviseur" }))).toBe(ROUTE_SUPERVISEUR);
    expect(routeAccueilPourRole(roleEspace({ role: "superviseur" }))).toBe(ROUTE_SUPERVISEUR);
    expect(routeAccueilPourRole(roleEspace({ role: "inspecteur" }))).toBe(ROUTE_INSPECTEUR);
    expect(routeAccueilPourRole(roleEspace({ role: "enseignant" }))).toBe(ROUTE_TUTEUR);
  });
});
