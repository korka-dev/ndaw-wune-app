/** Rapport V2 — APP-46 (compatibilité de version) et APP-08 (activation). */
import {
  isOutdated, parseVersion, isUpdateRequiredError, isPasswordChangeRequiredError,
} from "../services/appVersion";

describe("Comparaison de versions", () => {
  test("lecture", () => {
    expect(parseVersion("1.2")).toEqual([1, 2, 0]);
    expect(parseVersion("v2.0.10")).toEqual([2, 0, 10]);
    expect(parseVersion("abc")).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });

  test("version inférieure au minimum", () => {
    expect(isOutdated("1.0.0", "1.1.0")).toBe(true);
    expect(isOutdated("1.9.0", "1.10.0")).toBe(true);   // comparaison numérique, pas texte
  });

  test("version égale ou supérieure", () => {
    expect(isOutdated("1.1.0", "1.1.0")).toBe(false);
    expect(isOutdated("2.0", "1.10.3")).toBe(false);
  });

  test("valeur illisible ou absente : jamais bloquant", () => {
    expect(isOutdated(null, "1.0.0")).toBe(false);
    expect(isOutdated("1.0.0", "")).toBe(false);
    expect(isOutdated("dev", "1.0.0")).toBe(false);
  });
});

describe("Classement des erreurs API", () => {
  const err = (status: number, detail: unknown) => ({ response: { status, data: { detail } } });

  test("426 → mise à jour", () => {
    expect(isUpdateRequiredError(err(426, "APP_UPDATE_REQUIRED"))).toBe(true);
    expect(isUpdateRequiredError(err(500, "x"))).toBe(false);
    expect(isUpdateRequiredError(new Error("Network Error"))).toBe(false);
  });

  test("403 PASSWORD_CHANGE_REQUIRED → activation", () => {
    expect(isPasswordChangeRequiredError(err(403, "PASSWORD_CHANGE_REQUIRED"))).toBe(true);
    expect(isPasswordChangeRequiredError(err(403, "Accès refusé"))).toBe(false);
  });
});

describe("Mise à jour proposée à l'ouverture", () => {
  const { etatMiseAJour } = require("../services/appVersion");
  test("obligatoire sous le minimum, disponible sous la dernière version", () => {
    expect(etatMiseAJour("1.3.0", { min_version: "1.4.1", latest_version: "1.4.1" })).toBe("obligatoire");
    expect(etatMiseAJour("1.4.1", { min_version: "1.4.0", latest_version: "1.5.0" })).toBe("disponible");
    expect(etatMiseAJour("1.5.0", { min_version: "1.4.0", latest_version: "1.5.0" })).toBeNull();
    expect(etatMiseAJour("1.4.1", { min_version: null, latest_version: null })).toBeNull();
    expect(etatMiseAJour("1.4.1", null)).toBeNull();
  });
});
