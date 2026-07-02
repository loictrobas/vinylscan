/**
 * In-memory retry queue for shots that failed to upload (no network, backend
 * unreachable). Shots survive network drops during a shooting session — the
 * common failure in a storage room with bad wifi — but not an app kill, since
 * image bytes are too big for localStorage and no Filesystem plugin is wired.
 *
 * "Same record" follow-up shots reference the previous shot by local id; when
 * the queue flushes, the chain is resolved to real server scan_ids in order.
 */
import { api } from "./api";

export interface QueuedShot {
  localId: string;
  file: File;
  /** null → new scan; otherwise enhance target: a server scan_id or the localId of an earlier queued shot */
  enhanceTarget: string | null;
  queuedAt: number;
}

type Listener = (count: number) => void;

let queue: QueuedShot[] = [];
let flushing = false;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l(queue.length);
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue.length);
  return () => { listeners.delete(listener); };
}

export function queuedCount(): number {
  return queue.length;
}

export function enqueueShot(file: File, enhanceTarget: string | null): QueuedShot {
  const shot: QueuedShot = {
    localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    enhanceTarget,
    queuedAt: Date.now(),
  };
  queue.push(shot);
  notify();
  return shot;
}

/** Network-level failure (fetch TypeError) or 5xx — worth retrying later.
 *  4xx (bad image, no credits, auth) is not: retrying can't fix those. */
export function isRetryable(e: unknown): boolean {
  const status = (e as { status?: number }).status;
  return status === undefined || status >= 500;
}

export interface FlushResult {
  sent: number;
  failed: number;
  lastScanId: string | null;
}

/**
 * Upload queued shots in FIFO order. Local-id enhance chains resolve through
 * the localId→scan_id map as uploads succeed; an enhance whose target never
 * resolved falls back to a fresh scan rather than being dropped.
 * Stops at the first retryable failure (network still down) and keeps the rest.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (flushing || queue.length === 0) return { sent: 0, failed: 0, lastScanId: null };
  flushing = true;
  const localToServer = new Map<string, string>();
  let sent = 0;
  let failed = 0;
  let lastScanId: string | null = null;

  try {
    while (queue.length > 0) {
      const shot = queue[0];
      let target = shot.enhanceTarget;
      if (target && target.startsWith("local-")) {
        target = localToServer.get(target) ?? null;
      }
      try {
        const ack = target
          ? await api.enhanceScan(target, shot.file)
          : await api.uploadScan(shot.file);
        localToServer.set(shot.localId, ack.scan_id);
        lastScanId = ack.scan_id;
        sent += 1;
        queue.shift();
        notify();
      } catch (e) {
        if (isRetryable(e)) break; // network still down — keep queue intact
        queue.shift(); // permanent failure (4xx) — drop this shot, try the rest
        failed += 1;
        notify();
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return { sent, failed, lastScanId };
}
