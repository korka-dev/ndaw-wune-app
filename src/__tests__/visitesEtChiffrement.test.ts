/**
 * Lot L6 mobile : envoi d'une visite par la file (idempotence par
 * client_op_id) et ouverture de la base locale (APP-14) — repli sur la base
 * en clair quand SQLCipher n'est pas présent dans le binaire.
 */
jest.mock("../services/api", () => ({
  seancesApi: {}, rapportsApi: {}, rapportJournalierApi: {},
  superviseurApi: { envoyerVisite: jest.fn() },
}));
jest.mock("expo-secure-store");

import * as SQLite from "expo-sqlite";
import { superviseurApi } from "../services/api";
import { enqueueAction, getPendingActions, initDB, setLocalOwner } from "../services/db";
import { flushQueue } from "../services/queue";
import { BASE_CLAIRE, etatChiffrement, ouvrirBaseLocale } from "../services/dbCipher";

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("expo-sqlite") as { __resetDB: () => void }).__resetDB();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@react-native-async-storage/async-storage") as { __resetStore: () => void }).__resetStore();
  initDB();
  setLocalOwner("superviseur-1");
  jest.clearAllMocks();
});

test("SUBMIT_VISITE : envoyée telle quelle (client_op_id conservé) puis retirée de la file", async () => {
  (superviseurApi.envoyerVisite as jest.Mock).mockResolvedValue({ data: { id: "v1" } });
  const corps = { client_op_id: "op-123", teacher_id: "t1", grille_id: "g1", date_visite: "2026-11-20", reponses: [] };
  enqueueAction("SUBMIT_VISITE", corps);
  await flushQueue();
  expect(superviseurApi.envoyerVisite).toHaveBeenCalledWith(corps);
  expect(getPendingActions()).toHaveLength(0);
});

test("SUBMIT_VISITE : coupure réseau → reste en file pour un rejeu", async () => {
  (superviseurApi.envoyerVisite as jest.Mock).mockRejectedValue(Object.assign(new Error("Network Error"), { isAxiosError: true }));
  enqueueAction("SUBMIT_VISITE", { client_op_id: "op-456" });
  await flushQueue();
  expect(getPendingActions()).toHaveLength(1);
});

test("APP-14 : sans SQLCipher dans le binaire, on garde la base en clair (aucune perte)", () => {
  ouvrirBaseLocale();
  expect(etatChiffrement()).toBe("claire_sans_sqlcipher");
  expect(SQLite.openDatabaseSync).toHaveBeenLastCalledWith(BASE_CLAIRE);
  expect(SQLite.deleteDatabaseSync).not.toHaveBeenCalled();
});
