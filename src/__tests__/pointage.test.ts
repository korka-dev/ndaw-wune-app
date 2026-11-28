import { entreesPointage, jourCoursServeur, messageErreurPointage } from "../utils/pointage";

describe("pointage superviseur", () => {
  it("envoie le numéro du jour (1 = Jour 1), jamais 0", () => {
    expect(jourCoursServeur(0)).toBe(1);
    expect(jourCoursServeur(2)).toBe(3);
    expect(jourCoursServeur(null)).toBeNull();
    expect(jourCoursServeur(-1)).toBeNull();
  });

  it("n'envoie que les tuteurs pointés, motif seulement pour un absent", () => {
    expect(entreesPointage([
      { id: "a", present: true, motif: "x" },
      { id: "b", present: false, motif: "Maladie" },
      { id: "c", present: false, motif: null },
      { id: "d", present: null, motif: null },
    ])).toEqual([
      { teacher_id: "a", present: true, motif: null },
      { teacher_id: "b", present: false, motif: "Maladie" },
      { teacher_id: "c", present: false, motif: "Non justifié" },
    ]);
  });

  it("distingue absence de réseau et refus du serveur", () => {
    expect(messageErreurPointage(new Error("Network Error"))).toBeNull();
    expect(messageErreurPointage({ response: { status: 422, data: { detail: "date_jour invalide" } } }))
      .toBe("Pointage non enregistré : date_jour invalide");
    expect(messageErreurPointage({ response: { status: 403, data: {} } })).toMatch(/plus assignés/);
  });
});
