"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { History, Disc3, TrendingUp, Tag } from "lucide-react";
import { api, getToken, type CatalogRecord } from "@/lib/api";

function fmt(n: number) { return `$${n.toFixed(2)}`; }

const PER_PAGE = 50;

export default function MovementsPage() {
  const router = useRouter();
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      // Show all records (both statuses) ordered by most recently sold/added
      const res = await api.listCatalog({ page: pg, per_page: PER_PAGE, status: "all" });
      setRecords(res.records);
      setTotal(res.total);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    load(1);
  }, [router, load]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-medium">Movements</h1>
        <p className="text-sm text-vs-text-2 mt-0.5">Full record lifecycle — scanned, cataloged, sold</p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Disc3 size={24} className="animate-spin text-vs-muted" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <History size={32} className="text-vs-muted" />
            <p className="text-sm text-vs-text-2">No records yet.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Status</th>
                <th>Cost</th>
                <th>Price</th>
                <th>Added</th>
                <th>Sold</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className={r.status === "sold" ? "opacity-70" : ""}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded bg-vs-raised border border-vs-border flex items-center justify-center flex-shrink-0">
                        <Disc3 size={11} className="text-vs-muted" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate max-w-[200px]">
                          {r.artist && r.title ? `${r.artist} — ${r.title}` : r.artist || r.title || "Unknown"}
                        </p>
                        <p className="text-xs text-vs-muted">{r.condition} · {r.format ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    {r.status === "sold"
                      ? <span className="pill-sold"><span className="w-1.5 h-1.5 rounded-full bg-vs-teal" />Sold</span>
                      : <span className="pill-in-stock"><span className="w-1.5 h-1.5 rounded-full bg-vs-success" />In stock</span>
                    }
                  </td>
                  <td><span className="text-xs text-vs-text-2">{r.cost_price != null ? fmt(r.cost_price) : "—"}</span></td>
                  <td>
                    {r.status === "sold"
                      ? <span className="text-sm font-medium text-vs-gold">{r.sold_price != null ? fmt(r.sold_price) : "—"}</span>
                      : <span className="text-xs text-vs-text-2">{r.asking_price != null ? fmt(r.asking_price) : "—"}</span>
                    }
                  </td>
                  <td>
                    <span className="text-xs text-vs-muted">
                      {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-vs-muted">
                      {r.sold_at ? new Date(r.sold_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Previous</button>
          <span className="text-xs text-vs-text-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); load(p); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
