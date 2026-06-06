"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Disc3, RefreshCw, CheckCircle2, AlertCircle, ExternalLink,
  Loader2, Clock, ArrowDownToLine,
} from "lucide-react";
import { api, getToken, type DiscogsSyncStatus, type User } from "@/lib/api";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sync, setSync] = useState<DiscogsSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    Promise.all([api.me(), api.discogsSyncStatus()])
      .then(([u, s]) => { setUser(u); setSync(s); })
      .catch(() => router.replace("/"))
      .finally(() => setLoading(false));
  }, [router]);

  // Poll while running
  useEffect(() => {
    if (sync?.status === "running") {
      pollRef.current = setInterval(async () => {
        const s = await api.discogsSyncStatus().catch(() => null);
        if (s) {
          setSync(s);
          if (s.status !== "running" && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 2000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sync?.status]);

  async function startSync() {
    const s = await api.discogsStartSync();
    setSync(s);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Disc3 size={24} className="animate-spin text-vs-muted" />
      </div>
    );
  }

  const isRunning = sync?.status === "running";
  const pct = sync && sync.total > 0
    ? Math.round(((sync.imported + sync.skipped) / sync.total) * 100)
    : 0;

  return (
    <div className="px-6 py-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-medium">Settings</h1>
        <p className="text-sm text-vs-text-2 mt-0.5">Account &amp; integrations</p>
      </div>

      {/* Discogs connection */}
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-vs-accent/10 border border-vs-accent/20 flex items-center justify-center">
              <Disc3 size={16} className="text-vs-accent" />
            </div>
            <div>
              <p className="text-sm font-medium">Discogs</p>
              <p className="text-xs text-vs-muted">Collection sync &amp; identity</p>
            </div>
          </div>
          <span className="pill-in-stock">
            <span className="w-1.5 h-1.5 rounded-full bg-vs-success" />
            Connected
          </span>
        </div>

        <div className="bg-vs-raised rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-vs-muted">Signed in as</p>
              <p className="text-sm font-medium text-vs-text">{user?.discogs_username}</p>
            </div>
            <a
              href={`https://www.discogs.com/user/${user?.discogs_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-vs-muted hover:text-vs-accent"
            >
              <ExternalLink size={14} />
            </a>
          </div>
          {sync?.last_sync && (
            <p className="text-xs text-vs-muted mt-2 flex items-center gap-1.5">
              <Clock size={11} />
              Last synced {fmtDate(sync.last_sync)}
            </p>
          )}
        </div>

        {/* Sync section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-medium">Collection sync</p>
            {!isRunning && (
              <button onClick={startSync} className="btn-primary flex items-center gap-1.5 py-1.5 text-xs">
                {sync?.status === "done"
                  ? <><RefreshCw size={12} />Re-sync</>
                  : <><ArrowDownToLine size={12} />Import collection</>
                }
              </button>
            )}
          </div>
          <p className="text-xs text-vs-muted mb-3">
            Import your entire Discogs collection into the app. Records already in your catalog are skipped.
            New records added here are automatically pushed to your Discogs collection too.
          </p>

          {isRunning && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 size={14} className="animate-spin text-vs-accent" />
                <span className="text-vs-text-2">
                  Importing{sync.total > 0 ? ` ${sync.imported + sync.skipped} / ${sync.total}` : "…"}
                </span>
              </div>
              {sync.total > 0 && (
                <div className="h-1.5 bg-vs-raised rounded-full overflow-hidden">
                  <div
                    className="h-full bg-vs-accent rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-vs-muted">
                {sync.imported} new · {sync.skipped} skipped
              </p>
            </div>
          )}

          {sync?.status === "done" && !isRunning && (
            <div className="flex items-start gap-2 p-3 bg-vs-success/5 border border-vs-success/20 rounded-lg">
              <CheckCircle2 size={14} className="text-vs-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-vs-success font-medium">Sync complete</p>
                <p className="text-xs text-vs-text-2 mt-0.5">
                  {sync.imported} records imported · {sync.skipped} already in catalog
                  {sync.finished_at && ` · ${fmtDate(sync.finished_at)}`}
                </p>
              </div>
            </div>
          )}

          {sync?.status === "error" && (
            <div className="flex items-start gap-2 p-3 bg-vs-danger/5 border border-vs-danger/20 rounded-lg">
              <AlertCircle size={14} className="text-vs-danger flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-vs-danger font-medium">Sync failed</p>
                <p className="text-xs text-vs-text-2 mt-0.5">{sync.error}</p>
              </div>
            </div>
          )}

          {(!sync || sync.status === "idle") && !isRunning && (
            <div className="p-3 bg-vs-raised rounded-lg text-xs text-vs-muted">
              No sync run yet. Click "Import collection" to pull your Discogs library.
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="border-t border-vs-border pt-4">
          <p className="text-xs font-medium text-vs-text-2 mb-2">How it works</p>
          <ul className="space-y-1.5 text-xs text-vs-muted">
            <li className="flex items-start gap-2">
              <span className="text-vs-accent mt-0.5">→</span>
              <span>Import pulls every release from your Discogs collection. Existing records are untouched.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-vs-accent mt-0.5">→</span>
              <span>Condition defaults to VG+. Edit individually after import.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-vs-accent mt-0.5">→</span>
              <span>Adding a record here (with a Discogs release ID) automatically adds it to your Discogs collection.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-vs-accent mt-0.5">→</span>
              <span>Synced records show a Discogs link in the catalog.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Account section */}
      <div className="card p-5">
        <p className="text-sm font-medium mb-3">Account</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-vs-text">{user?.discogs_username}</p>
            <p className="text-xs text-vs-muted">{user?.credits} scan credits remaining</p>
          </div>
          <a href={api.loginUrl()} className="btn-secondary text-xs">
            Reconnect Discogs
          </a>
        </div>
      </div>
    </div>
  );
}
