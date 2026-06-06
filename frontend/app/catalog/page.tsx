"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Disc3, Search, X, Plus, ExternalLink, ChevronDown,
  Edit2, Trash2, DollarSign, Tag, Check,
} from "lucide-react";
import { api, getToken, type CatalogRecord, type Lot } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONDITIONS = ["M", "NM", "VG+", "VG", "G"] as const;
const FORMATS = ["LP", "EP", "7\"", "12\"", "CD", "Cassette", "Box Set", "Other"];
const COND_COLORS: Record<string, string> = {
  M: "bg-purple-500/15 text-purple-300",
  NM: "bg-vs-success/15 text-vs-success",
  "VG+": "bg-vs-accent/15 text-vs-accent",
  VG: "bg-vs-warning/15 text-vs-warning",
  G: "bg-vs-danger/15 text-vs-danger",
};

function CondBadge({ c }: { c: string }) {
  return (
    <span className={`text-2xs font-medium px-1.5 py-0.5 rounded ${COND_COLORS[c] ?? "bg-vs-raised text-vs-text-2"}`}>
      {c}
    </span>
  );
}

function StatusDot({ status }: { status: "in_stock" | "sold" }) {
  return status === "sold"
    ? <span className="pill-sold"><span className="w-1.5 h-1.5 rounded-full bg-vs-teal" />Sold</span>
    : <span className="pill-in-stock"><span className="w-1.5 h-1.5 rounded-full bg-vs-success" />In stock</span>;
}

function fmt(n: number) { return `$${n.toFixed(2)}`; }

// ── Record modal (create / edit) ─────────────────────────────────────────────

interface RecordModalProps {
  record?: CatalogRecord;
  lots: Lot[];
  onClose: () => void;
  onSaved: (r: CatalogRecord) => void;
}

function RecordModal({ record, lots, onClose, onSaved }: RecordModalProps) {
  const isNew = !record;
  const [form, setForm] = useState({
    artist: record?.artist ?? "",
    title: record?.title ?? "",
    year: record?.year ? String(record.year) : "",
    label: record?.label ?? "",
    catalog_number: record?.catalog_number ?? "",
    format: record?.format ?? "",
    genre: record?.genre ?? "",
    country: record?.country ?? "",
    condition: record?.condition ?? "VG+",
    lot_id: record?.lot_id ?? "",
    cost_price: record?.cost_price != null ? String(record.cost_price) : "",
    asking_price: record?.asking_price != null ? String(record.asking_price) : "",
    tags: record?.tags ?? "",
    notes: record?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.artist && !form.title) { setError("Artist or title required."); return; }
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        artist: form.artist || null,
        title: form.title || null,
        year: form.year ? parseInt(form.year) : null,
        label: form.label || null,
        catalog_number: form.catalog_number || null,
        format: form.format || null,
        genre: form.genre || null,
        country: form.country || null,
        condition: form.condition,
        lot_id: form.lot_id || null,
        cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
        asking_price: form.asking_price ? parseFloat(form.asking_price) : null,
        tags: form.tags || null,
        notes: form.notes || null,
      };
      const saved = isNew
        ? await api.createRecord(body as Parameters<typeof api.createRecord>[0])
        : await api.updateRecord(record!.id, body as Parameters<typeof api.updateRecord>[1]);
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-vs-card border border-vs-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-vs-card border-b border-vs-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-medium">{isNew ? "Add record" : "Edit record"}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Artist</label>
              <input className="input" value={form.artist} onChange={(e) => set("artist", e.target.value)} placeholder="e.g. Pink Floyd" />
            </div>
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Title</label>
              <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. The Wall" />
            </div>
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Year</label>
            <input className="input" type="number" value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="1979" />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Label</label>
            <input className="input" value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Columbia" />
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Format</label>
            <select className="input" value={form.format} onChange={(e) => set("format", e.target.value)}>
              <option value="">— select —</option>
              {FORMATS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Condition</label>
            <div className="flex gap-1">
              {CONDITIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("condition", c)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    form.condition === c
                      ? "bg-vs-accent text-vs-bg border-vs-accent"
                      : "border-vs-border-2 text-vs-text-2 hover:border-vs-accent hover:text-vs-text"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Genre</label>
            <input className="input" value={form.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Rock" />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Country</label>
            <input className="input" value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="US" />
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Catalog number</label>
            <input className="input" value={form.catalog_number} onChange={(e) => set("catalog_number", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Lot</label>
            <select className="input" value={form.lot_id} onChange={(e) => set("lot_id", e.target.value)}>
              <option value="">None</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Cost price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
              <input className="input pl-6" type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => set("cost_price", e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Asking price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
              <input className="input pl-6" type="number" min="0" step="0.01" value={form.asking_price} onChange={(e) => set("asking_price", e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="col-span-2">
            <label className="text-xs text-vs-text-2 mb-1 block">Tags (comma-separated)</label>
            <input className="input" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="jazz, original pressing, promo" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-vs-text-2 mb-1 block">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-xs text-vs-danger">{error}</p>}

        <div className="sticky bottom-0 bg-vs-card border-t border-vs-border px-6 py-4 flex justify-end gap-2 rounded-b-2xl">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : isNew ? "Add record" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sell inline ───────────────────────────────────────────────────────────────

function SellCell({ record, onSold }: { record: CatalogRecord; onSold: (r: CatalogRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(record.asking_price != null ? String(record.asking_price) : "");
  const [saving, setSaving] = useState(false);

  if (record.status === "sold") return <span className="text-xs text-vs-teal font-medium">Sold</span>;
  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs text-vs-muted hover:text-vs-success transition-colors flex items-center gap-1">
      <Tag size={11} />Sell
    </button>
  );
  async function confirm() {
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return;
    setSaving(true);
    try { onSold(await api.sellRecord(record.id, n)); setOpen(false); }
    finally { setSaving(false); }
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-vs-muted">$</span>
      <input autoFocus type="number" min="0" step="0.01" value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") setOpen(false); }}
        className="w-16 bg-vs-raised border border-vs-border-2 rounded px-1.5 py-0.5 text-xs text-vs-text focus:outline-none focus:border-vs-accent" />
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

  const fetchRecords = useCallback(async (pg: number, status: string, lot: string, q: string) => {
    setLoading(true);
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

  const lotMap = Object.fromEntries(lots.map((l) => [l.id, l.name]));
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="px-6 py-6">
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
          <Plus size={14} />
          New record
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted" />
          <input
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search artist or title…"
            className="input pl-8 pr-8"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); setSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted hover:text-vs-text">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex bg-vs-raised border border-vs-border rounded-lg overflow-hidden flex-shrink-0">
          {(["in_stock", "sold", "all"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-sm transition-colors ${statusFilter === s ? "bg-vs-accent text-vs-bg font-medium" : "text-vs-text-2 hover:text-vs-text"}`}
            >
              {s === "in_stock" ? "In stock" : s === "sold" ? "Sold" : "All"}
            </button>
          ))}
        </div>

        {/* Lot filter */}
        {lots.length > 0 && (
          <div className="relative">
            <select value={lotFilter} onChange={(e) => setLotFilter(e.target.value)}
              className="input pr-8 appearance-none flex-shrink-0">
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
          <div className="flex items-center justify-center py-20">
            <Disc3 size={24} className="animate-spin text-vs-muted" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center px-4">
            <Disc3 size={36} className="text-vs-muted" />
            <p className="text-vs-text-2 text-sm">
              {search || lotFilter ? "No records match your filters." : "No records yet."}
            </p>
            {!search && !lotFilter && (
              <button onClick={() => { setEditRecord(undefined); setShowModal(true); }} className="btn-primary text-sm">
                Add first record
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Format</th>
                <th>Condition</th>
                <th>Status</th>
                <th>Cost</th>
                <th>Price</th>
                <th>Lot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className={r.status === "sold" ? "opacity-60" : ""}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-vs-raised border border-vs-border flex items-center justify-center flex-shrink-0">
                        <Disc3 size={13} className="text-vs-muted" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-vs-text truncate max-w-[180px]">
                          {r.artist && r.title ? `${r.artist} — ${r.title}` : r.artist || r.title || <span className="text-vs-muted italic">Unknown</span>}
                        </p>
                        <p className="text-xs text-vs-muted">{[r.year, r.label].filter(Boolean).join(" · ")}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className="text-xs text-vs-text-2">{r.format ?? "—"}</span></td>
                  <td><CondBadge c={r.condition} /></td>
                  <td><StatusDot status={r.status} /></td>
                  <td><span className="text-xs text-vs-text-2">{r.cost_price != null ? fmt(r.cost_price) : "—"}</span></td>
                  <td>
                    {r.status === "sold"
                      ? <span className="text-xs text-vs-teal">{r.sold_price != null ? fmt(r.sold_price) : "—"}</span>
                      : <span className="text-sm font-medium text-vs-gold">{r.asking_price != null ? fmt(r.asking_price) : <span className="text-vs-muted text-xs">—</span>}</span>
                    }
                  </td>
                  <td>
                    <span className="text-xs text-vs-text-2">
                      {r.lot_id && lotMap[r.lot_id] ? lotMap[r.lot_id] : "—"}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      <SellCell record={r} onSold={(updated) => handleSaved(updated)} />
                      {r.discogs_release_id && (
                        <a href={`https://www.discogs.com/release/${r.discogs_release_id}`} target="_blank" rel="noopener noreferrer"
                          className="text-vs-muted hover:text-vs-text" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button onClick={() => { setEditRecord(r); setShowModal(true); }} className="text-vs-muted hover:text-vs-text">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => setDeleteId(r.id)} className="text-vs-muted hover:text-vs-danger">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Record modal */}
      {showModal && (
        <RecordModal record={editRecord} lots={lots} onClose={() => setShowModal(false)} onSaved={handleSaved} />
      )}

      {/* Delete confirm */}
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
    </div>
  );
}
