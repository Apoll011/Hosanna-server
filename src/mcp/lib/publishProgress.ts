/**
 * Resume state for services_publish across partial failures / retries.
 * Bound to orgId + clientRequestId. Completed reports are cached separately
 * so partial failures are NOT treated as final idempotent successes.
 */

type PublishPhase = "service_saved" | "agenda_saved" | "verified";

export type PublishProgress = {
  at: number;
  phase: PublishPhase;
  serviceId: string;
  serviceUpdatedAt: string;
  eventId?: string;
  eventUpdatedAt?: string;
};

export type PublishProgressInput = Omit<PublishProgress, "at">;

const progressStore = new Map<string, PublishProgress>();
const completedStore = new Map<string, { at: number; result: unknown }>();
const TTL_MS = 30 * 60 * 1000;

function progressKey(orgId: string, clientRequestId: string) {
  return `${orgId}:publish:${clientRequestId.trim()}`;
}

function completedKey(orgId: string, clientRequestId: string) {
  return `${orgId}:publish-done:${clientRequestId.trim()}`;
}

export function getPublishProgress(
  orgId: string,
  clientRequestId: string,
): PublishProgress | undefined {
  const k = progressKey(orgId, clientRequestId);
  const hit = progressStore.get(k);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    progressStore.delete(k);
    return undefined;
  }
  return hit;
}

export function setPublishProgress(
  orgId: string,
  clientRequestId: string,
  progress: PublishProgressInput,
): void {
  progressStore.set(progressKey(orgId, clientRequestId), {
    ...progress,
    at: Date.now(),
  });
}

export function clearPublishProgress(
  orgId: string,
  clientRequestId: string,
): void {
  progressStore.delete(progressKey(orgId, clientRequestId));
}

export function getCompletedPublish(
  orgId: string,
  clientRequestId: string,
): unknown | undefined {
  const k = completedKey(orgId, clientRequestId);
  const hit = completedStore.get(k);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    completedStore.delete(k);
    return undefined;
  }
  return hit.result;
}

export function setCompletedPublish(
  orgId: string,
  clientRequestId: string,
  result: unknown,
): void {
  completedStore.set(completedKey(orgId, clientRequestId), {
    at: Date.now(),
    result,
  });
  clearPublishProgress(orgId, clientRequestId);
}
