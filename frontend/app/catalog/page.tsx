"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Disc3, Search, X, Plus, ExternalLink, ChevronDown,
  Trash2, DollarSign, Check, ShoppingCart, Tag,
} from "lucide-react";
import { api, getToken, type CatalogRecord, type Lot } from "@/lib/api";
import { CoverThumb } from "@/components/CoverThumb";
import { CondBadge } from "@/components/CondBadge";
import { RowCheckbox } from "@/components/RowCheckbox";
import { RecordModal } from "@/components/RecordModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "in_stock" | "sold" }) {
  return status === "sold"
    ? <span className="pill-sold"><span className="w-1.5 h-1.5 rounded-full bg-vs-teal" />Sold</span>
    : <span className="pill-in-stock"><span className="w-1.5 h-1.5 rounded-full bg-vs-success" />In stock</span>;
}

function fmt(n: number) { return `$${n.toFixed(2)}`; }

// ── Market price display ──────────────────────────────────────────────────────

interface PriceData { lowest: number; currency: string; num_for_sale: number }

function MarketCell({ data, loading }: { data: PriceData | null | undefined; loading: boolean }) {
  if (loading) return <span className="text-2xs text-vs-muted animate-pulse">…</span>;
  if (!data) return <span className="text-xs text-vs-muted">—</span>;
  return (
    <div>
      <span className="text-xs font-medium text-vs-text-2">
        {data.currency === "USD" ? "$" : data.currency + " "}{data.lowest.toFixed(2)}
      </span>
      <p className="text-2xs text-vs-muted">{data.num_for_sale} for sale</p>
    </div>
  );
}

// ── Sell button ───────────────────────────────────────────────────────────────

function SellButton({ record, onSold }: { record: CatalogRecord; onSold: (r: CatalogRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(record.asking_price != null ? String(record.asking_price) : "");
  const [saving, setSaving] = useState(false);

  if (record.status === "sold") {
    return <span className="text-xs text-vs-teal font-medium px-2 py-1">Sold</span>;
  }
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
      <button onClick={confirm} disabled={saving} className="text-vs-success hover:text-vs-success/80 disabled:opacity-50">
        <Check size={12} />
      </button>
      <button onClick={() => setOpen(false)} className="text-vs-muted hover:text-vs-text"><X size={11} /></button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PER_PAGE = 40;

export default function CatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"in_stock" | "sold" | "all">("in_stock");
  const [lotFilter, setLotFilter] = useState(searchParams.get("lot_id") ?? "");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<CatalogRecord | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const [prices, setPrices] = useState<Record<string, PriceData | null | undefined>>({});
  const pricesFetchedRef = useRef<Set<string>>(new Set());

  const fetchRecords = useCallback(async (pg: number, status: string, lot: string, q: string) => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const res = await api.listCatalog({
        page: pg, per_page: PER_PAGE, status,
        no_lot: lot === "none",
        lot_id: lot !== "" && lot !== "none" ? lot : undefined,
        search: q || undefined,
      });
      setRecords(res.records);
      setTotal(res.total);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.listLots().then(setLots).catch(() => {});
  }, [router]);

  useEffect(() => {
    setPage(1);
    fetchRecords(1, statusFilter, lotFilter, search);
  }, [statusFilter, lotFilter, search, fetchRecords]);

  useEffect(() => {
    if (records.length === 0) return;
    const newIds = records
      .filter((r) => r.discogs_release_id != null)
      .map((r) => r.discogs_release_id!)
      .filter((id) => !pricesFetchedRef.current.has(String(id)));
    if (newIds.length === 0) return;
    setPrices((prev) => {
      const next = { ...prev };
      for (const id of newIds) next[String(id)] = undefined;
      return next;
    });
    newIds.forEach((id) => pricesFetchedRef.current.add(String(id)));
    api.fetchDiscogsPrices(newIds)
      .then((data) => setPrices((prev) => ({ ...prev, ...data })))
      .catch(() => {
        setPrices((prev) => {
          const next = { ...prev };
          for (const id of newIds) next[String(id)] = null;
          return next;
        });
      });
  }, [records]);

  function handleSearch(v: string) {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  }

  function handleSaved(r: CatalogRecord) {
    setRecords((prev) => {
      const idx = prev.findIndex((x) => x.id === r.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = r; return next; }
      return [r, ...prev];
    });
  }

  async function handleDelete(id: string) {
    await api.deleteRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setDeleteId(null);
  }

  function openEdit(r: CatalogRecord) { setEditRecord(r); setShowModal(true); }

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
    fetchRecords(page, statusFilter, lotFilter, search);
  }

  function handleAddToCart() {
    const selected = records.filter((r) => selectedIds.has(r.id) && r.status === "in_stock");
    if (selected.length === 0) return;
    localStorage.setItem("vinylscan_pos_cart", JSON.stringify(selected));
    router.push("/sales");
  }

  const lotMap = Object.fromEntries(lots.map((l) => [l.id, l.name]));
  const totalPages = Math.ceil(total / PER_PAGE);
  const allSelected = records.length > 0 && selectedIds.size === records.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="px-6 py-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium">Records</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{total} record{total !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => { setEditRecord(undefined); setShowModal(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={14} />New record
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted" />
          <input value={searchInput} onChange={(e) => handleSearch(e.target.value)} placeholder="Search artist or title…" className="input pl-8 pr-8" />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); setSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted hover:text-vs-text"><X size={12} /></button>
          )}
        </div>
        <div className="flex bg-vs-raised border border-vs-border rounded-lg overflow-hidden flex-shrink-0">
          {(["in_stock", "sold", "all"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-sm transition-colors ${statusFilter === s ? "bg-vs-accent text-vs-bg font-medium" : "text-vs-text-2 hover:text-vs-text"}`}>
              {s === "in_stock" ? "In stock" : s === "sold" ? "Sold" : "All"}
            </button>
          ))}
        </div>
        {lots.length > 0 && (
          <div className="relative">
            <select value={lotFilter} onChange={(e) => setLotFilter(e.target.value)} className="input pr-8 appearance-none flex-shrink-0">
              <option value="">All lots</option>
              <option value="none">No lot</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.in_stock_count})</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-vs-muted pointer-events-none" />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Disc3 size={24} className="animate-spin text-vs-muted" /></div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center px-4">
            <Disc3 size={36} className="text-vs-muted" />
            <p className="text-vs-text-2 text-sm">{search || lotFilter ? "No records match your filters." : "No records yet."}</p>
            {!search && !lotFilter && (
              <button onClick={() => { setEditRecord(undefined); setShowModal(true); }} className="btn-primary text-sm">Add first record</button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10 pr-0">
                  <RowCheckbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="w-[38%]">Record</th>
                <th>Format</th>
                <th>Cond.</th>
                <th>Market</th>
                <th>Your price</th>
                <th>Lot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const priceData = r.discogs_release_id != null ? prices[String(r.discogs_release_id)] : null;
                const priceLoading = r.discogs_release_id != null && priceData === undefined;
                const unverifiedCond = r.discogs_synced && r.condition === "VG+";
                const isSelected = selectedIds.has(r.id);

                return (
                  <tr
                    key={r.id}
                    className={`cursor-pointer transition-colors ${isSelected ? "bg-vs-accent/5" : r.status === "sold" ? "opacity-60" : ""}`}
                    onClick={() => openEdit(r)}
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
                    <td><MarketCell data={priceData} loading={priceLoading} /></td>
                    <td>
                      {r.status === "sold"
                        ? <span className="text-xs text-vs-teal">{r.sold_price != null ? fmt(r.sold_price) : "—"}</span>
                        : <span className="text-sm font-medium text-vs-gold">{r.asking_price != null ? fmt(r.asking_price) : <span className="text-vs-muted text-xs">—</span>}</span>
                      }
                    </td>
                    <td><span className="text-xs text-vs-text-2">{r.lot_id && lotMap[r.lot_id] ? lotMap[r.lot_id] : "—"}</span></td>
                    <td>
                      <div className="flex items-center gap-2 justify-end">
                        <SellButton record={r} onSold={(updated) => handleSaved(updated)} />
                        {r.discogs_release_id && (
                          <a
                            href={`https://www.discogs.com/release/${r.discogs_release_id}`}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-vs-muted hover:text-vs-text hover:bg-vs-raised text-xs border border-transparent hover:border-vs-border transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={11} /><span className="text-2xs">Discogs</span>
                          </a>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }} className="text-vs-muted hover:text-vs-danger p-1 rounded">
                          <Trash2 size={13} />
                        </button>
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
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); fetchRecords(p, statusFilter, lotFilter, search); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Previous</button>
          <span className="text-xs text-vs-text-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); fetchRecords(p, statusFilter, lotFilter, search); }}
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

      {showModal && (
        <RecordModal record={editRecord} lots={lots} onClose={() => setShowModal(false)} onSaved={handleSaved} />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDeleteId(null)} />
          <div className="relative bg-vs-card border border-vs-border rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-medium mb-2">Delete record?</h3>
            <p className="text-sm text-vs-text-2 mb-4">This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="btn-danger">Delete</button>
            </div>
          </div>
        </div>
      )}

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
