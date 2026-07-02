"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Search, X, Disc3, TrendingUp, Download, Info, RotateCcw } from "lucide-react";
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

  const [cancelling, setCancelling] = useState<string | null>(null);

  async function handleCancelSale(id: string) {
    if (!confirm("Cancel this sale? The record will go back to In stock.")) return;
    setCancelling(id);
    try {
      await api.unsellRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setTotal((t) => t - 1);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to cancel sale");
    } finally {
      setCancelling(null);
    }
  }

  const [sortBy, setSortBy] = useState<"title" | "condition" | "format" | "cost_price" | "sold_price" | "margin" | "sold_at">("sold_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  }

  const sortedRecords = [...records].sort((a, b) => {
    let av: string | number | null = null;
    let bv: string | number | null = null;
    if (sortBy === "title") { av = `${a.artist ?? ""} ${a.title ?? ""}`; bv = `${b.artist ?? ""} ${b.title ?? ""}`; }
    else if (sortBy === "condition") { av = a.condition ?? ""; bv = b.condition ?? ""; }
    else if (sortBy === "format") { av = a.format ?? ""; bv = b.format ?? ""; }
    else if (sortBy === "cost_price") { av = a.cost_price ?? -Infinity; bv = b.cost_price ?? -Infinity; }
    else if (sortBy === "sold_price") { av = a.sold_price ?? -Infinity; bv = b.sold_price ?? -Infinity; }
    else if (sortBy === "margin") {
      av = a.cost_price != null && a.sold_price != null ? (a.sold_price - a.cost_price) / a.sold_price : -Infinity;
      bv = b.cost_price != null && b.sold_price != null ? (b.sold_price - b.cost_price) / b.sold_price : -Infinity;
    }
    else if (sortBy === "sold_at") { av = a.sold_at ?? ""; bv = b.sold_at ?? ""; }
    if (av === null || av === bv) return 0;
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalRevenue = records.reduce((s, r) => s + (r.sold_price ?? 0), 0);
  const totalPages = Math.ceil(total / PER_PAGE);
  const allMarginsNull = records.length > 0 && records.every((r) => r.cost_price == null);

  function exportCSV() {
    const headers = ["Artist", "Title", "Condition", "Format", "Cost", "Sold Price", "Margin %", "Sold At"];
    const rows = records.map((r) => {
      const margin =
        r.cost_price != null && r.sold_price != null
          ? (((r.sold_price - r.cost_price) / r.sold_price) * 100).toFixed(1)
          : "";
      return [
        r.artist ?? "", r.title ?? "", r.condition ?? "", r.format ?? "",
        r.cost_price?.toFixed(2) ?? "", r.sold_price?.toFixed(2) ?? "",
        margin, r.sold_at ? new Date(r.sold_at).toLocaleDateString() : "",
      ];
    });
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="sticky top-0 z-20 bg-vs-bg px-6 pt-6 pb-4 border-b border-vs-border/50 mb-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Sales history</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{total} record{total !== 1 ? "s" : ""} sold</p>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-vs-gold text-sm font-medium">
              <TrendingUp size={14} />
              {fmt(totalRevenue)} shown
            </div>
            <button
              onClick={exportCSV}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-2.5"
              title="Export current page to CSV"
            >
              <Download size={12} />Export CSV
            </button>
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
      </div>{/* /sticky header */}

      <div className="px-6">
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Disc3 size={24} className="animate-spin text-vs-muted" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-vs-accent/10 flex items-center justify-center">
              <ClipboardList size={28} className="text-vs-accent" />
            </div>
            {search ? (
              <p className="text-sm text-vs-text-2">No sold records match your search.</p>
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium text-vs-text">No sales yet</p>
                  <p className="text-xs text-vs-muted mt-1">Sell your first record from the point of sale</p>
                </div>
                <a href="/sales" className="btn-primary text-sm">Open POS</a>
              </>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {(["title", "condition", "format", "cost_price", "sold_price", "margin", "sold_at"] as const).map((col) => {
                  const labels: Record<string, React.ReactNode> = {
                    title: "Record", condition: "Condition", format: "Format",
                    cost_price: "Cost", sold_price: "Sold price",
                    margin: <span className="flex items-center gap-1">Margin{allMarginsNull && <span title="Add cost price to records to track margin" className="text-vs-muted/60 cursor-help"><Info size={10} /></span>}</span>,
                    sold_at: "Sold at",
                  };
                  const active = sortBy === col;
                  return (
                    <th key={col} onClick={() => toggleSort(col)} className="cursor-pointer select-none hover:text-vs-text transition-colors">
                      <span className="flex items-center gap-1">{labels[col]}<span className="text-vs-muted/60">{active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span></span>
                    </th>
                  );
                })}
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((r) => {
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
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleCancelSale(r.id)}
                        disabled={cancelling === r.id}
                        title="Cancel sale — return to stock"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-vs-muted hover:text-vs-danger hover:bg-vs-danger/10 text-xs transition-colors disabled:opacity-40"
                      >
                        <RotateCcw size={11} />
                        {cancelling === r.id ? "…" : "Cancel"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-vs-border bg-vs-raised/40">
                <td className="px-4 py-3 pl-5 text-xs text-vs-muted" colSpan={4}>
                  {records.length} record{records.length !== 1 ? "s" : ""} on this page
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-vs-gold">{fmt(totalRevenue)}</span>
                </td>
                <td className="px-4 py-3 pr-5" colSpan={3} />
              </tr>
            </tfoot>
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
      </div>{/* /px-6 content */}
    </div>
  );
}
