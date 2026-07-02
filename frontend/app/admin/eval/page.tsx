"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, ChevronLeft, ChevronRight, Database, FlaskConical,
  Loader2, RefreshCw, TrendingUp, Zap,
} from "lucide-react";
import { api, type EvalDatasetMeta, type EvalPromptEntry, type EvalRunSummary } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function pctBar(pct: number, color: string) {
  return (
    <div className="w-full bg-vs-raised rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full ${color}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function ago(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DifficultySplit({ summary }: { summary: EvalRunSummary["summary"] }) {
  return null; // TODO: per-difficulty breakdown requires full run data
}

// ── Dataset card ──────────────────────────────────────────────────────────────

function DatasetCard({ meta }: { meta: EvalDatasetMeta | null; loading: boolean }) {
  if (!meta) return (
    <div className="card p-5 flex items-center gap-3 text-vs-muted text-sm">
      <Database size={16} />
      No dataset yet — run <code className="text-vs-accent">python eval/build_dataset.py</code> to build it
    </div>
  );

  const { easy = 0, medium = 0, hard = 0 } = meta.difficulty_distribution;
  const total = meta.count;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-vs-text flex items-center gap-2">
          <Database size={15} className="text-vs-accent" /> Eval Dataset
        </h3>
        <span className="text-xs text-vs-muted">hash {meta.hash.slice(0, 8)}…</span>
      </div>
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-vs-text">{total}</p>
          <p className="text-xs text-vs-muted mt-0.5">records</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-vs-success">{easy}</p>
          <p className="text-xs text-vs-muted mt-0.5">easy</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-amber-400">{medium}</p>
          <p className="text-xs text-vs-muted mt-0.5">medium</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-vs-danger">{hard}</p>
          <p className="text-xs text-vs-muted mt-0.5">hard</p>
        </div>
      </div>
      <p className="text-xs text-vs-muted mt-3">Built {ago(meta.created_at)}</p>
    </div>
  );
}

// ── Run row ───────────────────────────────────────────────────────────────────

function RunRow({
  run,
  prompts,
  selected,
  onSelect,
  onCompare,
}: {
  run: EvalRunSummary;
  prompts: EvalPromptEntry[];
  selected: boolean;
  onSelect: () => void;
  onCompare: () => void;
}) {
  const router = useRouter();
  const s = run.summary;
  const prompt = prompts.find((p) => p.id === run.prompt_id);

  return (
    <tr
      className={`border-b border-vs-border/50 transition-colors cursor-pointer ${selected ? "bg-vs-accent/5" : "hover:bg-vs-raised/30"}`}
      onClick={onSelect}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-vs-border text-vs-accent"
        />
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-vs-text">{run.prompt_id}</p>
        <p className="text-xs text-vs-muted">{prompt?.description ?? run.prompt_schema}</p>
      </td>
      <td className="px-4 py-3 text-right">
        <p className="text-lg font-bold text-vs-text">{fmt(s.real_top1_pct)}%</p>
        {pctBar(s.real_top1_pct, "bg-vs-accent")}
      </td>
      <td className="px-4 py-3 text-right">
        <p className="text-sm text-vs-text">{fmt(s.ideal_top1_pct)}%</p>
        {pctBar(s.ideal_top1_pct, "bg-vs-success")}
      </td>
      <td className="px-4 py-3 text-right text-sm text-vs-text">{fmt(s.real_top5_pct)}%</td>
      <td className="px-4 py-3 text-right text-sm text-vs-text">{fmt(s.real_mean_rank)}</td>
      <td className="px-4 py-3 text-right">
        <span className="text-xs text-amber-400">{fmt(s.extraction_bottleneck_pct)}%</span>
        <span className="text-vs-muted mx-1">/</span>
        <span className="text-xs text-vs-danger">{fmt(s.search_bottleneck_pct)}%</span>
      </td>
      <td className="px-4 py-3 text-right text-xs text-vs-muted">{s.total - s.skipped}/{s.total}</td>
      <td className="px-4 py-3 text-xs text-vs-muted">{ago(run.timestamp)}</td>
      <td className="px-4 py-3">
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/admin/eval/run/${encodeURIComponent(run.run_id)}`); }}
          className="p-1 rounded hover:bg-vs-raised text-vs-muted hover:text-vs-text transition-colors"
          title="Drill down"
        >
          <ChevronRight size={16} />
        </button>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EvalPage() {
  const router = useRouter();
  const [dataset, setDataset] = useState<EvalDatasetMeta | null>(null);
  const [runs, setRuns] = useState<EvalRunSummary[]>([]);
  const [prompts, setPrompts] = useState<EvalPromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [d, r, p] = await Promise.all([
        api.evalDataset().catch(() => null),
        api.evalRuns(),
        api.evalPrompts().catch(() => []),
      ]);
      setDataset(d);
      setRuns(r);
      setPrompts(p);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggleSelect(runId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else if (next.size < 2) next.add(runId);
      return next;
    });
  }

  const selectedArr = Array.from(selected);
  const canCompare = selectedArr.length === 2;

  function goCompare() {
    if (!canCompare) return;
    router.push(`/admin/eval/compare?a=${encodeURIComponent(selectedArr[0])}&b=${encodeURIComponent(selectedArr[1])}`);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin")} className="p-1 rounded hover:bg-vs-raised text-vs-muted hover:text-vs-text transition-colors">
            <ChevronLeft size={18} />
          </button>
          <FlaskConical size={22} className="text-vs-accent" />
          <h1 className="text-2xl font-bold text-vs-text">Prompt Eval</h1>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-xs text-vs-muted">{selected.size}/2 selected</span>
          )}
          <button
            onClick={goCompare}
            disabled={!canCompare}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-40"
          >
            <BarChart3 size={14} /> Compare
          </button>
          <button onClick={load} className="p-2 rounded hover:bg-vs-raised text-vs-muted hover:text-vs-text transition-colors" title="Refresh">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Dataset card */}
      <div className="mb-6">
        <DatasetCard meta={dataset} loading={loading} />
      </div>

      {/* How to run */}
      <div className="card p-4 mb-6 flex items-start gap-3">
        <Zap size={15} className="text-vs-accent mt-0.5 flex-shrink-0" />
        <div className="text-xs text-vs-muted space-y-1">
          <p>Run a new eval: <code className="text-vs-text bg-vs-raised px-1.5 py-0.5 rounded">cd backend && python eval/run_eval.py --prompt v3-literal</code></p>
          <p>Compare two: <code className="text-vs-text bg-vs-raised px-1.5 py-0.5 rounded">python eval/compare.py eval/results/runA.json eval/results/runB.json</code></p>
          <p>Or select two runs from the table below and click Compare.</p>
        </div>
      </div>

      {/* Active prompts */}
      {prompts.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="text-xs font-semibold text-vs-muted uppercase tracking-wider mb-3">Registered Prompts</h3>
          <div className="flex flex-wrap gap-2">
            {prompts.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border ${p.active ? "bg-vs-accent/10 border-vs-accent/40 text-vs-accent" : "bg-vs-raised border-vs-border text-vs-muted"}`}>
                <span className="font-mono font-medium">{p.id}</span>
                {p.active && <span className="text-2xs">● active</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-vs-danger text-sm mb-4">{error}</p>}

      {/* Runs table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-vs-muted" /></div>
      ) : runs.length === 0 ? (
        <div className="card p-12 text-center">
          <TrendingUp size={32} className="text-vs-muted mx-auto mb-3 opacity-40" />
          <p className="text-vs-muted text-sm">No eval runs yet.</p>
          <p className="text-vs-muted text-xs mt-1">Run <code className="text-vs-text">python eval/run_eval.py</code> from the backend directory.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vs-border bg-vs-raised/50">
                  <th className="w-10 px-4 py-3" />
                  <th className="text-left px-4 py-3 text-vs-muted font-medium">Prompt</th>
                  <th className="text-right px-4 py-3 text-vs-muted font-medium">
                    <span title="Real-input top-1 match rate">Real top-1</span>
                  </th>
                  <th className="text-right px-4 py-3 text-vs-muted font-medium">
                    <span title="Ideal-input top-1 (search ceiling)">Ideal top-1</span>
                  </th>
                  <th className="text-right px-4 py-3 text-vs-muted font-medium">Top-5</th>
                  <th className="text-right px-4 py-3 text-vs-muted font-medium">
                    <span title="Mean rank of correct result">Avg rank</span>
                  </th>
                  <th className="text-right px-4 py-3 text-vs-muted font-medium">
                    <span title="Extract / Search bottleneck — share of failures">Bottleneck</span>
                  </th>
                  <th className="text-right px-4 py-3 text-vs-muted font-medium">Evaluated</th>
                  <th className="text-left px-4 py-3 text-vs-muted font-medium">When</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <RunRow
                    key={run.run_id}
                    run={run}
                    prompts={prompts}
                    selected={selected.has(run.run_id)}
                    onSelect={() => toggleSelect(run.run_id)}
                    onCompare={goCompare}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-vs-muted mt-4">
        <strong>Real top-1</strong> = end-to-end match rate. <strong>Ideal top-1</strong> = search ceiling (truth metadata → Discogs). Gap = extraction bottleneck. Low ideal = search bottleneck.
      </p>
    </div>
  );
}
