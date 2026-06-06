"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Archive, Disc3, Search, X, ChevronDown,
  DollarSign, Check, ShoppingCart, Tag, Trash2,
} from "lucide-react";
import { api, getToken, type CatalogRecord, type Lot } from "@/lib/api";
import Link from "next/link";
import { CoverThumb } from "@/components/CoverThumb";
import { CondBadge } from "@/components/CondBadge";
import { RowCheckbox } from "@/components/RowCheckbox";
import { RecordModal } from "@/components/RecordModal";

function fmt(n: number) { return `$${n.toFixed(2)}`; }

const FORMATS = ["LP", "EP", "7\"", "12\"", "CD", "Cassette", "Box Set", "Other"];
const CONDITIONS = ["M", "NM", "VG+", "VG", "G"];
const PER_PAGE = 50;

// ── Sell button (inline) ──────────────────────────────────────────────────────

function SellButton({ record, onSold }: { record: CatalogRecord; onSold: (r: CatalogRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(record.asking_price != null ? String(record.asking_price) : "");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-vs-success/10 hover:bg-vs-success/20 text-vs-success text-xs font-medium transition-colors border border-vs-success/20"
      >
        <DollarSign size={11} />Sell
      </button>
    );
  }
  async function confirm() {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return;
    setSaving(true);
    try { onSold(await api.sellRecord(record.id, n)); setOpen(false); }
    finally { setSaving(false); }
  }
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs text-vs-muted">$</span>
      <input
        autoFocus type="number" min="0" step="0.01" value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") setOpen(false); }}
        className="w-16 bg-vs-raised border border-vs-border-2 rounded px-1.5 py-0.5 text-xs text-vs-text focus:outline-none focus:border-vs-accent"
      />
      <button onClick={confirm} disabled={saving} className="text-vs-success hover:text-vs-success/80 disabled:opacity-50"><Check size={12} /></button>
      <button onClick={() => setOpen(false)} className="text-vs-muted hover:text-vs-text"><X size={11} /></button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [condFilter, setCondFilter] = useState("");

  // Modal
  const [editRecord, setEditRecord] = useState<CatalogRecord | undefined>();
  const [showModal, setShowModal] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (pg: number, q: string, fmt: string, cond: string) => {
    setLoading(true);
    setSelectedIds(new Set());
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
    api.listLots().then(setLots).catch(() => {});
  }, [router, load]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(searchInput); setPage(1); load(1, searchInput, formatFilter, condFilter); }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, formatFilter, condFilter]);

  function handleSaved(r: CatalogRecord) {
    setRecords((prev) => {
      // If record sold → remove from in_stock list
      if (r.status === "sold") return prev.filter((x) => x.id !== r.id);
      const idx = prev.findIndex((x) => x.id === r.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = r; return next; }
      return prev;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === records.length ? new Set() : new Set(records.map((r) => r.id)));
  }

  async function handleBulkDelete() {
    const results = await Promise.allSettled([...selectedIds].map((id) => api.deleteRecord(id)));
    const deleted = new Set<string>();
    results.forEach((r, i) => { if (r.status === "fulfilled") deleted.add([...selectedIds][i]); });
    setRecords((prev) => prev.filter((r) => !deleted.has(r.id)));
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) alert(`${failed} record${failed > 1 ? "s" : ""} could not be deleted.`);
  }

  async function handleBulkAddToLot(lotId: string) {
    if (!lotId) return;
    await Promise.allSettled([...selectedIds].map((id) => api.updateRecord(id, { lot_id: lotId })));
    setSelectedIds(new Set());
    load(page, search, formatFilter, condFilter);
  }

  function handleAddToCart() {
    const selected = records.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    localStorage.setItem("vinylscan_pos_cart", JSON.stringify(selected));
    router.push("/sales");
  }

  const totalValue = records.reduce((s, r) => s + (r.asking_price ?? 0), 0);
  const totalCost = records.reduce((s, r) => s + (r.cost_price ?? 0), 0);
  const totalPages = Math.ceil(total / PER_PAGE);
  const lotMap = Object.fromEntries(lots.map((l) => [l.id, l.name]));
  const allSelected = records.length > 0 && selectedIds.size === records.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="px-6 py-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium">Stock</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{total} records in stock</p>
        </div>
        <Link href="/catalog" className="btn-secondary flex items-center gap-2 text-sm">
          <Archive size={13} />Full catalog
        </Link>
      </div>

      {/* Summary */}
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
            <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted hover:text-vs-text"><X size={11} /></button>
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

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Disc3 size={24} className="animate-spin text-vs-muted" /></div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Archive size={32} className="text-vs-muted" />
            <p className="text-sm text-vs-text-2">No records match.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10 pr-0">
                  <RowCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleSelectAll} />
                </th>
                <th className="w-[40%]">Record</th>
                <th>Format</th>
                <th>Cond.</th>
                <th>Cost</th>
                <th>Price</th>
                <th>Margin</th>
                <th>Lot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const margin = r.cost_price != null && r.asking_price != null && r.asking_price > 0
                  ? ((r.asking_price - r.cost_price) / r.asking_price * 100)
                  : null;
                const unverifiedCond = r.discogs_synced && r.condition === "VG+";
                const isSelected = selectedIds.has(r.id);

                return (
                  <tr
                    key={r.id}
                    className={`cursor-pointer transition-colors ${isSelected ? "bg-vs-accent/5" : ""}`}
                    onClick={() => { setEditRecord(r); setShowModal(true); }}
                  >
                    <td className="pr-0" onClick={(e) => e.stopPropagation()}>
                      <RowCheckbox checked={isSelected} onChange={() => toggleSelect(r.id)} />
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <CoverThumb url={r.cover_image_url} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-vs-muted leading-tight">{r.artist || <span className="italic">Unknown artist</span>}</p>
                          <p className="text-sm font-medium text-vs-text leading-snug">{r.title || <span className="italic text-vs-muted">Untitled</span>}</p>
                          <p className="text-2xs text-vs-muted mt-0.5">{[r.year, r.label].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                    </td>
                    <td><span className="text-xs text-vs-text-2">{r.format ?? "—"}</span></td>
                    <td><CondBadge c={r.condition} unverified={unverifiedCond} /></td>
                    <td><span className="text-xs text-vs-text-2">{r.cost_price != null ? fmt(r.cost_price) : "—"}</span></td>
                    <td><span className="text-sm font-medium text-vs-gold">{r.asking_price != null ? fmt(r.asking_price) : "—"}</span></td>
                    <td>
                      {margin != null
                        ? <span className={`text-xs font-medium ${margin >= 0 ? "text-vs-success" : "text-vs-danger"}`}>{margin >= 0 ? "+" : ""}{margin.toFixed(1)}%</span>
                        : <span className="text-xs text-vs-muted">—</span>
                      }
                    </td>
                    <td><span className="text-xs text-vs-text-2">{r.lot_id && lotMap[r.lot_id] ? lotMap[r.lot_id] : "—"}</span></td>
                    <td>
                      <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                        <SellButton record={r} onSold={handleSaved} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p, search, formatFilter, condFilter); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Previous</button>
          <span className="text-xs text-vs-text-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); load(p, search, formatFilter, condFilter); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Next</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-vs-card border border-vs-border rounded-xl px-4 py-3 shadow-2xl shadow-black/40">
          <span className="text-sm font-medium text-vs-text">{selectedIds.size} selected</span>
          <button onClick={() => setSelectedIds(new Set())} className="text-vs-muted hover:text-vs-text"><X size={14} /></button>
          <div className="w-px h-4 bg-vs-border" />
          <button onClick={() => setBulkDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-vs-danger hover:bg-vs-danger/10 text-sm font-medium transition-colors">
            <Trash2 size={13} />Delete
          </button>
          {lots.length > 0 && (
            <div className="relative">
              <select
                defaultValue=""
                onChange={(e) => { if (e.target.value) { handleBulkAddToLot(e.target.value); (e.target as HTMLSelectElement).value = ""; } }}
                className="pl-3 pr-7 py-1.5 bg-vs-raised border border-vs-border rounded-lg text-sm text-vs-text-2 focus:outline-none focus:border-vs-accent appearance-none cursor-pointer"
              >
                <option value="" disabled>Add to lot…</option>
                {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <Tag size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-vs-muted pointer-events-none" />
            </div>
          )}
          <button onClick={handleAddToCart} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-vs-accent text-vs-bg text-sm font-medium hover:bg-vs-accent/90 transition-colors">
            <ShoppingCart size={13} />Add to cart
          </button>
        </div>
      )}

      {/* Edit modal */}
      {showModal && editRecord && (
        <RecordModal record={editRecord} lots={lots} onClose={() => setShowModal(false)} onSaved={handleSaved} />
      )}

      {/* Bulk delete confirm */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setBulkDeleteConfirm(false)} />
          <div className="relative bg-vs-card border border-vs-border rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-medium mb-2">Delete {selectedIds.size} records?</h3>
            <p className="text-sm text-vs-text-2 mb-4">This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBulkDeleteConfirm(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleBulkDelete} className="btn-danger">Delete all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
