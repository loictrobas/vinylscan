"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { api, type EvalComparison, type EvalComparisonEntry } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function DiffBadge({ value }: { value: number }) {
  if (value > 0) return <span className="text-vs-success font-semibold">+{value}</span>;
  if (value < 0) return <span className="text-vs-danger font-semibold">{value}</span>;
  return <span className="text-vs-muted">0</span>;
}

function StatCard({ label, a, b }: { label: string; a: number | null | undefined; b: number | null | undefined }) {
  const diff = (b ?? 0) - (a ?? 0);
  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-vs-muted mb-2">{label}</p>
      <div className="flex items-end justify-center gap-3">
        <div>
          <p className="text-lg font-bold text-vs-text">{fmt(a)}%</p>
          <p className="text-2xs text-vs-muted">A</p>
        </div>
        <div className="mb-1">
          {diff > 0.05 ? <TrendingUp size={16} className="text-vs-success" /> :
           diff < -0.05 ? <TrendingDown size={16} className="text-vs-danger" /> :
           <Minus size={16} className="text-vs-muted" />}
        </div>
        <div>
          <p className="text-lg font-bold text-vs-text">{fmt(b)}%</p>
          <p className="text-2xs text-vs-muted">B</p>
        </div>
      </div>
      <p className="text-xs mt-2"><DiffBadge value={parseFloat(fmt(diff))} /></p>
    </div>
  );
}

function RecordTable({ entries, label, color }: { entries: EvalComparisonEntry[]; label: string; color: string }) {
  if (entries.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <div className={`px-4 py-2.5 border-b border-vs-border flex items-center gap-2 ${color}`}>
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs opacity-70">({entries.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-vs-border bg-vs-raised/30">
              <th className="text-left px-4 py-2 text-vs-muted font-medium">Release ID</th>
              <th className="text-left px-4 py-2 text-vs-muted font-medium">Difficulty</th>
              <th className="text-left px-4 py-2 text-vs-muted font-medium">Genre</th>
              <th className="text-right px-4 py-2 text-vs-muted font-medium">A rank</th>
              <th className="text-right px-4 py-2 text-vs-muted font-medium">B rank</th>
              <th className="text-left px-4 py-2 text-vs-muted font-medium">A extracted</th>
              <th className="text-left px-4 py-2 text-vs-muted font-medium">B extracted</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const aExt = e.a_extracted as Record<string, unknown>;
              const bExt = e.b_extracted as Record<string, unknown>;
              return (
                <tr key={e.release_id} className="border-b border-vs-border/40 hover:bg-vs-raised/20">
                  <td className="px-4 py-2 font-mono text-vs-text">{e.release_id}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-2xs font-medium ${
                      e.difficulty === "easy" ? "bg-vs-success/15 text-vs-success" :
                      e.difficulty === "hard" ? "bg-vs-danger/15 text-vs-danger" :
                      "bg-amber-500/15 text-amber-400"
                    }`}>{e.difficulty}</span>
                  </td>
                  <td className="px-4 py-2 text-vs-muted">{e.genres.slice(0, 2).join(", ")}</td>
                  <td className="px-4 py-2 text-right text-vs-muted">{e.a_rank ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-vs-muted">{e.b_rank ?? "—"}</td>
                  <td className="px-4 py-2 text-vs-muted max-w-48">
                    <p className="truncate">{String(aExt.artist ?? "—")} / {String(aExt.title ?? "—")}</p>
                    <p className="truncate text-vs-muted/70">{String(aExt.catalog_number ?? "—")}</p>
                  </td>
                  <td className="px-4 py-2 text-vs-muted max-w-48">
                    <p className="truncate">{String(bExt.artist ?? "—")} / {String(bExt.title ?? "—")}</p>
                    <p className="truncate text-vs-muted/70">{String(bExt.catalog_number ?? "—")}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Inner component (needs useSearchParams) ────────────────────────────────────

function CompareInner() {
  const router = useRouter();
  const params = useSearchParams();
  const runA = params.get("a") ?? "";
  const runB = params.get("b") ?? "";

  const [data, setData] = useState<EvalComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runA || !runB) { setLoading(false); return; }
    setLoading(true);
    api.evalCompare(runA, runB)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runA, runB]);

  if (!runA || !runB) return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center text-vs-muted">
      Missing ?a= and ?b= query params
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/admin/eval")} className="p-1 rounded hover:bg-vs-raised text-vs-muted hover:text-vs-text transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-vs-text">A vs B Comparison</h1>
          <p className="text-xs text-vs-muted mt-0.5">
            <span className="text-vs-text">{runA}</span>
            <span className="mx-2">vs</span>
            <span className="text-vs-text">{runB}</span>
          </p>
        </div>
      </div>

      {error && <p className="text-vs-danger text-sm">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-vs-muted" /></div>
      ) : data ? (
        <>
          {/* Top metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Real top-1" a={data.run_a.summary.real_top1_pct} b={data.run_b.summary.real_top1_pct} />
            <StatCard label="Ideal top-1" a={data.run_a.summary.ideal_top1_pct} b={data.run_b.summary.ideal_top1_pct} />
            <StatCard label="Real top-5" a={data.run_a.summary.real_top5_pct} b={data.run_b.summary.real_top5_pct} />
            <div className="card p-4 text-center">
              <p className="text-xs text-vs-muted mb-2">Net change</p>
              <p className={`text-3xl font-bold ${data.comparison.net_change > 0 ? "text-vs-success" : data.comparison.net_change < 0 ? "text-vs-danger" : "text-vs-muted"}`}>
                {data.comparison.net_change > 0 ? "+" : ""}{data.comparison.net_change}
              </p>
              <p className="text-2xs text-vs-muted mt-1">fixed − broken</p>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Fixed", count: data.comparison.fixed_count, color: "bg-vs-success/15 text-vs-success border-vs-success/30" },
              { label: "Broken", count: data.comparison.broken_count, color: "bg-vs-danger/15 text-vs-danger border-vs-danger/30" },
              { label: "Both pass", count: data.comparison.both_pass_count, color: "bg-vs-raised text-vs-muted border-vs-border" },
              { label: "Both fail", count: data.comparison.both_fail_count, color: "bg-vs-raised text-vs-muted border-vs-border" },
              { label: "Common", count: data.comparison.total_common, color: "bg-vs-raised text-vs-muted border-vs-border" },
            ].map(({ label, count, color }) => (
              <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${color}`}>
                <span className="font-bold">{count}</span>
                <span className="text-xs">{label}</span>
              </div>
            ))}
          </div>

          {/* By difficulty */}
          {Object.keys(data.by_difficulty).length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-vs-border bg-vs-raised/30">
                <span className="text-xs font-semibold text-vs-muted uppercase tracking-wider">By Difficulty</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vs-border bg-vs-raised/20">
                    {["", "Total", "Fixed", "Broken", "Both pass", "Both fail"].map((h) => (
                      <th key={h} className={`px-4 py-2 text-vs-muted font-medium ${h === "" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.by_difficulty).map(([diff, stats]) => (
                    <tr key={diff} className="border-b border-vs-border/40">
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          diff === "easy" ? "bg-vs-success/15 text-vs-success" :
                          diff === "hard" ? "bg-vs-danger/15 text-vs-danger" :
                          "bg-amber-500/15 text-amber-400"
                        }`}>{diff}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-vs-muted">{stats.total}</td>
                      <td className="px-4 py-2 text-right text-vs-success font-medium">{stats.fixed}</td>
                      <td className="px-4 py-2 text-right text-vs-danger font-medium">{stats.broken}</td>
                      <td className="px-4 py-2 text-right text-vs-muted">{stats.both_pass}</td>
                      <td className="px-4 py-2 text-right text-vs-muted">{stats.both_fail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Fixed / Broken record tables */}
          <RecordTable
            entries={data.fixed}
            label="Fixed — A failed, B passed"
            color="bg-vs-success/5 text-vs-success"
          />
          <RecordTable
            entries={data.broken}
            label="Broken — A passed, B failed"
            color="bg-vs-danger/5 text-vs-danger"
          />
        </>
      ) : null}
    </div>
  );
}

// ── Page (wrap in Suspense for useSearchParams) ───────────────────────────────

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-vs-muted" /></div>}>
      <CompareInner />
    </Suspense>
  );
}
