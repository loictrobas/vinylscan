"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Disc3, RefreshCw, CheckCircle2, AlertCircle, ExternalLink,
  Loader2, Clock, ArrowDownToLine, Image, Shield, TrendingUp,
} from "lucide-react";
import { api, getToken, clearMeCache, isStore, isCollector, type DiscogsSyncStatus, type User } from "@/lib/api";

function ClaimAdminCard({ onClaimed }: { onClaimed: () => void }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setLoading(true);
    setError(null);
    try {
      await api.claimAdmin();
      setDone(true);
      onClaimed();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg.includes("already exists") ? "An admin already exists — contact them to grant you access." : msg);
    } finally {
      setLoading(false);
    }
  }

  if (done) return null; // card disappears after success

  return (
    <div className="card p-5 border-dashed border-vs-border/60">
      <div className="flex items-start gap-3">
        <Shield size={18} className="text-vs-muted mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-vs-text mb-0.5">Claim admin access</p>
          <p className="text-xs text-vs-muted mb-3">
            No admin exists yet. Click once to make this account the administrator.
            This option disappears permanently once claimed.
          </p>
          {error && <p className="text-xs text-vs-danger mb-2">{error}</p>}
          <button onClick={claim} disabled={loading} className="btn-secondary text-xs flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
            {loading ? "Claiming…" : "Claim admin"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface BackfillStatus {
  status: string;
  total: number;
  checked: number;
  updated: number;
  error: string | null;
}

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
  const [accountTypeSaving, setAccountTypeSaving] = useState(false);
  const [backfill, setBackfill] = useState<BackfillStatus | null>(null);
  const [marketBackfill, setMarketBackfill] = useState<{ status: string; total: number; processed: number; updated: number; error: string | null } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backfillPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const marketPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    Promise.all([api.me(), api.discogsSyncStatus(), api.discogsBackfillStatus()])
      .then(([u, s, b]) => { setUser(u); setSync(s); setBackfill(b); })
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

  // Poll backfill while running
  useEffect(() => {
    if (backfill?.status === "running") {
      backfillPollRef.current = setInterval(async () => {
        const b = await api.discogsBackfillStatus().catch(() => null);
        if (b) {
          setBackfill(b);
          if (b.status !== "running" && backfillPollRef.current) {
            clearInterval(backfillPollRef.current);
            backfillPollRef.current = null;
          }
        }
      }, 2000);
    }
    return () => { if (backfillPollRef.current) clearInterval(backfillPollRef.current); };
  }, [backfill?.status]);

  // Poll market backfill while running
  useEffect(() => {
    if (marketBackfill?.status === "running") {
      marketPollRef.current = setInterval(async () => {
        const b = await api.discogsBackfillMarketStatus().catch(() => null);
        if (b) {
          setMarketBackfill(b);
          if (b.status !== "running" && marketPollRef.current) {
            clearInterval(marketPollRef.current);
            marketPollRef.current = null;
          }
        }
      }, 3000);
    }
    return () => { if (marketPollRef.current) clearInterval(marketPollRef.current); };
  }, [marketBackfill?.status]);

  async function startSync() {
    const s = await api.discogsStartSync();
    setSync(s);
  }

  async function startBackfillCovers() {
    const b = await api.discogsBackfillCovers();
    setBackfill(b);
  }

  async function switchAccountType(type: string) {
    setAccountTypeSaving(true);
    try {
      const updated = await api.updateMe({ account_type: type });
      clearMeCache();
      setUser(updated);
    } catch { /* ignore */ } finally {
      setAccountTypeSaving(false);
    }
  }

  async function startMarketBackfill() {
    const b = await api.discogsBackfillMarket();
    setMarketBackfill(b);
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

      {/* Account mode */}
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-medium">Account mode</p>
            <p className="text-xs text-vs-muted mt-0.5">Controls which features are visible</p>
          </div>
          {accountTypeSaving && <Loader2 size={14} className="animate-spin text-vs-muted mt-1" />}
        </div>
        <div className="flex flex-col gap-2">
          {([
            { type: "collector", label: "Collector", desc: "Personal collection, wantlist, hauls — no store tools" },
            { type: "store",     label: "Record Store", desc: "POS, pricing, sales history, public storefront" },
            { type: "both",      label: "Both",         desc: "Full UI — everything above combined" },
          ] as const).map(({ type, label, desc }) => (
            <button
              key={type}
              onClick={() => switchAccountType(type)}
              disabled={accountTypeSaving}
              className={`text-left p-3 rounded-lg border transition-colors disabled:opacity-50 ${
                user?.account_type === type
                  ? "border-vs-accent bg-vs-accent/8"
                  : "border-vs-border hover:border-vs-border-2"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${user?.account_type === type ? "text-vs-accent" : "text-vs-text"}`}>{label}</p>
                {user?.account_type === type && <CheckCircle2 size={14} className="text-vs-accent" />}
              </div>
              <p className="text-xs text-vs-muted mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-vs-muted mt-3">Your records are shared across all modes.</p>
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
          {user?.discogs_username ? (
            <span className="pill-in-stock">
              <span className="w-1.5 h-1.5 rounded-full bg-vs-success" />
              Connected
            </span>
          ) : (
            <span className="pill-sold">
              <span className="w-1.5 h-1.5 rounded-full bg-vs-muted" />
              Not connected
            </span>
          )}
        </div>

        {user?.discogs_username ? (
          <div className="bg-vs-raised rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-vs-muted">Signed in as</p>
                <p className="text-sm font-medium text-vs-text">{user.discogs_username}</p>
              </div>
              <a
                href={`https://www.discogs.com/user/${user.discogs_username}`}
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
        ) : (
          <div className="bg-vs-raised rounded-lg p-4 mb-4 flex items-center justify-between">
            <p className="text-xs text-vs-muted">Connect your Discogs account to sync your collection, auto-fetch cover art, and list records on the marketplace.</p>
            <a href={api.loginUrl()} className="btn-primary text-xs ml-4 flex-shrink-0 flex items-center gap-1.5">
              <Disc3 size={12} />
              Connect Discogs
            </a>
          </div>
        )}

        {user?.discogs_username && (
          <>
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
          </>
        )}
      </div>

      {/* Fix missing covers — requires Discogs OAuth */}
      {user?.discogs_username && <div className="card p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-vs-accent/10 border border-vs-accent/20 flex items-center justify-center flex-shrink-0">
            <Image size={16} className="text-vs-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Fix missing cover images</p>
            <p className="text-xs text-vs-muted mt-0.5">
              Re-fetch album artwork from Discogs for all records without a cover image.
            </p>
          </div>
        </div>

        {(!backfill || backfill.status === "idle") && (
          <button onClick={startBackfillCovers} className="btn-primary flex items-center gap-1.5 py-1.5 text-xs">
            <Image size={12} />
            Fix missing covers
          </button>
        )}

        {backfill?.status === "running" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 size={14} className="animate-spin text-vs-accent" />
              <span className="text-vs-text-2">
                {backfill.total > 0
                  ? `Fetching collection… ${backfill.checked} / ${backfill.total} checked`
                  : "Fetching your Discogs collection…"}
              </span>
            </div>
            {backfill.total > 0 && (
              <div className="h-1.5 bg-vs-raised rounded-full overflow-hidden">
                <div
                  className="h-full bg-vs-accent rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((backfill.checked / backfill.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {backfill?.status === "done" && (
          <div className="flex items-start gap-2 p-3 bg-vs-success/5 border border-vs-success/20 rounded-lg">
            <CheckCircle2 size={14} className="text-vs-success flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-vs-success font-medium">Done</p>
              <p className="text-xs text-vs-text-2 mt-0.5">
                {backfill.updated > 0
                  ? `Updated ${backfill.updated} cover image${backfill.updated !== 1 ? "s" : ""}`
                  : "All covers already up to date"}
              </p>
              <button
                onClick={startBackfillCovers}
                className="mt-2 text-xs text-vs-muted hover:text-vs-accent underline underline-offset-2"
              >
                Run again
              </button>
            </div>
          </div>
        )}

        {backfill?.status === "error" && (
          <div className="flex items-start gap-2 p-3 bg-vs-danger/5 border border-vs-danger/20 rounded-lg">
            <AlertCircle size={14} className="text-vs-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-vs-danger font-medium">Failed</p>
              <p className="text-xs text-vs-text-2 mt-0.5">{backfill.error}</p>
              <button
                onClick={startBackfillCovers}
                className="mt-2 text-xs text-vs-muted hover:text-vs-accent underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>}

      {/* Market data backfill — requires Discogs OAuth */}
      {user?.discogs_username && <div className="card p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-vs-raised border border-vs-border-2 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={14} className="text-vs-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Fetch styles & market prices</p>
            <p className="text-xs text-vs-muted mt-0.5">
              Pulls Discogs genre/style tags and marketplace pricing for all records missing them. ~2s per record.
            </p>
          </div>
        </div>

        {(!marketBackfill || marketBackfill.status === "idle") && (
          <button onClick={startMarketBackfill} className="btn-primary flex items-center gap-1.5 py-1.5 text-xs">
            <TrendingUp size={12} />
            Fetch market data
          </button>
        )}

        {marketBackfill?.status === "running" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 size={14} className="animate-spin text-vs-accent" />
              <span className="text-vs-text-2">
                {marketBackfill.total > 0
                  ? `${marketBackfill.processed} / ${marketBackfill.total} records processed…`
                  : "Starting…"}
              </span>
            </div>
            {marketBackfill.total > 0 && (
              <div className="h-1.5 bg-vs-raised rounded-full overflow-hidden">
                <div
                  className="h-full bg-vs-accent rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((marketBackfill.processed / marketBackfill.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {marketBackfill?.status === "done" && (
          <div className="flex items-start gap-2 p-3 bg-vs-success/5 border border-vs-success/20 rounded-lg">
            <CheckCircle2 size={14} className="text-vs-success flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-vs-success font-medium">Done</p>
              <p className="text-xs text-vs-text-2 mt-0.5">
                {marketBackfill.updated > 0
                  ? `Updated ${marketBackfill.updated} record${marketBackfill.updated !== 1 ? "s" : ""}`
                  : "All records already up to date"}
              </p>
              <button onClick={startMarketBackfill} className="mt-2 text-xs text-vs-muted hover:text-vs-accent underline underline-offset-2">
                Run again
              </button>
            </div>
          </div>
        )}

        {marketBackfill?.status === "error" && (
          <div className="flex items-start gap-2 p-3 bg-vs-danger/5 border border-vs-danger/20 rounded-lg">
            <AlertCircle size={14} className="text-vs-danger flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-vs-danger font-medium">Failed</p>
              <p className="text-xs text-vs-text-2 mt-0.5">{marketBackfill.error}</p>
              <button onClick={startMarketBackfill} className="mt-2 text-xs text-vs-muted hover:text-vs-accent underline underline-offset-2">
                Try again
              </button>
            </div>
          </div>
        )}
      </div>}

      {/* Account section */}
      <div className="card p-5">
        <p className="text-sm font-medium mb-3">Account</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-vs-text">{user?.discogs_username || user?.email || user?.display_name}</p>
            <p className="text-xs text-vs-muted">{user?.credits} scan credits remaining</p>
          </div>
          {user?.discogs_username ? (
            <a href={api.loginUrl()} className="btn-secondary text-xs">
              Reconnect Discogs
            </a>
          ) : (
            <a href={api.loginUrl()} className="btn-secondary text-xs flex items-center gap-1.5">
              <Disc3 size={12} />
              Connect Discogs
            </a>
          )}
        </div>
        {user?.is_admin && (
          <div className="mt-3 pt-3 border-t border-vs-border">
            <a href="/admin" className="btn-secondary text-xs">
              Admin panel →
            </a>
          </div>
        )}
      </div>

      {/* First-time admin claim — only shown when not yet admin */}
      {user && !user.is_admin && (
        <ClaimAdminCard onClaimed={() => setUser((u) => u ? { ...u, is_admin: true } : u)} />
      )}
    </div>
  );
}
