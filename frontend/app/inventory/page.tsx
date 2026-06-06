"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Archive, Disc3, Search, X, ChevronDown } from "lucide-react";
import { api, getToken, type CatalogRecord } from "@/lib/api";
import Link from "next/link";

function fmt(n: number) { return `$${n.toFixed(2)}`; }

const COND_COLORS: Record<string, string> = {
  M: "bg-purple-500/15 text-purple-300",
  NM: "bg-vs-success/15 text-vs-success",
  "VG+": "bg-vs-accent/15 text-vs-accent",
  VG: "bg-vs-warning/15 text-vs-warning",
  G: "bg-vs-danger/15 text-vs-danger",
};

const FORMATS = ["LP", "EP", "7\"", "12\"", "CD", "Cassette", "Box Set", "Other"];
const CONDITIONS = ["M", "NM", "VG+", "VG", "G"];

const PER_PAGE = 50;

export default function InventoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [condFilter, setCondFilter] = useState("");

  const load = useCallback(async (pg: number, q: string, fmt: string, cond: string) => {
    setLoading(true);
    try {
      const res = await api.listCatalog({
        page: pg, per_page: PER_PAGE, status: "in_stock",
        search: q || undefined, format: fmt || undefined, condition: cond || undefined,
      });
      setRecords(res.records);
      setTotal(res.total);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    load(1, "", "", "");
  }, [router, load]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); load(1, searchInput, formatFilter, condFilter); }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, formatFilter, condFilter]);

  const totalValue = records.reduce((s, r) => s + (r.asking_price ?? 0), 0);
  const totalCost = records.reduce((s, r) => s + (r.cost_price ?? 0), 0);
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium">Stock</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{total} records in stock</p>
        </div>
        <Link href="/catalog" className="btn-secondary flex items-center gap-2 text-sm">
          <Archive size={13} />
          Full catalog
        </Link>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="metric-card">
          <p className="text-xs text-vs-text-2">In stock</p>
          <p className="text-2xl font-medium">{total}</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-vs-text-2">Stock value</p>
          <p className="text-2xl font-medium text-vs-gold">{fmt(totalValue)}</p>
          <p className="text-xs text-vs-muted -mt-1">asking prices</p>
        </div>
        <div className="metric-card">
          <p className="text-xs text-vs-text-2">Total cost</p>
          <p className="text-2xl font-medium">{fmt(totalCost)}</p>
          <p className="text-xs text-vs-muted -mt-1">cost prices</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search…" className="input pl-8 pr-8" />
          {searchInput && (
            <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted hover:text-vs-text">
              <X size={11} />
            </button>
          )}
        </div>
        <div className="relative">
          <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="input pr-8 appearance-none">
            <option value="">All formats</option>
            {FORMATS.map((f) => <option key={f}>{f}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-vs-muted pointer-events-none" />
        </div>
        <div className="relative">
          <select value={condFilter} onChange={(e) => setCondFilter(e.target.value)} className="input pr-8 appearance-none">
            <option value="">All conditions</option>
            {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-vs-muted pointer-events-none" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Disc3 size={24} className="animate-spin text-vs-muted" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Archive size={32} className="text-vs-muted" />
            <p className="text-sm text-vs-text-2">No records match.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Format</th>
                <th>Condition</th>
                <th>Cost</th>
                <th>Price</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const margin = r.cost_price != null && r.asking_price != null && r.asking_price > 0
                  ? ((r.asking_price - r.cost_price) / r.asking_price * 100)
                  : null;
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded bg-vs-raised border border-vs-border flex items-center justify-center flex-shrink-0">
                          <Disc3 size={11} className="text-vs-muted" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-[200px]">
                            {r.artist && r.title ? `${r.artist} — ${r.title}` : r.artist || r.title || "Unknown"}
                          </p>
                          <p className="text-xs text-vs-muted">{[r.year, r.label].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                    </td>
                    <td><span className="text-xs text-vs-text-2">{r.format ?? "—"}</span></td>
                    <td>
                      <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${COND_COLORS[r.condition] ?? "bg-vs-raised text-vs-text-2"}`}>
                        {r.condition}
                      </span>
                    </td>
                    <td><span className="text-xs text-vs-text-2">{r.cost_price != null ? fmt(r.cost_price) : "—"}</span></td>
                    <td><span className="text-sm font-medium text-vs-gold">{r.asking_price != null ? fmt(r.asking_price) : "—"}</span></td>
                    <td>
                      {margin != null
                        ? <span className={`text-xs font-medium ${margin >= 0 ? "text-vs-success" : "text-vs-danger"}`}>{margin >= 0 ? "+" : ""}{margin.toFixed(1)}%</span>
                        : <span className="text-xs text-vs-muted">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p, search, formatFilter, condFilter); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Previous</button>
          <span className="text-xs text-vs-text-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); load(p, search, formatFilter, condFilter); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
