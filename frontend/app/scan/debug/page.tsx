"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api, type AdminDebugScan, type AdminDebugSearchResult, type User,
} from "@/lib/api";
import { Loader2, Search, ExternalLink, CheckCircle, ChevronDown, ChevronRight } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function confidenceColor(c: number | null) {
  if (!c) return "text-vs-danger";
  if (c >= 80) return "text-vs-success";
  if (c >= 50) return "text-vs-warning";
  return "text-vs-danger";
}

// ── Claude raw box ────────────────────────────────────────────────────────────

function ClaudeBox({ raw }: { raw: Record<string, unknown> | null }) {
  if (!raw) return <span className="text-vs-muted text-xs italic">no response</span>;
  const fields = ["artist","title","year","label","catalog_number","format","confidence","low_information"] as const;
  const tracklist = (raw.tracklist as Array<{position:string;title:string}> | null) ?? [];
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
        {fields.map((k) => {
          const v = raw[k];
          if (v === null || v === undefined) return null;
          const warn = (k === "confidence" && typeof v === "number" && v < 70)
            || (k === "low_information" && v === true);
          return (
            <div key={k} className={`flex gap-2 ${warn ? "text-vs-warning" : ""}`}>
              <span className="text-vs-muted w-28 flex-shrink-0 font-mono">{k}</span>
              <span className="font-medium truncate max-w-[200px]" title={String(v)}>{String(v)}</span>
            </div>
          );
        })}
      </div>
      {tracklist.length > 0 && (
        <div className="mt-1.5">
          <span className="text-2xs text-vs-muted font-mono">tracklist ({tracklist.length})</span>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {tracklist.map((t, i) => (
              <span key={`${t.position}-${i}`} className="text-xs">
                <span className="text-vs-muted font-mono">{t.position}</span>
                <span className="text-vs-text ml-1">{t.title}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {raw.reasoning ? (
        <p className="text-xs text-vs-muted italic mt-1">&ldquo;{String(raw.reasoning)}&rdquo;</p>
      ) : null}
    </div>
  );
}

// ── Strategy row ──────────────────────────────────────────────────────────────

function StrategyRow({ s, correctId, onMarkCorrect }: {
  s: AdminDebugSearchResult["strategies"][number];
  correctId: number | null;
  onMarkCorrect: (id: number) => void;
}) {
  const [open, setOpen] = useState(s.result_count > 0);
  const hit = s.result_count > 0;
  const paramStr = Object.entries(s.params).map(([k,v]) => `${k}=${v}`).join(" · ");

  return (
    <div className={`rounded-lg border text-xs ${hit ? "border-vs-border" : "border-vs-border/40 opacity-60"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className={`font-mono font-semibold w-36 flex-shrink-0 ${hit ? "text-vs-accent" : "text-vs-muted"}`}>
          {s.name}
        </span>
        <span className="text-vs-muted truncate flex-1">{paramStr}</span>
        <span className={`flex-shrink-0 font-medium ${hit ? "text-vs-success" : "text-vs-danger"}`}>
          {s.result_count} results
        </span>
      </button>
      {open && s.top_results.length > 0 && (
        <div className="border-t border-vs-border/40 px-3 py-2 flex flex-col gap-1.5">
          {s.top_results.map((r) => (
            <div
              key={r.id}
              onClick={() => onMarkCorrect(r.id)}
              className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                correctId === r.id ? "bg-vs-success/10 border border-vs-success/30" : "hover:bg-vs-raised"
              }`}
            >
              {r.cover_image && !r.cover_image.includes("spacer") ? (
                <img src={r.cover_image} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded bg-vs-raised border border-vs-border flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-vs-text truncate">{r.title}</p>
                <div className="flex gap-2 text-vs-muted">
                  {r.catno && <span className="font-mono">{r.catno}</span>}
                  <span className="text-vs-accent/80">score {r._score}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {correctId === r.id && <CheckCircle size={11} className="text-vs-success" />}
                <a
                  href={`https://www.discogs.com/release/${r.id}`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-vs-muted hover:text-vs-text"
                >
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Debug card ────────────────────────────────────────────────────────────────

function DebugCard({ scan }: { scan: AdminDebugScan }) {
  const [debug, setDebug] = useState<AdminDebugSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [correctId, setCorrectId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  async function runDebugSearch() {
    setSearching(true);
    try {
      const res = await api.adminDebugSearch(scan.id);
      setDebug(res);
    } catch {
      // error shown implicitly via no results
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-vs-border">
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-vs-raised border border-vs-border">
            <img
              src={scan.image_url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">
                {scan.artist ?? <span className="text-vs-danger italic text-xs">no artist</span>}
                {" — "}
                {scan.title ?? <span className="text-vs-danger italic text-xs">no title</span>}
              </p>
              <span className={`text-2xs font-mono font-semibold ${confidenceColor(scan.confidence)}`}>
                {scan.confidence ?? "?"}%
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-vs-muted flex-wrap">
              {scan.year && <span>{scan.year}</span>}
              {scan.label && <span>{scan.label}</span>}
              {scan.catalog_number && <span className="font-mono text-vs-accent">{scan.catalog_number}</span>}
              <span className="text-vs-muted/50">{scan.created_at ? new Date(scan.created_at).toLocaleString() : ""}</span>
            </div>
          </div>
          <button
            onClick={runDebugSearch}
            disabled={searching}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-vs-accent/10 text-vs-accent hover:bg-vs-accent/20 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            Debug search
          </button>
        </div>
      </div>

      {/* Claude output */}
      <div className="p-4 border-b border-vs-border bg-vs-raised/20">
        <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider mb-2">Claude detected</p>
        <ClaudeBox raw={scan.claude_raw} />
      </div>

      {/* Strategy breakdown */}
      {debug && (
        <div className="p-4 border-b border-vs-border">
          <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider mb-3">
            Search strategies ({debug.strategies.filter(s => s.result_count > 0).length}/{debug.strategies.length} hit)
          </p>
          <div className="flex flex-col gap-1.5">
            {debug.strategies.map((s) => (
              <StrategyRow key={s.name + JSON.stringify(s.params)} s={s} correctId={correctId} onMarkCorrect={setCorrectId} />
            ))}
          </div>

          {debug.ranked.length > 0 && (
            <div className="mt-4">
              <p className="text-2xs text-vs-muted font-medium uppercase tracking-wider mb-2">Final ranking</p>
              <div className="flex flex-col gap-1.5">
                {debug.ranked.map((r, i) => (
                  <div
                    key={r.id}
                    onClick={() => setCorrectId(r.id)}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                      correctId === r.id ? "border-vs-success bg-vs-success/5" : "border-vs-border hover:border-vs-border-2"
                    }`}
                  >
                    <span className="text-vs-muted w-4 text-center flex-shrink-0 font-mono">{i+1}</span>
                    {r.cover_image && !r.cover_image.includes("spacer") ? (
                      <img src={r.cover_image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-vs-raised border border-vs-border flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-vs-text">{r.title}</p>
                      <div className="flex gap-2 text-vs-muted flex-wrap">
                        {r.catno && <span className="font-mono">{r.catno}</span>}
                        {r._match_reason && <span className="text-vs-accent">{r._match_reason}</span>}
                        <span>score {r._score}</span>
                        <span className="text-vs-muted/60">{r._hit_strategies.join(", ")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {correctId === r.id && <CheckCircle size={12} className="text-vs-success" />}
                      <a
                        href={`https://www.discogs.com/release/${r.id}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-vs-muted hover:text-vs-text"
                      >
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes / correction */}
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-vs-muted w-28 flex-shrink-0">Correct release</span>
          <input
            type="number"
            value={correctId ?? ""}
            placeholder="Discogs release ID"
            onChange={(e) => {
              const n = parseInt(e.target.value);
              setCorrectId(isNaN(n) ? null : n);
            }}
            className="input text-xs py-1 w-40"
          />
          {correctId && (
            <a
              href={`https://www.discogs.com/release/${correctId}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-vs-accent hover:underline flex items-center gap-1"
            >
              <ExternalLink size={10} />View on Discogs
            </a>
          )}
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xs text-vs-muted w-28 flex-shrink-0 pt-1.5">What went wrong</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Claude read 'BSU' as '6SU', title 'Nu Relix' as 'Nurzilyc'"
            rows={2}
            className="input text-xs py-1.5 flex-1 resize-none"
          />
        </div>
        <p className="text-2xs text-vs-muted/50">Annotations are local only — copy-paste into a doc to track patterns over time</p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScanDebugPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [scans, setScans] = useState<AdminDebugScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.me()
      .then((u) => {
        setUser(u);
        if (!u.is_admin) {
          router.replace("/scan");
          return;
        }
        return api.adminDebugScans(1, 15);
      })
      .then((s) => { if (s) setScans(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  async function loadPage(p: number) {
    setLoading(true);
    try {
      const s = await api.adminDebugScans(p, 15);
      setScans(s);
      setPage(p);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;
  if (!user.is_admin) return null;

  return (
    <div>
      <div className="sticky top-0 z-20 bg-vs-bg px-6 pt-6 pb-4 border-b border-vs-border/50 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium">Scan debugger</h1>
            <p className="text-sm text-vs-text-2 mt-0.5">
              See what Claude detected · click &ldquo;Debug search&rdquo; to run all strategies and inspect scores
            </p>
          </div>
          <a href="/scan" className="text-xs text-vs-muted hover:text-vs-text transition-colors">← Back to scan</a>
        </div>
      </div>

      <div className="px-6 pb-10 flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center gap-2 text-vs-muted py-10 justify-center">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : scans.length === 0 ? (
          <p className="text-vs-muted text-sm text-center py-10">No scans yet.</p>
        ) : (
          scans.map((sc) => <DebugCard key={sc.id} scan={sc} />)
        )}

        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            onClick={() => loadPage(Math.max(1, page - 1))}
            disabled={page === 1 || loading}
            className="text-xs px-3 py-1.5 rounded border border-vs-border text-vs-muted hover:text-vs-text disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-vs-muted">Page {page}</span>
          <button
            onClick={() => loadPage(page + 1)}
            disabled={scans.length < 15 || loading}
            className="text-xs px-3 py-1.5 rounded border border-vs-border text-vs-muted hover:text-vs-text disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
