"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Search, X, Disc3, TrendingUp } from "lucide-react";
import { api, getToken, type CatalogRecord } from "@/lib/api";

function fmt(n: number) { return `$${n.toFixed(2)}`; }

const PER_PAGE = 40;

export default function SalesHistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const searchTimer = { current: null as ReturnType<typeof setTimeout> | null };

  const load = useCallback(async (pg: number, q: string) => {
    setLoading(true);
    try {
      const res = await api.listCatalog({ page: pg, per_page: PER_PAGE, status: "sold", search: q || undefined });
      setRecords(res.records);
      setTotal(res.total);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    load(1, "");
  }, [router, load]);

  function handleSearch(v: string) {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(1); load(1, v); }, 300);
  }

  const totalRevenue = records.reduce((s, r) => s + (r.sold_price ?? 0), 0);
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium">Sales history</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{total} record{total !== 1 ? "s" : ""} sold</p>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2 text-vs-gold text-sm font-medium">
            <TrendingUp size={14} />
            {fmt(totalRevenue)} shown
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs mb-4">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted" />
        <input
          value={searchInput}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search sold records…"
          className="input pl-8 pr-8"
        />
        {searchInput && (
          <button onClick={() => { setSearchInput(""); handleSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted hover:text-vs-text">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Disc3 size={24} className="animate-spin text-vs-muted" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList size={36} className="text-vs-muted" />
            <p className="text-vs-text-2 text-sm">{search ? "No sold records match." : "No sales yet."}</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Condition</th>
                <th>Format</th>
                <th>Cost</th>
                <th>Sold price</th>
                <th>Margin</th>
                <th>Sold at</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const margin = r.cost_price != null && r.sold_price != null
                  ? ((r.sold_price - r.cost_price) / r.sold_price * 100)
                  : null;
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded bg-vs-raised border border-vs-border flex items-center justify-center flex-shrink-0">
                          <Disc3 size={11} className="text-vs-muted" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-vs-text truncate max-w-[200px]">
                            {r.artist && r.title ? `${r.artist} — ${r.title}` : r.artist || r.title || "Unknown"}
                          </p>
                          <p className="text-xs text-vs-muted">{[r.year, r.label].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs text-vs-text-2">{r.condition}</span>
                    </td>
                    <td>
                      <span className="text-xs text-vs-text-2">{r.format ?? "—"}</span>
                    </td>
                    <td>
                      <span className="text-xs text-vs-text-2">{r.cost_price != null ? fmt(r.cost_price) : "—"}</span>
                    </td>
                    <td>
                      <span className="text-sm font-medium text-vs-gold">{r.sold_price != null ? fmt(r.sold_price) : "—"}</span>
                    </td>
                    <td>
                      {margin != null ? (
                        <span className={`text-xs font-medium ${margin >= 0 ? "text-vs-success" : "text-vs-danger"}`}>
                          {margin >= 0 ? "+" : ""}{margin.toFixed(1)}%
                        </span>
                      ) : <span className="text-xs text-vs-muted">—</span>}
                    </td>
                    <td>
                      <span className="text-xs text-vs-muted">
                        {r.sold_at ? new Date(r.sold_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </span>
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
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p, search); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Previous</button>
          <span className="text-xs text-vs-text-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); load(p, search); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
