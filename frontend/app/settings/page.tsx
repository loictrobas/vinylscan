"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Disc3, RefreshCw, CheckCircle2, AlertCircle, ExternalLink,
  Loader2, Clock, ArrowDownToLine, Image, Shield, TrendingUp,
  Pencil, Check, X, KeyRound, ChevronDown, ChevronUp,
} from "lucide-react";
import { api, getToken, type DiscogsSyncStatus, type User } from "@/lib/api";

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
      toast.success("You're the admin now");
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

const PRICE_STEP_PRESETS = [0.01, 0.1, 0.5, 1, 5, 10];

function PriceStepCard({ user, onSaved }: { user: User | null; onSaved: (priceStep: number) => void }) {
  const [value, setValue] = useState(user?.price_step ?? 0.5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) setValue(user.price_step);
  }, [user]);

  async function save(next: number) {
    setValue(next);
    setSaving(true);
    setSaved(false);
    try {
      await api.updateMe({ price_step: next });
      onSaved(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch { /* keep optimistic value, retry on next change */ }
    finally { setSaving(false); }
  }

  return (
    <div className="card p-5">
      <p className="text-sm font-medium mb-1">Pricing</p>
      <p className="text-xs text-vs-muted mb-3">
        Step size for the price/cost +/- controls when adding records. Use a smaller step for
        currencies where small units matter less (e.g. ARS, COP).
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {PRICE_STEP_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => save(p)}
            disabled={saving}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              value === p ? "bg-vs-accent text-white border-vs-accent" : "border-vs-border text-vs-muted hover:text-vs-text"
            }`}
          >
            {p}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-1">
          <span className="text-xs text-vs-muted">Custom:</span>
          <input
            type="number" min="0.01" step="0.01" value={value}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) save(v); }}
            className="w-20 bg-vs-raised border border-vs-border rounded-lg px-2 py-1.5 text-xs text-vs-text focus:outline-none focus:border-vs-accent"
          />
        </div>
        {saved && <CheckCircle2 size={14} className="text-vs-success" />}
      </div>
    </div>
  );
}

function EditableDisplayName({ user, onSaved }: { user: User | null; onSaved: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user?.display_name ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(user?.display_name ?? ""); }, [user?.display_name]);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.updateMe({ display_name: trimmed });
      onSaved(trimmed);
      setEditing(false);
      toast.success("Name updated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 group">
        <p className="text-sm text-vs-text font-medium">{user?.display_name || user?.discogs_username || user?.email}</p>
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 text-vs-muted hover:text-vs-accent transition-opacity"
          aria-label="Edit name"
        >
          <Pencil size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        autoFocus
        className="text-sm bg-vs-raised border border-vs-border rounded-lg px-2 py-1 text-vs-text focus:outline-none focus:border-vs-accent"
      />
      <button onClick={save} disabled={saving} className="text-vs-success disabled:opacity-50">
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
      </button>
      <button onClick={() => setEditing(false)} className="text-vs-muted hover:text-vs-text">
        <X size={13} />
      </button>
    </div>
  );
}

function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setCurrent(""); setNext(""); setConfirm(""); setError(""); setOpen(false);
  }

  async function submit() {
    setError("");
    if (next.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (next !== confirm) { setError("Passwords don't match"); return; }
    setSaving(true);
    try {
      await api.changePassword(current, next);
      toast.success("Password updated");
      reset();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-vs-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-vs-muted hover:text-vs-text flex items-center gap-1.5"
      >
        <KeyRound size={12} />
        Change password
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2 max-w-xs">
          <input
            type="password"
            placeholder="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="text-xs bg-vs-raised border border-vs-border rounded-lg px-2.5 py-1.5 text-vs-text focus:outline-none focus:border-vs-accent"
          />
          <input
            type="password"
            placeholder="New password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="text-xs bg-vs-raised border border-vs-border rounded-lg px-2.5 py-1.5 text-vs-text focus:outline-none focus:border-vs-accent"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="text-xs bg-vs-raised border border-vs-border rounded-lg px-2.5 py-1.5 text-vs-text focus:outline-none focus:border-vs-accent"
          />
          {error && <p className="text-xs text-vs-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={saving || !current || !next || !confirm}
              className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
              Update password
            </button>
            <button onClick={reset} className="text-xs text-vs-muted hover:text-vs-text px-2">
              Cancel
            </button>
          </div>
        </div>
      )}
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

const DISCOGS_ERROR_MESSAGES: Record<string, string> = {
  already_linked: "That Discogs account is already connected to a different VinylScan account.",
  session_expired: "Your session expired during the Discogs connection — please try again.",
};

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [sync, setSync] = useState<DiscogsSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [backfill, setBackfill] = useState<BackfillStatus | null>(null);
  const [marketBackfill, setMarketBackfill] = useState<{ status: string; total: number; processed: number; updated: number; error: string | null } | null>(null);
  const [connectingDiscogs, setConnectingDiscogs] = useState(false);
  const [disconnectingDiscogs, setDisconnectingDiscogs] = useState(false);
  const [discogsNotice, setDiscogsNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
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

  useEffect(() => {
    const err = searchParams.get("discogs_error");
    if (err) {
      setDiscogsNotice({ kind: "error", text: DISCOGS_ERROR_MESSAGES[err] || "Couldn't connect Discogs — please try again." });
      router.replace("/settings");
    } else if (searchParams.get("discogs_connected")) {
      setDiscogsNotice({ kind: "success", text: "Discogs connected." });
      router.replace("/settings");
    }
  }, [searchParams, router]);

  async function handleConnectDiscogs() {
    setConnectingDiscogs(true);
    setDiscogsNotice(null);
    try {
      const { authorize_url } = await api.connectDiscogs();
      window.location.href = authorize_url;
    } catch (e: unknown) {
      setDiscogsNotice({ kind: "error", text: e instanceof Error ? e.message : "Couldn't start Discogs connection" });
      setConnectingDiscogs(false);
    }
  }

  async function handleDisconnectDiscogs() {
    if (!confirm("Disconnect Discogs? Collection sync, cover fetching, and market pricing stop working until you reconnect.")) return;
    setDisconnectingDiscogs(true);
    try {
      await api.disconnectDiscogs();
      setUser((u) => u ? { ...u, discogs_username: null } : u);
      toast.success("Discogs disconnected");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setDisconnectingDiscogs(false);
    }
  }

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

      {discogsNotice && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${
          discogsNotice.kind === "error"
            ? "bg-vs-danger/10 border border-vs-danger/30 text-vs-danger"
            : "bg-vs-success/10 border border-vs-success/30 text-vs-success"
        }`}>
          {discogsNotice.text}
        </div>
      )}

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
            <div className="flex items-center gap-2">
              <span className="pill-in-stock">
                <span className="w-1.5 h-1.5 rounded-full bg-vs-success" />
                Connected
              </span>
              <button
                onClick={handleDisconnectDiscogs}
                disabled={disconnectingDiscogs}
                className="text-2xs text-vs-muted hover:text-vs-danger disabled:opacity-50"
              >
                {disconnectingDiscogs ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
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
            <button
              onClick={handleConnectDiscogs}
              disabled={connectingDiscogs}
              className="btn-primary text-xs ml-4 flex-shrink-0 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Disc3 size={12} />
              {connectingDiscogs ? "Connecting…" : "Connect Discogs"}
            </button>
          </div>
        )}

        {user?.discogs_username && (
          <>
            {/* How it works */}
            <div className="pt-1">
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

      {/* Discogs tools — requires Discogs OAuth, grouped under one card */}
      {user?.discogs_username && <div className="card p-5 divide-y divide-vs-border">
        <div className="pb-4 mb-1">
          <p className="text-sm font-medium">Discogs tools</p>
          <p className="text-xs text-vs-muted mt-0.5">Sync, repair, and enrich your catalog from your connected Discogs account.</p>
        </div>

        {/* Collection sync */}
        <div className="py-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-vs-raised border border-vs-border-2 flex items-center justify-center flex-shrink-0">
              <ArrowDownToLine size={14} className="text-vs-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Collection sync</p>
              <p className="text-xs text-vs-muted mt-0.5">
                Import your entire Discogs collection. Records already in your catalog are skipped — new ones added here sync back to Discogs.
              </p>
            </div>
            {!isRunning && (
              <button onClick={startSync} className="btn-primary flex items-center gap-1.5 py-1.5 text-xs flex-shrink-0">
                {sync?.status === "done"
                  ? <><RefreshCw size={12} />Re-sync</>
                  : <><ArrowDownToLine size={12} />Import</>
                }
              </button>
            )}
          </div>

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
                  {sync.errors > 0 && <span className="text-vs-warning"> · {sync.errors} failed</span>}
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
              No sync run yet. Click "Import" to pull your Discogs library.
            </div>
          )}
        </div>

        {/* Fix missing covers */}
        <div className="py-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-vs-raised border border-vs-border-2 flex items-center justify-center flex-shrink-0">
              <Image size={14} className="text-vs-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Fix missing cover images</p>
              <p className="text-xs text-vs-muted mt-0.5">
                Re-fetch album artwork from Discogs for all records without a cover image.
              </p>
            </div>
            {(!backfill || backfill.status === "idle") && (
              <button onClick={startBackfillCovers} className="btn-primary flex items-center gap-1.5 py-1.5 text-xs flex-shrink-0">
                <Image size={12} />
                Fix covers
              </button>
            )}
          </div>

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
        </div>

        {/* Market data */}
        <div className="pt-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-vs-raised border border-vs-border-2 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={14} className="text-vs-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Fetch styles & market prices</p>
              <p className="text-xs text-vs-muted mt-0.5">
                Pulls Discogs genre/style tags and marketplace pricing for all records missing them. ~2s per record.
              </p>
            </div>
            {(!marketBackfill || marketBackfill.status === "idle") && (
              <button onClick={startMarketBackfill} className="btn-primary flex items-center gap-1.5 py-1.5 text-xs flex-shrink-0">
                <TrendingUp size={12} />
                Fetch data
              </button>
            )}
          </div>

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
        </div>
      </div>}

      {/* Pricing section */}
      <PriceStepCard user={user} onSaved={(price_step) => setUser((u) => u ? { ...u, price_step } : u)} />

      {/* Account section */}
      <div className="card p-5">
        <p className="text-sm font-medium mb-3">Account</p>
        <div>
          <EditableDisplayName user={user} onSaved={(name) => setUser((u) => u ? { ...u, display_name: name } : u)} />
          <p className="text-xs text-vs-muted mt-1">{user?.email}</p>
          <p className="text-2xs text-vs-muted/70 mt-0.5">Contact support to change your email.</p>
          <p className="text-xs text-vs-muted mt-1.5">{user?.credits} scan credit{user?.credits !== 1 ? "s" : ""} remaining</p>
        </div>
        <ChangePasswordCard />
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

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}
