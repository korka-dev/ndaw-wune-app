/**
 * Traçage de l'utilisation des fonctionnalités (best-effort).
 *
 * Chaque ouverture d'écran appelle trackUsage("<feature>") : l'événement est
 * mis en file dans AsyncStorage puis envoyé au serveur par lots. En cas
 * d'échec réseau, les événements restent en file et seront renvoyés à la
 * prochaine ouverture d'écran — aucune fonctionnalité n'est bloquée.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usageApi } from "./api";

const USAGE_QUEUE_KEY = "ared_usage_queue";
const MAX_QUEUE = 200;

let flushing = false;

async function readQueue(): Promise<{ feature: string; at: string }[]> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(events: { feature: string; at: string }[]): Promise<void> {
  try {
    await AsyncStorage.setItem(USAGE_QUEUE_KEY, JSON.stringify(events.slice(-MAX_QUEUE)));
  } catch {
    /* silencieux */
  }
}

/** Enregistre l'ouverture d'une fonctionnalité et tente d'envoyer la file. */
export async function trackUsage(feature: string): Promise<void> {
  const queue = await readQueue();
  queue.push({ feature, at: new Date().toISOString() });
  await writeQueue(queue);
  flushUsage().catch(() => {});
}

/** Envoie la file d'événements au serveur (best-effort). */
export async function flushUsage(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const queue = await readQueue();
    if (!queue.length) return;
    await usageApi.record(queue);
    await writeQueue([]);
  } catch {
    // Hors-ligne ou erreur serveur → on garde la file pour plus tard
  } finally {
    flushing = false;
  }
}
