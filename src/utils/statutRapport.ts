/**
 * Statut lisible d'un rapport (retours terrain, RET02).
 *
 * Un statut local ne prouve pas la réception : « Reçu » n'est affiché que si
 * le serveur a renvoyé un identifiant. Les autres états sont distingués :
 * en attente d'envoi, à vérifier (rejeté après plusieurs essais, avec motif),
 * corrigé (nouvelle version), annulé.
 */
export type CodeStatut = "en_attente" | "a_verifier" | "recu" | "corrige" | "annule";

export interface StatutRapport {
  code:    CodeStatut;
  libelle: string;
  detail:  string | null;
  /** Envoi tardif : réception un autre jour que la date d'activité. */
  tardif:  boolean;
}

interface RapportMin {
  id: string;
  date_rapport: string;
  synced: number;
  server_id?: string | null;
  statut?: string | null;
  statut_motif?: string | null;
  recu_le?: string | null;
}

const jour = (iso: string) => iso.slice(0, 10);

export function dateCourte(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Motif compréhensible à partir du message d'erreur technique conservé dans la file. */
export function motifLisible(err: string | null | undefined): string {
  const e = (err ?? "").toLowerCase();
  if (!e) return "Le serveur n'a pas accepté l'envoi.";
  if (e.includes("401") || e.includes("403") || e.includes("session")) return "Session expirée : reconnectez-vous puis relancez l'envoi.";
  if (e.includes("409") || e.includes("conflit") || e.includes("conflict")) return "Un rapport différent existe déjà pour cet envoi : vérifiez la date et le contenu.";
  if (e.includes("413") || e.includes("too large") || e.includes("volumineu")) return "Envoi trop lourd (photos) : retirez ou réduisez une photo.";
  if (e.includes("422") || e.includes("invalide") || e.includes("valid")) return "Une information est refusée par le serveur (date, semaine ou champ obligatoire).";
  if (e.includes("network") || e.includes("timeout") || e.includes("réseau")) return "Réseau insuffisant pendant plusieurs essais.";
  return "Le serveur n'a pas accepté l'envoi.";
}

export function statutRapport(r: RapportMin, rejets: Map<string, string | null> = new Map()): StatutRapport {
  const recu = r.synced === 1 && !!r.server_id;
  const tardif = !!r.recu_le && jour(r.recu_le) > jour(r.date_rapport);
  if (r.statut === "annule") {
    return { code: "annule", libelle: "Annulé", detail: r.statut_motif ? `Motif : ${r.statut_motif}` : null, tardif };
  }
  if (r.statut === "corrige") {
    return { code: "corrige", libelle: "Corrigé", detail: r.statut_motif ? `Correction : ${r.statut_motif}` : null, tardif };
  }
  if (recu || r.synced === 1) {
    return {
      code: "recu",
      libelle: "Reçu",
      detail: r.recu_le ? `Reçu par le serveur le ${dateCourte(r.recu_le)}` : "Reçu par le serveur",
      tardif,
    };
  }
  if (rejets.has(r.id)) {
    return { code: "a_verifier", libelle: "À vérifier", detail: motifLisible(rejets.get(r.id)), tardif: false };
  }
  return {
    code: "en_attente",
    libelle: "En attente d'envoi",
    detail: "Enregistré sur le téléphone, pas encore reçu par le serveur. Il part dès que le réseau revient.",
    tardif: false,
  };
}

/** local_id → dernière erreur, pour les rapports archivés en échec (file « À vérifier »). */
export function rejetsParRapport(failed: { action: string; payload: string; last_error: string | null }[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const f of failed) {
    if (f.action !== "SUBMIT_RAPPORT_JOURNALIER") continue;
    try {
      const p = JSON.parse(f.payload);
      const id = p?.local_id ?? p?.client_op_id;
      if (id && !m.has(id)) m.set(String(id), f.last_error);
    } catch { /* charge illisible : ignorée */ }
  }
  return m;
}
