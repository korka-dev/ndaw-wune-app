import { statutRapport, motifLisible, rejetsParRapport } from "../utils/statutRapport";

describe("statutRapport (RET02)", () => {
  const base = { id: "l1", date_rapport: "2026-11-20", synced: 0 };

  it("en attente tant que le serveur n'a rien confirmé", () => {
    expect(statutRapport(base).code).toBe("en_attente");
  });

  it("reçu avec date de réception et envoi tardif", () => {
    const s = statutRapport({ ...base, synced: 1, server_id: "s1", recu_le: "2026-11-21T08:00:00Z" });
    expect(s.code).toBe("recu");
    expect(s.tardif).toBe(true);
  });

  it("à vérifier quand la file l'a rejeté, avec un motif lisible", () => {
    const rejets = rejetsParRapport([{ action: "SUBMIT_RAPPORT_JOURNALIER", payload: JSON.stringify({ local_id: "l1" }), last_error: "HTTP 413" }]);
    const s = statutRapport(base, rejets);
    expect(s.code).toBe("a_verifier");
    expect(s.detail).toMatch(/photo/i);
  });

  it("annulé et corrigé priment", () => {
    expect(statutRapport({ ...base, synced: 1, server_id: "s", statut: "annule" }).code).toBe("annule");
    expect(statutRapport({ ...base, synced: 1, server_id: "s", statut: "corrige" }).code).toBe("corrige");
  });

  it("motif par défaut sans erreur", () => {
    expect(motifLisible(null)).toMatch(/serveur/);
  });
});
