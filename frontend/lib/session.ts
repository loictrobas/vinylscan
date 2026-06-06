import type { Scan } from "./api";

export const SESSION_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface Session {
  id: string; // ISO start timestamp
  startedAt: Date;
  endedAt: Date;
  scans: Scan[];
}

/**
 * Group scans into sessions by time gap.
 * Scans within SESSION_GAP_MS of each other belong to the same session.
 * Input scans must be sorted newest-first (as returned by /scan/history).
 */
export function groupScansBySession(scans: Scan[], gapMs = SESSION_GAP_MS): Session[] {
  if (scans.length === 0) return [];

  // Work oldest-first internally
  const sorted = [...scans].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const sessions: Session[] = [];
  let current: Scan[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].created_at).getTime();
    const curr = new Date(sorted[i].created_at).getTime();
    if (curr - prev <= gapMs) {
      current.push(sorted[i]);
    } else {
      sessions.push(makeSession(current));
      current = [sorted[i]];
    }
  }
  sessions.push(makeSession(current));

  // Return newest-first
  return sessions.reverse();
}

function makeSession(scans: Scan[]): Session {
  const times = scans.map((s) => new Date(s.created_at).getTime());
  const startedAt = new Date(Math.min(...times));
  const endedAt = new Date(Math.max(...times));
  return {
    id: startedAt.toISOString(),
    startedAt,
    endedAt,
    scans,
  };
}

export interface PricingMap {
  [releaseId: number]: { lowest: number; currency: string } | null;
}

/**
 * Calculate total lowest-price value across confirmed scans in a session.
 * Returns null if no pricing data is available for any scan.
 */
export function sessionLowestValue(
  scans: Scan[],
  pricing: PricingMap
): { total: number; currency: string; coveredCount: number; totalCount: number } | null {
  const confirmed = scans.filter(
    (s) =>
      (s.status === "manually_added" || s.status === "auto_added") &&
      s.discogs_release_id != null
  );

  if (confirmed.length === 0) return null;

  let total = 0;
  let coveredCount = 0;
  let currency = "USD";

  for (const scan of confirmed) {
    const p = pricing[scan.discogs_release_id!];
    if (p) {
      total += p.lowest;
      currency = p.currency;
      coveredCount++;
    }
  }

  if (coveredCount === 0) return null;

  return { total, currency, coveredCount, totalCount: confirmed.length };
}

/**
 * Format a session date range as a human-readable label.
 * e.g. "Jun 5, 2026 · 14 records"
 */
export function sessionLabel(session: Session): string {
  const date = session.startedAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${date} · ${session.scans.length} record${session.scans.length !== 1 ? "s" : ""}`;
}
