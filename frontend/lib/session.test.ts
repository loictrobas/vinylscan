import { describe, it, expect } from "vitest";
import { groupScansBySession, sessionLowestValue, SESSION_GAP_MS } from "./session";
import type { Scan } from "./api";

function makeScan(overrides: Partial<Scan> & { created_at: string }): Scan {
  return {
    id: Math.random().toString(36).slice(2),
    image_url: "/img.jpg",
    artist: "Test Artist",
    title: "Test Title",
    year: 2020,
    label: null,
    catalog_number: null,
    confidence: 90,
    discogs_release_id: null,
    status: "pending",
    credit_deducted: false,
    ...overrides,
  };
}

describe("groupScansBySession", () => {
  it("returns empty array for empty input", () => {
    expect(groupScansBySession([])).toEqual([]);
  });

  it("returns single session for one scan", () => {
    const scans = [makeScan({ created_at: "2026-06-05T10:00:00Z" })];
    const sessions = groupScansBySession(scans);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].scans).toHaveLength(1);
  });

  it("groups scans within gap into one session", () => {
    const base = new Date("2026-06-05T10:00:00Z").getTime();
    const scans = [
      makeScan({ created_at: new Date(base).toISOString() }),
      makeScan({ created_at: new Date(base + 30 * 60 * 1000).toISOString() }), // +30min
      makeScan({ created_at: new Date(base + 90 * 60 * 1000).toISOString() }), // +90min
    ];
    const sessions = groupScansBySession(scans);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].scans).toHaveLength(3);
  });

  it("splits scans across gap into two sessions", () => {
    const base = new Date("2026-06-05T10:00:00Z").getTime();
    const scans = [
      makeScan({ created_at: new Date(base).toISOString() }),
      makeScan({ created_at: new Date(base + SESSION_GAP_MS + 1000).toISOString() }), // just over 2h
    ];
    const sessions = groupScansBySession(scans);
    expect(sessions).toHaveLength(2);
  });

  it("scans exactly at gap boundary stay in same session", () => {
    const base = new Date("2026-06-05T10:00:00Z").getTime();
    const scans = [
      makeScan({ created_at: new Date(base).toISOString() }),
      makeScan({ created_at: new Date(base + SESSION_GAP_MS).toISOString() }), // exactly 2h
    ];
    const sessions = groupScansBySession(scans);
    expect(sessions).toHaveLength(1);
  });

  it("returns sessions newest-first", () => {
    const base = new Date("2026-06-05T10:00:00Z").getTime();
    const scans = [
      makeScan({ created_at: new Date(base).toISOString() }),
      makeScan({ created_at: new Date(base + SESSION_GAP_MS + 1000).toISOString() }),
    ];
    const sessions = groupScansBySession(scans);
    expect(sessions[0].startedAt.getTime()).toBeGreaterThan(sessions[1].startedAt.getTime());
  });

  it("handles unsorted input correctly", () => {
    const base = new Date("2026-06-05T10:00:00Z").getTime();
    // Provide newest-first (as API returns)
    const scans = [
      makeScan({ created_at: new Date(base + 90 * 60 * 1000).toISOString() }),
      makeScan({ created_at: new Date(base + 30 * 60 * 1000).toISOString() }),
      makeScan({ created_at: new Date(base).toISOString() }),
    ];
    const sessions = groupScansBySession(scans);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].scans).toHaveLength(3);
  });
});

describe("sessionLowestValue", () => {
  it("returns null for empty scans", () => {
    expect(sessionLowestValue([], {})).toBeNull();
  });

  it("returns null when no confirmed scans", () => {
    const scans = [makeScan({ created_at: "2026-06-05T10:00:00Z", status: "pending" })];
    expect(sessionLowestValue(scans, {})).toBeNull();
  });

  it("returns null when confirmed but no pricing data", () => {
    const scans = [
      makeScan({
        created_at: "2026-06-05T10:00:00Z",
        status: "manually_added",
        discogs_release_id: 123,
      }),
    ];
    expect(sessionLowestValue(scans, {})).toBeNull();
  });

  it("sums pricing for all confirmed scans", () => {
    const scans = [
      makeScan({ created_at: "2026-06-05T10:00:00Z", status: "manually_added", discogs_release_id: 1 }),
      makeScan({ created_at: "2026-06-05T10:01:00Z", status: "manually_added", discogs_release_id: 2 }),
    ];
    const pricing = {
      1: { lowest: 10.0, currency: "USD" },
      2: { lowest: 20.0, currency: "USD" },
    };
    const result = sessionLowestValue(scans, pricing);
    expect(result).not.toBeNull();
    expect(result!.total).toBeCloseTo(30.0);
    expect(result!.coveredCount).toBe(2);
    expect(result!.totalCount).toBe(2);
  });

  it("handles partial pricing — only counts scans with pricing", () => {
    const scans = [
      makeScan({ created_at: "2026-06-05T10:00:00Z", status: "manually_added", discogs_release_id: 1 }),
      makeScan({ created_at: "2026-06-05T10:01:00Z", status: "manually_added", discogs_release_id: 2 }),
    ];
    const pricing = { 1: { lowest: 15.0, currency: "EUR" } }; // no data for release 2
    const result = sessionLowestValue(scans, pricing);
    expect(result).not.toBeNull();
    expect(result!.total).toBeCloseTo(15.0);
    expect(result!.coveredCount).toBe(1);
    expect(result!.totalCount).toBe(2);
  });
});
