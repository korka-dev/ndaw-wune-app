/** Lot L8 — cache hors ligne de l'inspecteur : isolation par compte, purge, limite. */
jest.mock("expo-secure-store");

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  cacheInspecteur, estPersistable, limiterRapports, PREFIXE_CACHE, CLE_PROPRIETAIRE, MAX_RAPPORTS,
} from "../services/inspecteurCache";
import { categoriesPour, destinatairePour } from "../utils/remarques";

const { __resetStore } = jest.requireMock("@react-native-async-storage/async-storage");

/** Simule un redémarrage : la mémoire est perdue, le stockage reste. */
async function redemarrer(owner: string) {
  // purger() viderait aussi le stockage : on sauvegarde puis restaure.
  const k = [CLE_PROPRIETAIRE, PREFIXE_CACHE + owner];
  const sauv = await Promise.all(k.map((x) => AsyncStorage.getItem(x)));
  await cacheInspecteur.purger();
  await Promise.all(k.map((x, i) => (sauv[i] !== null ? AsyncStorage.setItem(x, sauv[i] as string) : undefined)));
  await cacheInspecteur.ouvrir(owner);
}

beforeEach(async () => {
  await cacheInspecteur.purger();
  __resetStore();
});

describe("cache persistant de l'inspecteur", () => {
  it("persiste résumé, écoles, personnes et 1re page de rapports, pas le reste", () => {
    expect(estPersistable("resume")).toBe(true);
    expect(estPersistable("ecoles")).toBe(true);
    expect(estPersistable("personnes:e1")).toBe(true);
    expect(estPersistable("rapports:{}")).toBe(true);
    expect(estPersistable('rapports:{"ecole_id":"e1"}')).toBe(true);
    expect(estPersistable('rapports:{"besoin_appui":true}')).toBe(false);
    expect(estPersistable("rapport:r1")).toBe(false);
  });

  it("relit les données du même compte après redémarrage, avec leur date", async () => {
    await cacheInspecteur.ouvrir("insp-1");
    cacheInspecteur.set("resume", { ief: "Thiès" }, 1_000);
    cacheInspecteur.set("rapports:{}", { total: 1, items: [{ id: "r1", nb_absences: 2, absents: null }] });
    await cacheInspecteur.ecrit();

    await redemarrer("insp-1");
    expect(cacheInspecteur.get("resume")).toEqual({ ief: "Thiès" });
    expect(cacheInspecteur.dateDe("resume")).toBe(1_000);
    // détail consultable hors ligne depuis la liste
    expect(cacheInspecteur.get<{ id: string }>("rapport:r1")?.id).toBe("r1");
  });

  it("n'est jamais montré à un autre compte", async () => {
    await cacheInspecteur.ouvrir("insp-1");
    cacheInspecteur.set("ecoles", [{ id: "e1" }]);
    await cacheInspecteur.ecrit();

    await cacheInspecteur.ouvrir("insp-2");
    expect(cacheInspecteur.get("ecoles")).toBeUndefined();
    // les données du compte précédent sont supprimées du téléphone
    expect(await AsyncStorage.getItem(PREFIXE_CACHE + "insp-1")).toBeNull();
    expect(await AsyncStorage.getItem(CLE_PROPRIETAIRE)).toBe("insp-2");
  });

  it("est vidé à la déconnexion (mémoire et téléphone)", async () => {
    await cacheInspecteur.ouvrir("insp-1");
    cacheInspecteur.set("resume", { ief: "Thiès" });
    await cacheInspecteur.ecrit();
    expect(await AsyncStorage.getItem(PREFIXE_CACHE + "insp-1")).not.toBeNull();

    await cacheInspecteur.purger();
    expect(cacheInspecteur.get("resume")).toBeUndefined();
    expect(await AsyncStorage.getItem(PREFIXE_CACHE + "insp-1")).toBeNull();
    expect(await AsyncStorage.getItem(CLE_PROPRIETAIRE)).toBeNull();
    expect(await cacheInspecteur.dernierProprietaire()).toBeNull();
  });

  it("limite le nombre de rapports gardés (listes les plus récentes d'abord)", () => {
    const page = (n: number, at: number) => ({ v: { total: n, items: Array.from({ length: n }, (_, i) => ({ id: `${at}-${i}` })) }, at });
    const out = limiterRapports({
      resume: { v: {}, at: 1 },
      "rapports:{}": page(150, 3),
      'rapports:{"ecole_id":"a"}': page(40, 2),
      'rapports:{"ecole_id":"b"}': page(20, 1),
    }, MAX_RAPPORTS);
    expect(Object.keys(out).sort()).toEqual(["rapports:{\"ecole_id\":\"a\"}", "rapports:{}", "resume"].sort());
  });
});

describe("signalement de l'inspecteur", () => {
  it("catégories réduites et jamais « mon superviseur »", () => {
    const cats = categoriesPour("inspecteur").map((c) => c.key);
    expect(cats).toEqual(["application", "autre"]);
    expect(destinatairePour("application", "inspecteur").code).toBe("support_technique");
    expect(destinatairePour("autre", "inspecteur").code).toBe("equipe_programme");
    expect(destinatairePour("pedagogie", "inspecteur").code).not.toBe("superviseur");
    expect(categoriesPour("enseignant").length).toBeGreaterThan(2);
  });
});
