"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight,
  Download, FlaskConical, Loader2, Play, Square, XCircle,
} from "lucide-react";
import {
  api, benchmarkRun, getToken,
  type BenchmarkClaudeResult, type BenchmarkGroundTruth, type BenchmarkResult, type User,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type RunState = "idle" | "fetching" | "running" | "done" | "error";
type FilterTab = "all" | "correct" | "partial" | "wrong" | "no_image";

interface Progress {
  done: number;
  total: number;
}

// ── Error code display ────────────────────────────────────────────────────────

const ERROR_LABELS: Record<string, string> = {
  A1_artist_wrong:   "A1 artist wrong",
  A2_title_wrong:    "A2 title wrong",
  A3_swapped:        "A3 swapped",
  A5_label_as_artist:"A5 label→artist",
  A6_label_as_title: "A6 label→title",
  A7_catno_wrong:    "A7 catno wrong",
  A8_catno_missed:   "A8 catno missed",
  A9_year_wrong:     "A9 year wrong",
  B1_overconfident:  "B1 overconfident",
  B2_underconfident: "B2 underconfident",
  B3_false_low_info: "B3 false-low-info",
  error:             "API error",
};

function errColor(code: string): string {
  if (code.startsWith("A1") || code.startsWith("A2") || code.startsWith("A3")) return "bg-vs-danger/15 text-vs-danger";
  if (code.startsWith("A")) return "bg-amber-500/15 text-amber-400";
  if (code.startsWith("B")) return "bg-purple-500/15 text-purple-400";
  return "bg-vs-raised text-vs-muted";
}

// ── Similarity helper (client-side for coloring) ──────────────────────────────

function sim(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  // Simple char-level overlap approximation
  const longer = la.length > lb.length ? la : lb;
  const shorter = la.length > lb.length ? lb : la;
  let matches = 0;
  let si = 0;
  for (let i = 0; i < shorter.length; i++) {
    const idx = longer.indexOf(shorter[i], si);
    if (idx !== -1) { matches++; si = idx + 1; }
  }
  return (2 * matches) / (longer.length + shorter.length);
}

function fieldColor(val: string | null | undefined, gt: string | null | undefined): string {
  if (!val) return "text-vs-muted italic";
  const s = sim(val, gt);
  if (s >= 0.85) return "text-vs-success";
  if (s >= 0.5)  return "text-amber-400";
  return "text-vs-danger";
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BenchmarkResult["status"] }) {
  const map: Record<string, string> = {
    correct:  "bg-vs-success/15 text-vs-success",
    partial:  "bg-amber-500/15 text-amber-400",
    wrong:    "bg-vs-danger/15 text-vs-danger",
    no_image: "bg-vs-raised text-vs-muted",
    error:    "bg-vs-danger/20 text-vs-danger",
  };
  return (
    <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? map.wrong}`}>
      {status === "no_image" ? "no img" : status}
    </span>
  );
}

// ── Image type badge ──────────────────────────────────────────────────────────

function ImageTypeBadge({ type }: { type: "cover" | "label" | undefined }) {
  if (!type) return <span className="text-vs-muted text-xs">—</span>;
  return (
    <span className={`text-2xs px-1.5 py-0.5 rounded font-medium ${type === "label" ? "bg-blue-500/15 text-blue-400" : "bg-vs-raised text-vs-muted"}`}>
      {type}
    </span>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ results }: { results: BenchmarkResult[] }) {
  if (results.length === 0) return null;

  const total   = results.length;
  const correct = results.filter((r) => r.status === "correct").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const wrong   = results.filter((r) => r.status === "wrong").length;
  const noImg   = results.filter((r) => r.status === "no_image" || r.status === "error").length;
  const acc     = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Error code frequency
  const freq: Record<string, number> = {};
  for (const r of results) {
    for (const e of r.errors) freq[e] = (freq[e] ?? 0) + 1;
  }
  const topErrors = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="card p-5 space-y-4">
      {/* accuracy + counts */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="text-center">
          <div className={`text-3xl font-bold tabular-nums ${acc >= 80 ? "text-vs-success" : acc >= 50 ? "text-amber-400" : "text-vs-danger"}`}>
            {acc}%
          </div>
          <div className="text-xs text-vs-muted">accuracy</div>
        </div>
        <div className="flex gap-4 flex-wrap text-sm">
          <span className="text-vs-success font-semibold">{correct} correct</span>
          <span className="text-amber-400 font-semibold">{partial} partial</span>
          <span className="text-vs-danger font-semibold">{wrong} wrong</span>
          {noImg > 0 && <span className="text-vs-muted">{noImg} no image</span>}
          <span className="text-vs-muted">/ {total} total</span>
        </div>
      </div>

      {/* stacked progress bar */}
      {total > 0 && (
        <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
          {correct > 0 && <div className="bg-vs-success" style={{ width: `${(correct / total) * 100}%` }} />}
          {partial > 0 && <div className="bg-amber-400" style={{ width: `${(partial / total) * 100}%` }} />}
          {wrong   > 0 && <div className="bg-vs-danger"  style={{ width: `${(wrong   / total) * 100}%` }} />}
          {noImg   > 0 && <div className="bg-vs-muted/30" style={{ width: `${(noImg   / total) * 100}%` }} />}
        </div>
      )}

      {/* top errors */}
      {topErrors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {topErrors.map(([code, count]) => (
            <span key={code} className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1.5 ${errColor(code)}`}>
              <span className="font-medium">{ERROR_LABELS[code] ?? code}</span>
              <span className="opacity-70">×{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({ result }: { result: BenchmarkResult }) {
  const { gt, claude, status, errors } = result;
  const imgType = claude?._image_type;
  const conf    = claude?.confidence ?? null;

  // Confidence color
  const confColor = conf === null
    ? "text-vs-muted"
    : conf >= 75 ? "text-vs-success" : conf >= 40 ? "text-amber-400" : "text-vs-danger";

  return (
    <tr className="border-b border-vs-border/40 hover:bg-vs-raised/20 transition-colors">
      {/* # */}
      <td className="px-3 py-2 text-vs-muted text-xs tabular-nums">{result.idx + 1}</td>

      {/* Thumb */}
      <td className="px-3 py-2">
        {gt.thumb ? (
          <img
            src={gt.thumb}
            alt=""
            className="w-10 h-10 object-cover rounded-md"
            loading="lazy"
          />
        ) : (
          <div className="w-10 h-10 bg-vs-raised rounded-md flex items-center justify-center text-vs-muted/40">
            ♪
          </div>
        )}
      </td>

      {/* Ground truth */}
      <td className="px-3 py-2 min-w-0">
        <p className="text-sm font-medium text-vs-text truncate max-w-[160px]">{gt.artist ?? "—"}</p>
        <p className="text-xs text-vs-text-2 truncate max-w-[160px]">{gt.title ?? "—"}</p>
        {gt.year && <p className="text-2xs text-vs-muted">{gt.year}</p>}
      </td>

      {/* Claude output */}
      <td className="px-3 py-2 min-w-0">
        {claude && !claude.error ? (
          <>
            <p className={`text-sm font-medium truncate max-w-[160px] ${fieldColor(claude.artist, gt.artist)}`}>
              {claude.artist ?? <span className="italic text-vs-muted">—</span>}
            </p>
            <p className={`text-xs truncate max-w-[160px] ${fieldColor(claude.title, gt.title)}`}>
              {claude.title ?? <span className="italic text-vs-muted">—</span>}
            </p>
            {claude.year && (
              <p className={`text-2xs ${fieldColor(String(claude.year), String(gt.year))}`}>
                {claude.year}
              </p>
            )}
          </>
        ) : claude?.error ? (
          <p className="text-xs text-vs-danger">{claude.error.slice(0, 60)}</p>
        ) : (
          <p className="text-xs text-vs-muted italic">no image</p>
        )}
      </td>

      {/* Image type */}
      <td className="px-3 py-2">
        <ImageTypeBadge type={imgType} />
      </td>

      {/* Confidence */}
      <td className="px-3 py-2">
        {conf !== null ? (
          <span className={`text-sm font-bold tabular-nums ${confColor}`}>{conf}</span>
        ) : (
          <span className="text-vs-muted">—</span>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-2">
        <StatusBadge status={status} />
      </td>

      {/* Error codes */}
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {errors.filter((e) => !e.startsWith("B")).map((e) => (
            <span key={e} className={`text-2xs px-1.5 py-0.5 rounded font-medium ${errColor(e)}`}>
              {ERROR_LABELS[e] ?? e}
            </span>
          ))}
          {errors.filter((e) => e.startsWith("B")).map((e) => (
            <span key={e} className={`text-2xs px-1.5 py-0.5 rounded font-medium ${errColor(e)}`}>
              {ERROR_LABELS[e] ?? e}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(results: BenchmarkResult[]) {
  const header = ["#", "release_id", "gt_artist", "gt_title", "gt_year", "gt_label", "gt_catno",
                  "claude_artist", "claude_title", "claude_year", "claude_catno", "confidence",
                  "image_type", "status", "errors"].join(",");
  const rows = results.map((r) => [
    r.idx + 1,
    r.gt.release_id ?? "",
    `"${(r.gt.artist ?? "").replace(/"/g, '""')}"`,
    `"${(r.gt.title  ?? "").replace(/"/g, '""')}"`,
    r.gt.year ?? "",
    `"${(r.gt.label  ?? "").replace(/"/g, '""')}"`,
    r.gt.catno ?? "",
    `"${(r.claude?.artist ?? "").replace(/"/g, '""')}"`,
    `"${(r.claude?.title  ?? "").replace(/"/g, '""')}"`,
    r.claude?.year ?? "",
    r.claude?.catalog_number ?? "",
    r.claude?.confidence ?? "",
    r.claude?._image_type ?? "",
    r.status,
    `"${r.errors.join(" ")}"`,
  ].join(","));

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `benchmark_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BenchmarkPage() {
  const router = useRouter();
  const [user, setUser]             = useState<User | null>(null);
  const [runState, setRunState]     = useState<RunState>("idle");
  const [results, setResults]       = useState<BenchmarkResult[]>([]);
  const [progress, setProgress]     = useState<Progress>({ done: 0, total: 0 });
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [filter, setFilter]         = useState<FilterTab>("all");
  const [configN, setConfigN]       = useState(50);
  const [configSec, setConfigSec]   = useState(true);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.me().then((u) => {
      if (!u.is_admin) router.replace("/");
      else setUser(u);
    }).catch(() => router.replace("/"));
  }, [router]);

  const start = useCallback(async () => {
    setRunState("fetching");
    setResults([]);
    setErrorMsg(null);
    setProgress({ done: 0, total: 0 });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await benchmarkRun(
        { n: configN, include_secondary: configSec },
        (type, data) => {
          const d = data as Record<string, unknown>;
          if (type === "progress") {
            const phase = d.phase as string;
            if (phase === "fetch") {
              setRunState("fetching");
            } else if (phase === "start") {
              setRunState("running");
              setProgress({ done: 0, total: d.total as number });
            } else if (phase === "run") {
              setProgress({ done: d.done as number, total: d.total as number });
            }
          } else if (type === "result") {
            setResults((prev) => [...prev, d as unknown as BenchmarkResult]);
          } else if (type === "done") {
            setRunState("done");
          } else if (type === "error") {
            setErrorMsg(d.message as string);
            setRunState("error");
          }
        },
        ctrl.signal,
      );
      setRunState((prev) => (prev !== "error" ? "done" : prev));
    } catch (e: unknown) {
      if ((e as { name?: string }).name === "AbortError") {
        setRunState("idle");
      } else {
        setErrorMsg((e as Error).message);
        setRunState("error");
      }
    }
  }, [configN, configSec]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunState("done");
  }, []);

  const filtered = results.filter((r) =>
    filter === "all" ? true : r.status === filter
  );

  const isRunning = runState === "running" || runState === "fetching";
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  if (!user) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-vs-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/admin")}
          className="p-1.5 rounded-lg hover:bg-vs-raised text-vs-muted hover:text-vs-text transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <FlaskConical size={22} className="text-vs-accent" />
        <div>
          <h1 className="text-xl font-bold text-vs-text">Claude Benchmark</h1>
          <p className="text-xs text-vs-muted">
            Test identification accuracy against your Discogs collection
          </p>
        </div>
      </div>

      {/* Config + Run */}
      {!isRunning && runState !== "done" && (
        <div className="card p-5 flex flex-wrap items-end gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-vs-text-2">Records to test</label>
            <div className="flex gap-2">
              {[25, 50, 100].map((n) => (
                <button
                  key={n}
                  onClick={() => setConfigN(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    configN === n
                      ? "bg-vs-accent text-white"
                      : "bg-vs-raised text-vs-text-2 hover:text-vs-text"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setConfigSec((v) => !v)}
              className={`w-9 h-5 rounded-full transition-colors relative ${configSec ? "bg-vs-accent" : "bg-vs-raised"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${configSec ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-vs-text-2">Include label images</span>
          </label>

          <button
            onClick={start}
            className="btn-primary flex items-center gap-2 ml-auto"
          >
            <Play size={15} />
            Run benchmark
          </button>
        </div>
      )}

      {/* Progress */}
      {isRunning && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-vs-text-2">
              <Activity size={14} className="animate-pulse text-vs-accent" />
              {runState === "fetching"
                ? "Fetching Discogs collection…"
                : `Processing record ${progress.done} / ${progress.total}`}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-vs-text tabular-nums">{pct}%</span>
              <button
                onClick={stop}
                className="flex items-center gap-1.5 text-xs text-vs-muted hover:text-vs-danger transition-colors"
              >
                <Square size={12} />
                Stop
              </button>
            </div>
          </div>
          <div className="h-2 bg-vs-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-vs-accent rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {results.length > 0 && (
            <p className="text-xs text-vs-muted">
              {results.filter((r) => r.status === "correct").length} correct,{" "}
              {results.filter((r) => r.status === "partial").length} partial,{" "}
              {results.filter((r) => r.status === "wrong").length} wrong so far
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {runState === "error" && errorMsg && (
        <div className="card p-4 border border-vs-danger/30 flex items-start gap-3">
          <XCircle size={16} className="text-vs-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-vs-danger">Benchmark failed</p>
            <p className="text-xs text-vs-muted mt-1">{errorMsg}</p>
          </div>
          <button
            onClick={() => { setRunState("idle"); setErrorMsg(null); }}
            className="ml-auto text-xs text-vs-muted hover:text-vs-text"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary */}
      {results.length > 0 && <SummaryBar results={results} />}

      {/* Results table */}
      {results.length > 0 && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Filter tabs */}
            <div className="flex gap-1 border-b border-vs-border">
              {(["all", "correct", "partial", "wrong", "no_image"] as FilterTab[]).map((t) => {
                const count = t === "all" ? results.length : results.filter((r) => r.status === t).length;
                return (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      filter === t
                        ? "text-vs-accent border-b-2 border-vs-accent"
                        : "text-vs-muted hover:text-vs-text"
                    }`}
                  >
                    {t === "no_image" ? "no img" : t}
                    <span className="ml-1.5 opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {(runState === "done" || runState === "idle") && results.length > 0 && (
                <>
                  <button
                    onClick={() => { setRunState("idle"); setResults([]); setProgress({ done: 0, total: 0 }); }}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    New run
                  </button>
                  <button
                    onClick={() => exportCSV(results)}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <Download size={13} />
                    Export CSV
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-vs-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vs-border bg-vs-raised/50">
                  <th className="text-left px-3 py-2 text-xs text-vs-muted font-medium w-10">#</th>
                  <th className="text-left px-3 py-2 text-xs text-vs-muted font-medium w-12"></th>
                  <th className="text-left px-3 py-2 text-xs text-vs-muted font-medium">Ground truth</th>
                  <th className="text-left px-3 py-2 text-xs text-vs-muted font-medium">Claude</th>
                  <th className="text-left px-3 py-2 text-xs text-vs-muted font-medium">Image</th>
                  <th className="text-left px-3 py-2 text-xs text-vs-muted font-medium">Conf</th>
                  <th className="text-left px-3 py-2 text-xs text-vs-muted font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-xs text-vs-muted font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <ResultRow key={r.idx} result={r} />
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-center py-10 text-vs-muted text-sm">
                No results in this category
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
