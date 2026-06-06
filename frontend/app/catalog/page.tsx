"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Disc3, ExternalLink, Search, X, Library, Check, DollarSign, Tag } from "lucide-react";
import { api, getToken, type CatalogRecord, type Lot } from "@/lib/api";

const CONDITION_COLORS: Record<string, string> = {
  M:     "bg-purple-500/20 text-purple-300 border-purple-500/30",
  NM:    "bg-green-500/20 text-green-300 border-green-500/30",
  "VG+": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  VG:    "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  G:     "bg-red-500/20 text-red-300 border-red-500/30",
};

function ConditionBadge({ condition }: { condition: string }) {
  const cls = CONDITION_COLORS[condition] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {condition}
    </span>
  );
}

function PriceCell({
  record,
  onUpdated,
}: {
  record: CatalogRecord;
  onUpdated: (r: CatalogRecord) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(record.asking_price != null ? String(record.asking_price) : "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) { setEditing(false); return; }
    setSaving(true);
    try {
      const updated = await api.updateRecord(record.id, { asking_price: num });
      onUpdated(updated);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (record.status === "sold") {
    return (
      <span className="text-sm text-vinyl-muted line-through">
        {record.sold_price != null ? `$${record.sold_price.toFixed(2)}` : "—"}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-vinyl-muted">$</span>
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.01"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-20 bg-vinyl-border rounded px-1.5 py-0.5 text-sm text-vinyl-text focus:outline-none focus:ring-1 focus:ring-vinyl-accent"
        />
        <button onClick={save} disabled={saving} className="text-green-400 hover:text-green-300">
          <Check size={13} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1 text-sm font-semibold hover:text-vinyl-accent transition-colors group"
    >
      {record.asking_price != null ? (
        <span className="text-vinyl-gold group-hover:text-vinyl-accent">${record.asking_price.toFixed(2)}</span>
      ) : (
        <span className="text-vinyl-muted">— <span className="text-xs">set price</span></span>
      )}
    </button>
  );
}

function SellButton({ record, onSold }: { record: CatalogRecord; onSold: (r: CatalogRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(record.asking_price != null ? String(record.asking_price) : "");
  const [saving, setSaving] = useState(false);

  if (record.status === "sold") {
    return <span className="text-xs text-green-400 font-medium">Sold</span>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-vinyl-muted hover:text-green-400 transition-colors flex items-center gap-1"
      >
        <Tag size={11} /> Sell
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-vinyl-muted">$</span>
      <input
        autoFocus
        type="number"
        min="0"
        step="0.01"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") handleSell();
        }}
        className="w-20 bg-vinyl-border rounded px-1.5 py-0.5 text-sm text-vinyl-text focus:outline-none focus:ring-1 focus:ring-green-500"
      />
      <button
        onClick={handleSell}
        disabled={saving}
        className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-0.5 rounded font-medium disabled:opacity-50"
      >
        {saving ? "…" : "Confirm"}
      </button>
      <button onClick={() => setOpen(false)} className="text-vinyl-muted hover:text-vinyl-text">
        <X size={12} />
      </button>
    </div>
  );

  async function handleSell() {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    setSaving(true);
    try {
      const updated = await api.sellRecord(record.id, num);
      onSold(updated);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }
}

function RecordRow({
  record,
  lotName,
  onUpdated,
}: {
  record: CatalogRecord;
  lotName?: string;
  onUpdated: (r: CatalogRecord) => void;
}) {
  return (
    <div className={`card p-4 flex items-center gap-4 ${record.status === "sold" ? "opacity-60" : ""}`}>
      <div className="w-10 h-10 rounded-lg bg-vinyl-border flex items-center justify-center flex-shrink-0">
        <Disc3 size={18} className="text-vinyl-muted" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">
          {record.artist && record.title
            ? `${record.artist} — ${record.title}`
            : record.artist || record.title || <span className="text-vinyl-muted italic">Unknown</span>}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {record.year && <span className="text-xs text-vinyl-muted">{record.year}</span>}
          {record.format && <span className="text-xs text-vinyl-muted">{record.format}</span>}
          {record.label && <span className="text-xs text-vinyl-muted">{record.label}</span>}
          {lotName && (
            <span className="text-xs text-vinyl-muted bg-vinyl-border px-1.5 py-0.5 rounded">{lotName}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <ConditionBadge condition={record.condition} />
        <PriceCell record={record} onUpdated={onUpdated} />
        <SellButton record={record} onSold={onUpdated} />
        {record.discogs_release_id && (
          <a
            href={`https://www.discogs.com/release/${record.discogs_release_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-vinyl-muted hover:text-vinyl-text transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

const PER_PAGE = 40;

export default function CatalogPage() {
  const router = useRouter();
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"in_stock" | "sold" | "all">("in_stock");
  const [lotFilter, setLotFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecords = useCallback(async (pg: number, status: string, lot: string, q: string) => {
    setLoading(true);
    try {
      const res = await api.listCatalog({
        page: pg,
        per_page: PER_PAGE,
        status,
        no_lot: lot === "none",
        lot_id: lot !== "" && lot !== "none" ? lot : undefined,
        search: q || undefined,
      });
      setRecords(res.records);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.listLots().then(setLots).catch(() => {});
    fetchRecords(1, statusFilter, lotFilter, search);
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
    fetchRecords(1, statusFilter, lotFilter, search);
  }, [statusFilter, lotFilter, search, fetchRecords]);

  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(val), 300);
  }

  function handleRecordUpdated(updated: CatalogRecord) {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  const lotMap = Object.fromEntries(lots.map((l) => [l.id, l.name]));
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Library size={28} className="text-vinyl-accent" />
            Catalog
          </h1>
          <p className="text-vinyl-muted text-sm mt-1">{total} record{total !== 1 ? "s" : ""}</p>
        </div>
        <a href="/catalog/lots" className="flex items-center gap-1.5 text-sm text-vinyl-muted hover:text-vinyl-text transition-colors">
          <DollarSign size={14} />
          Lots & Sales
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-vinyl-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search artist or title..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-vinyl-card border border-vinyl-border rounded-xl pl-9 pr-8 py-2.5 text-sm text-vinyl-text placeholder-vinyl-muted focus:outline-none focus:border-vinyl-accent"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); setSearch(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-vinyl-muted hover:text-vinyl-text"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex bg-vinyl-card border border-vinyl-border rounded-xl overflow-hidden flex-shrink-0">
          {(["in_stock", "sold", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                statusFilter === s ? "bg-vinyl-accent text-white" : "text-vinyl-muted hover:text-vinyl-text"
              }`}
            >
              {s === "in_stock" ? "In Stock" : s === "sold" ? "Sold" : "All"}
            </button>
          ))}
        </div>

        {lots.length > 0 && (
          <select
            value={lotFilter}
            onChange={(e) => setLotFilter(e.target.value)}
            className="bg-vinyl-card border border-vinyl-border rounded-xl px-3 py-2 text-sm text-vinyl-text focus:outline-none focus:border-vinyl-accent flex-shrink-0"
          >
            <option value="">All lots</option>
            <option value="none">No lot</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.in_stock_count})</option>
            ))}
          </select>
        )}
      </div>

      {/* Records list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Disc3 size={32} className="animate-spin text-vinyl-muted" />
        </div>
      ) : records.length === 0 ? (
        <div className="card p-12 text-center">
          <Disc3 size={48} className="text-vinyl-muted mx-auto mb-4" />
          <p className="text-vinyl-muted">
            {search || lotFilter ? "No records match your filters." : "No records in catalog yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((r) => (
            <RecordRow
              key={r.id}
              record={r}
              lotName={r.lot_id ? lotMap[r.lot_id] : undefined}
              onUpdated={handleRecordUpdated}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => { const p = page - 1; setPage(p); fetchRecords(p, statusFilter, lotFilter, search); }}
            className="btn-secondary py-1.5 px-4 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-vinyl-muted">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => { const p = page + 1; setPage(p); fetchRecords(p, statusFilter, lotFilter, search); }}
            className="btn-secondary py-1.5 px-4 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
