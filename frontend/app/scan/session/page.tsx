"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Plus, CheckCircle, AlertCircle, Loader2, ExternalLink, ArrowLeft } from "lucide-react";
import { api, getToken, type Scan } from "@/lib/api";
import { groupScansBySession, sessionLowestValue, type PricingMap } from "@/lib/session";

export default function SessionPage() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [pricing, setPricing] = useState<PricingMap>({});
  const [loading, setLoading] = useState(true);
  const [addingAll, setAddingAll] = useState(false);
  const [addProgress, setAddProgress] = useState<{ done: number; total: number; failed: string[] } | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    loadSession();
  }, []);

  async function loadSession() {
    try {
      // Fetch last 100 scans — more than enough for one session
      const all = await api.scanHistory(1, 100);
      // Take the most recent session
      const sessions = groupScansBySession(all);
      if (sessions.length === 0) { router.replace("/scan"); return; }
      const latest = sessions[0];
      setScans(latest.scans);
      setLoading(false);
      // Fetch pricing lazily for confirmed scans
      fetchPricing(latest.scans);
    } catch {
      router.replace("/scan");
    }
  }

  async function fetchPricing(sessionScans: Scan[]) {
    const confirmed = sessionScans.filter(
      (s) => (s.status === "manually_added" || s.status === "auto_added") && s.discogs_release_id
    );
    const pricingResult: PricingMap = {};
    for (const scan of confirmed) {
      if (!scan.discogs_release_id) continue;
      await new Promise((r) => setTimeout(r, 500)); // 0.5s rate-limit guard
      try {
        const res = await api.getPricing(scan.discogs_release_id);
        pricingResult[scan.discogs_release_id] = res.pricing;
        setPricing((prev) => ({ ...prev, [scan.discogs_release_id!]: res.pricing }));
      } catch {
        pricingResult[scan.discogs_release_id] = null;
      }
    }
  }

  function exportCSV() {
    const headers = ["Artist", "Title", "Year", "Label", "Catalog#", "Discogs Release ID", "Discogs URL", "Lowest Price", "Currency", "Status", "Scan Date"];
    const rows = scans.map((s) => {
      const p = s.discogs_release_id ? pricing[s.discogs_release_id] : null;
      return [
        s.artist ?? "",
        s.title ?? "",
        s.year ?? "",
        s.label ?? "",
        s.catalog_number ?? "",
        s.discogs_release_id ?? "",
        s.discogs_release_id ? `https://www.discogs.com/release/${s.discogs_release_id}` : "",
        p?.lowest ?? "",
        p?.currency ?? "",
        s.status,
        new Date(s.created_at).toLocaleDateString(),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vinylscan-session-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addAll() {
    const toAdd = scans.filter(
      (s) => s.status === "pending" && s.discogs_release_id
    );
    if (toAdd.length === 0) return;
    setAddingAll(true);
    abortRef.current = false;
    const failed: string[] = [];
    setAddProgress({ done: 0, total: toAdd.length, failed: [] });

    for (let i = 0; i < toAdd.length; i++) {
      if (abortRef.current) break;
      const scan = toAdd[i];
      try {
        await api.confirmScan(scan.id, scan.discogs_release_id!);
      } catch {
        failed.push(`${scan.artist ?? "?"} — ${scan.title ?? "?"}`);
      }
      setAddProgress({ done: i + 1, total: toAdd.length, failed: [...failed] });
      if (i < toAdd.length - 1) await new Promise((r) => setTimeout(r, 500));
    }
    setAddingAll(false);
    // Refresh scans after bulk add
    loadSession();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={32} className="animate-spin text-vinyl-muted" />
      </div>
    );
  }

  const added = scans.filter((s) => s.status === "manually_added" || s.status === "auto_added");
  const skipped = scans.filter((s) => s.status === "skipped");
  const unknown = scans.filter((s) => !s.artist && !s.title);
  const pendingWithRelease = scans.filter((s) => s.status === "pending" && s.discogs_release_id);
  const valueResult = sessionLowestValue(scans, pricing);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/scan" className="text-vinyl-muted hover:text-vinyl-text transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">Session Summary</h1>
      </div>

      {/* Stats */}
      <div className="card p-5 flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{scans.length}</p>
            <p className="text-xs text-vinyl-muted">Scanned</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">{added.length}</p>
            <p className="text-xs text-vinyl-muted">Added</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-vinyl-muted">{skipped.length + unknown.length}</p>
            <p className="text-xs text-vinyl-muted">Skipped</p>
          </div>
        </div>

        {valueResult ? (
          <div className="text-center border-t border-vinyl-border pt-3">
            <p className="text-sm text-vinyl-muted">
              Estimated value (lowest listed)
              {valueResult.coveredCount < valueResult.totalCount && (
                <span className="ml-1 text-xs opacity-60">
                  ({valueResult.coveredCount}/{valueResult.totalCount} priced)
                </span>
              )}
            </p>
            <p className="text-xl font-bold text-vinyl-gold">
              {valueResult.currency} {valueResult.total.toFixed(2)}
            </p>
          </div>
        ) : added.length > 0 ? (
          <p className="text-center text-xs text-vinyl-muted border-t border-vinyl-border pt-3">
            Pricing unavailable
          </p>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={exportCSV}
          className="btn-secondary flex-1 flex items-center justify-center gap-2"
        >
          <Download size={16} />
          Export CSV
        </button>
        {pendingWithRelease.length > 0 && !addingAll && (
          <button
            onClick={addAll}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            Add all to Discogs ({pendingWithRelease.length})
          </button>
        )}
      </div>

      {/* Add All Progress */}
      {addingAll && addProgress && (
        <div className="card p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-vinyl-accent" />
            <p className="text-sm">Adding {addProgress.done} of {addProgress.total}...</p>
          </div>
          {addProgress.failed.length > 0 && (
            <div className="text-xs text-vinyl-accent">
              Failed: {addProgress.failed.join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Post-add failure summary */}
      {!addingAll && addProgress && addProgress.failed.length > 0 && (
        <div className="card p-4 flex items-start gap-2 border-red-500/30 bg-red-500/10">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Some records failed to add:</p>
            <ul className="text-xs text-vinyl-muted mt-1 space-y-0.5">
              {addProgress.failed.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <button onClick={addAll} className="text-xs text-vinyl-accent hover:underline mt-2">
              Retry failed
            </button>
          </div>
        </div>
      )}

      {/* Record list */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-vinyl-muted uppercase tracking-wider">
          {scans.length} record{scans.length !== 1 ? "s" : ""}
        </h2>
        {scans.map((scan) => {
          const p = scan.discogs_release_id ? pricing[scan.discogs_release_id] : undefined;
          const isAdded = scan.status === "manually_added" || scan.status === "auto_added";
          return (
            <div key={scan.id} className={`card p-4 flex items-center gap-3 ${!isAdded && scan.status !== "pending" ? "opacity-50" : ""}`}>
              {scan.image_url && (
                <img src={scan.image_url} alt="" className="w-10 h-10 object-cover rounded flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {scan.artist && scan.title ? `${scan.artist} — ${scan.title}` : scan.artist || scan.title || <span className="italic text-vinyl-muted">Identification failed</span>}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {scan.year && <span className="text-xs text-vinyl-muted">{scan.year}</span>}
                  {p && <span className="text-xs text-vinyl-gold">{p.currency} {p.lowest.toFixed(2)}</span>}
                  {scan.discogs_release_id && (
                    <a href={`https://www.discogs.com/release/${scan.discogs_release_id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-vinyl-muted hover:text-vinyl-text flex items-center gap-0.5">
                      <ExternalLink size={10} /> Discogs
                    </a>
                  )}
                </div>
              </div>
              {isAdded && <CheckCircle size={16} className="text-green-400 flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
