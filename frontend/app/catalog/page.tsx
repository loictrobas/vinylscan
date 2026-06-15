"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Disc3, Search, X, Plus, ExternalLink, ChevronDown,
  Trash2, DollarSign, Check, ShoppingCart, Tag, Loader2, Store, Wand2, Download,
} from "lucide-react";
import { toast } from "sonner";
import { api, getToken, isStore, isCollector, type CatalogRecord, type Lot, type User } from "@/lib/api";
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

// ── Remove button (collector) ─────────────────────────────────────────────────

const REMOVE_REASONS = [
  { value: "sold", label: "Sold privately" },
  { value: "traded", label: "Traded" },
  { value: "gift", label: "Gift" },
  { value: "lost", label: "Lost" },
  { value: "broken", label: "Broken" },
  { value: "other", label: "Other" },
] as const;

function RemoveButton({ record, onRemoved }: { record: CatalogRecord; onRemoved: (r: CatalogRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("gift");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (record.status === "sold") {
    return <span className="text-xs text-vs-teal font-medium px-2 py-1">Gone</span>;
  }
  if (!open) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-vs-raised hover:bg-vs-border text-vs-text-2 text-xs font-medium transition-colors border border-vs-border"
      >
        Remove
      </button>
    );
  }
  async function confirm() {
    setSaving(true);
    try {
      onRemoved(await api.catalogRemoveRecord(record.id, { reason, note: note || undefined }));
      setOpen(false);
    } finally { setSaving(false); }
  }
  return (
    <div className="flex flex-col gap-1.5 p-2 bg-vs-card border border-vs-border rounded-lg shadow-lg min-w-[180px]" onClick={(e) => e.stopPropagation()}>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="input text-xs py-0.5">
        {REMOVE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <input
        type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
        className="input text-xs py-0.5"
        onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") setOpen(false); }}
      />
      <div className="flex gap-1.5 justify-end">
        <button onClick={() => setOpen(false)} className="text-xs text-vs-muted hover:text-vs-text px-2 py-0.5 rounded">Cancel</button>
        <button onClick={confirm} disabled={saving} className="text-xs bg-vs-raised border border-vs-border hover:bg-vs-border rounded px-2 py-0.5 disabled:opacity-50">
          {saving ? "…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

// ── Inline price editor ───────────────────────────────────────────────────────

function InlinePrice({ record, onSaved }: { record: CatalogRecord; onSaved: (r: CatalogRecord) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(record.asking_price != null ? String(record.asking_price) : "");
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [editing]);

  async function save() {
    const n = val === "" ? null : parseFloat(val);
    if (val !== "" && (n === null || isNaN(n) || n < 0)) return;
    setSaving(true);
    try {
      const updated = await api.updateRecord(record.id, { asking_price: n ?? undefined });
      onSaved(updated);
      setEditing(false);
    } finally { setSaving(false); }
  }

  function open(e: React.MouseEvent) {
    e.stopPropagation();
    setVal(record.asking_price != null ? String(record.asking_price) : "");
    setEditing(true);
  }

  return (
    <div ref={containerRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      {/* Price label — always rendered, maintains column width */}
      <button
        onClick={open}
        className="rounded px-1 py-0.5 hover:bg-vs-raised transition-colors"
        title="Click to edit price"
      >
        {record.asking_price != null
          ? <span className="text-sm font-medium text-vs-gold">{fmt(record.asking_price)}</span>
          : <span className="text-vs-muted text-xs">—</span>
        }
      </button>

      {/* Floating editor — absolutely positioned, does not affect layout */}
      {editing && (
        <div className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 flex items-center gap-1.5 bg-vs-card border border-vs-accent/40 rounded-lg shadow-xl px-2.5 py-2 whitespace-nowrap">
          <span className="text-xs text-vs-muted">$</span>
          <input
            autoFocus type="number" min="0" step="0.01" value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            className="w-20 bg-vs-raised border border-vs-border-2 rounded px-2 py-1 text-sm text-vs-text focus:outline-none focus:border-vs-accent"
            placeholder="0.00"
          />
          <button onClick={save} disabled={saving} className="p-1 rounded text-vs-success hover:bg-vs-success/10 disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
          <button onClick={() => setEditing(false)} className="p-1 rounded text-vs-muted hover:text-vs-text hover:bg-vs-raised">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PER_PAGE = 40;

function CatalogPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"in_stock" | "sold" | "all">("in_stock");
  const [noDiscogsFilter, setNoDiscogsFilter] = useState(false);
  const [lotFilter, setLotFilter] = useState(searchParams.get("lot_id") ?? "");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState<CatalogRecord | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [bulkListing, setBulkListing] = useState(false);

  const [prices, setPrices] = useState<Record<string, PriceData | null | undefined>>({});
  const pricesFetchedRef = useRef<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number | null>(null);
  const isShiftRef = useRef(false);
  const recordsRef = useRef<CatalogRecord[]>([]);

  const [autoPriceOpen, setAutoPriceOpen] = useState(false);
  const [autoPriceScope, setAutoPriceScope] = useState<"unpriced" | "selected">("unpriced");
  const [autoPriceStrategy, setAutoPriceStrategy] = useState<"suggested" | "lowest_x" | "manual">("suggested");
  const [autoPriceMultiplier, setAutoPriceMultiplier] = useState("1.5");
  const [autoPriceManual, setAutoPriceManual] = useState("");
  const [autoPricing, setAutoPricing] = useState(false);

  const [slowLoad, setSlowLoad] = useState(false);

  const fetchRecords = useCallback(async (pg: number, status: string, lot: string, q: string, noDiscogs = false) => {
    setLoading(true);
    setSlowLoad(false);
    setSelectedIds(new Set());
    const slowTimer = setTimeout(() => setSlowLoad(true), 8000);
    try {
      const res = await api.listCatalog({
        page: pg, per_page: PER_PAGE,
        ...(noDiscogs ? { no_discogs: true } : { status }),
        no_lot: lot === "none",
        lot_id: lot !== "" && lot !== "none" ? lot : undefined,
        search: q || undefined,
      });
      setRecords(res.records);
      setTotal(res.total);
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
      setSlowLoad(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.listLots().then(setLots).catch(() => {});
    api.me().then(setUser).catch(() => {});
  }, [router]);

  // Track shift key globally — more reliable than e.shiftKey on React events
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftRef.current = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => { isShiftRef.current = false; });
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // Keep recordsRef in sync so toggleSelect updater never has stale closure
  useEffect(() => { recordsRef.current = records; }, [records]);

  useEffect(() => {
    setPage(1);
    fetchRecords(1, statusFilter, lotFilter, search, noDiscogsFilter);
  }, [statusFilter, lotFilter, search, noDiscogsFilter, fetchRecords]);

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
    try {
      await api.deleteRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      setDeleteId(null);
      toast.success("Record deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function openEdit(r: CatalogRecord) { setEditRecord(r); setShowModal(true); }

  function toggleSelect(id: string, index: number, eventShift = false) {
    const shift = eventShift || isShiftRef.current;
    const recs = recordsRef.current;
    // Direct read — function is never memoized so selectedIds is always fresh
    const next = new Set(selectedIds);
    if (shift && lastSelectedIndexRef.current !== null) {
      const from = Math.min(lastSelectedIndexRef.current, index);
      const to = Math.max(lastSelectedIndexRef.current, index);
      for (let i = from; i <= to; i++) { if (recs[i]) next.add(recs[i].id); }
    } else {
      next.has(id) ? next.delete(id) : next.add(id);
    }
    setSelectedIds(next);
    lastSelectedIndexRef.current = index;
  }

  function toggleSelectAll() {
    lastSelectedIndexRef.current = null;
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
    if (failed > 0) toast.error(`${failed} record${failed > 1 ? "s" : ""} could not be deleted`);
    else toast.success(`${deleted.size} record${deleted.size > 1 ? "s" : ""} deleted`);
  }

  async function handleBulkAddToLot(lotId: string) {
    if (!lotId) return;
    const results = await Promise.allSettled([...selectedIds].map((id) => api.updateRecord(id, { lot_id: lotId })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.filter((r) => r.status === "rejected").length;
    setSelectedIds(new Set());
    fetchRecords(page, statusFilter, lotFilter, search, noDiscogsFilter);
    if (fail > 0) toast.error(`${fail} record${fail > 1 ? "s" : ""} could not be assigned`);
    else toast.success(`${ok} record${ok > 1 ? "s" : ""} assigned to lot`);
  }

  function handleAddToCart() {
    const selected = records.filter((r) => selectedIds.has(r.id) && r.status === "in_stock");
    if (selected.length === 0) return;
    localStorage.setItem("vinylscan_pos_cart", JSON.stringify(selected));
    router.push("/sales");
  }

  const discogsConnected = !!user?.discogs_username;

  async function handleToggleStoreListed(r: CatalogRecord) {
    const updated = await api.updateRecord(r.id, { store_listed: !r.store_listed });
    handleSaved(updated);
  }

  async function handleBulkStoreListed(list: boolean) {
    const ids = records.filter((r) => selectedIds.has(r.id) && r.store_listed !== list).map((r) => r.id);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => api.updateRecord(id, { store_listed: list })));
    results.forEach((res) => { if (res.status === "fulfilled") handleSaved(res.value); });
    setSelectedIds(new Set());
  }

  async function handleAutoPrice() {
    if (autoPricing) return;
    setAutoPricing(true);
    const targets = records.filter((r) => {
      if (r.asking_price != null) return false; // skip already priced
      if (autoPriceScope === "selected" && !selectedIds.has(r.id)) return false;
      return true;
    });

    const mult = parseFloat(autoPriceMultiplier) || 1;
    const updates: Array<{ id: string; price: number }> = [];
    for (const r of targets) {
      const liveLowest = r.discogs_release_id != null ? (prices[String(r.discogs_release_id)]?.lowest ?? null) : null;
      const lowestPrice = r.discogs_lowest_price ?? liveLowest;
      let price: number | null = null;
      if (autoPriceStrategy === "suggested") {
        price = r.discogs_suggested_price ?? lowestPrice ?? null;
      } else if (autoPriceStrategy === "lowest_x") {
        if (lowestPrice != null) price = parseFloat((lowestPrice * mult).toFixed(2));
      } else if (autoPriceStrategy === "manual") {
        const v = parseFloat(autoPriceManual);
        if (!isNaN(v) && v > 0) price = v;
      }
      if (price != null && price > 0) updates.push({ id: r.id, price });
    }

    const results = await Promise.allSettled(updates.map(({ id, price }) => api.updateRecord(id, { asking_price: price })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    setAutoPricing(false);
    setAutoPriceOpen(false);
    fetchRecords(page, statusFilter, lotFilter, search, noDiscogsFilter);
    toast.success(`Auto-priced ${ok} record${ok > 1 ? "s" : ""}`);
  }

  async function handleBulkList() {
    if (bulkListing) return;
    const eligible = records.filter(
      (r) => selectedIds.has(r.id) && r.discogs_release_id && r.asking_price && r.status === "in_stock" && !r.discogs_listing_id
    );
    if (eligible.length === 0) return;
    setBulkListing(true);
    const results = await Promise.allSettled(eligible.map((r) => api.discogsListRecord(r.id)));
    results.forEach((res, i) => {
      if (res.status === "fulfilled") {
        handleSaved({ ...eligible[i], discogs_listing_id: res.value.listing_id ?? null });
      }
    });
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.filter((r) => r.status === "rejected").length;
    setBulkListing(false);
    setSelectedIds(new Set());
    if (fail > 0) toast.error(`${fail} listing${fail > 1 ? "s" : ""} failed`);
    else toast.success(`${ok} record${ok > 1 ? "s" : ""} listed on Discogs`);
  }

  const lotMap = Object.fromEntries(lots.map((l) => [l.id, l.name]));
  const totalPages = Math.ceil(total / PER_PAGE);
  const allSelected = records.length > 0 && selectedIds.size === records.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const storeMode = isStore(user);
  const collectorMode = isCollector(user);
  const pureCollector = collectorMode && !storeMode;
  const inStockLabel = pureCollector ? "In collection" : "In stock";
  const soldLabel = pureCollector ? "Gone" : "Sold";
  const priceColLabel = pureCollector ? "Value" : "Your price";

  return (
    <div className="px-6 py-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium">Records</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{total} record{total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          {storeMode && records.some((r) => r.asking_price == null) && (
            <button
              onClick={() => { setAutoPriceScope("unpriced"); setAutoPriceOpen(true); }}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Wand2 size={13} />Auto-price
            </button>
          )}
          <button
            onClick={async () => {
              const { getToken } = await import("@/lib/api");
              const token = getToken();
              const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
              const res = await fetch(`${apiUrl}/catalog/export/csv`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `vinylscan-catalog-${new Date().toISOString().slice(0,10)}.csv`;
              a.click(); URL.revokeObjectURL(url);
            }}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Export catalog to CSV"
          >
            <Download size={13} />Export
          </button>
          <button
            onClick={() => { setEditRecord(undefined); setShowModal(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={14} />New record
          </button>
        </div>
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
            <button key={s} onClick={() => { setNoDiscogsFilter(false); setStatusFilter(s); }}
              className={`px-3 py-1.5 text-sm transition-colors ${!noDiscogsFilter && statusFilter === s ? "bg-vs-accent text-vs-bg font-medium" : "text-vs-text-2 hover:text-vs-text"}`}>
              {s === "in_stock" ? inStockLabel : s === "sold" ? soldLabel : "All"}
            </button>
          ))}
          <button onClick={() => setNoDiscogsFilter((v) => !v)}
            className={`px-3 py-1.5 text-sm transition-colors border-l border-vs-border ${noDiscogsFilter ? "bg-vs-warning/20 text-vs-warning font-medium" : "text-vs-text-2 hover:text-vs-text"}`}>
            Unlinked
          </button>
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
          <>
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10 pr-0"><div className="w-4 h-4 rounded bg-vs-border animate-pulse" /></th>
                <th className="w-[38%]">Record</th>
                <th>Format</th>
                <th>Cond.</th>
                <th>Market</th>
                <th>{priceColLabel}</th>
                <th>Lot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td className="pr-0"><div className="w-4 h-4 rounded bg-vs-border animate-pulse" /></td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-vs-border animate-pulse flex-shrink-0" />
                      <div className="flex flex-col gap-1.5">
                        <div className="h-2.5 w-20 bg-vs-border/60 animate-pulse rounded" />
                        <div className="h-3 w-36 bg-vs-border animate-pulse rounded" />
                        <div className="h-2 w-24 bg-vs-border/40 animate-pulse rounded" />
                      </div>
                    </div>
                  </td>
                  <td><div className="h-3 w-10 bg-vs-border/60 animate-pulse rounded" /></td>
                  <td><div className="h-5 w-10 bg-vs-border/60 animate-pulse rounded-full" /></td>
                  <td><div className="h-3 w-14 bg-vs-border/60 animate-pulse rounded" /></td>
                  <td><div className="h-4 w-12 bg-vs-border animate-pulse rounded" /></td>
                  <td><div className="h-3 w-10 bg-vs-border/60 animate-pulse rounded" /></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
          {slowLoad && (
            <p className="text-xs text-vs-muted text-center py-3 animate-pulse">
              Server is waking up — this takes up to 60s on first load…
            </p>
          )}
          </>
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
                <th>{priceColLabel}</th>
                <th>Lot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, rowIndex) => {
                const priceData = r.discogs_release_id != null ? prices[String(r.discogs_release_id)] : null;
                const priceLoading = r.discogs_release_id != null && priceData === undefined;
                const unverifiedCond = r.discogs_synced && r.condition === "VG+";
                const isSelected = selectedIds.has(r.id);

                return (
                  <tr
                    key={r.id}
                    className={`transition-colors select-none ${isSelected ? "bg-vs-accent/15 dark:bg-vs-accent/10" : r.status === "sold" ? "opacity-60" : ""}`}
                  >
                    <td className="pr-0">
                      <RowCheckbox
                        checked={isSelected}
                        onChange={() => {}}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(r.id, rowIndex, e.shiftKey); }}
                      />
                    </td>
                    <td className="cursor-pointer" onClick={(e) => toggleSelect(r.id, rowIndex, e.shiftKey)}>
                      <div className="flex items-center gap-3">
                        <CoverThumb url={r.cover_image_url} />
                        <div
                          className="min-w-0 cursor-pointer group"
                          onClick={(e) => { e.stopPropagation(); if (e.shiftKey || isShiftRef.current) { toggleSelect(r.id, rowIndex, true); } else { openEdit(r); } }}
                        >
                          <p className="text-xs font-medium text-vs-muted leading-tight group-hover:text-vs-text-2 transition-colors">{r.artist || <span className="italic">Unknown artist</span>}</p>
                          <p className="text-sm font-medium text-vs-text leading-snug group-hover:text-vs-accent transition-colors">{r.title || <span className="italic text-vs-muted">Untitled</span>}</p>
                          <p className="text-2xs text-vs-muted mt-0.5">{[r.year, r.label].filter(Boolean).join(" · ")}</p>
                        </div>
                      </div>
                    </td>
                    <td className="cursor-pointer" onClick={(e) => toggleSelect(r.id, rowIndex, e.shiftKey)}><span className="text-xs text-vs-text-2">{r.format ?? "—"}</span></td>
                    <td className="cursor-pointer" onClick={(e) => toggleSelect(r.id, rowIndex, e.shiftKey)}><CondBadge c={r.condition} unverified={unverifiedCond} /></td>
                    <td className="cursor-pointer" onClick={(e) => toggleSelect(r.id, rowIndex, e.shiftKey)}><MarketCell data={priceData} loading={priceLoading} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {r.status === "sold"
                        ? <span className="text-xs text-vs-teal">{r.sold_price != null ? fmt(r.sold_price) : "—"}</span>
                        : <InlinePrice record={r} onSaved={handleSaved} />
                      }
                    </td>
                    <td className="cursor-pointer" onClick={(e) => toggleSelect(r.id, rowIndex, e.shiftKey)}><span className="text-xs text-vs-text-2">{r.lot_id && lotMap[r.lot_id] ? lotMap[r.lot_id] : "—"}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2 justify-end">
                        {storeMode && <SellButton record={r} onSold={(updated) => handleSaved(updated)} />}
                        {pureCollector && <RemoveButton record={r} onRemoved={(updated) => handleSaved(updated)} />}
                        {storeMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleStoreListed(r); }}
                            title={r.store_listed ? "Remove from store" : "Show in store"}
                            className={`p-1 rounded transition-colors ${r.store_listed ? "text-vs-accent hover:text-vs-accent/70" : "text-vs-muted hover:text-vs-text"}`}
                          >
                            <Store size={13} />
                          </button>
                        )}
                        {storeMode && discogsConnected && r.discogs_listing_id && (
                          <span className="text-2xs px-1.5 py-0.5 rounded-full bg-vs-accent/15 text-vs-accent border border-vs-accent/20 font-medium whitespace-nowrap">
                            Listed
                          </span>
                        )}
                        {storeMode && discogsConnected && !r.discogs_listing_id && r.discogs_release_id && r.asking_price && r.status === "in_stock" && (
                          <span title="Eligible to list on Discogs"><Tag size={12} className="text-vs-muted/40 flex-shrink-0" /></span>
                        )}
                        <div className="w-[60px] flex justify-center">
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
                        </div>
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
          <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); fetchRecords(p, statusFilter, lotFilter, search, noDiscogsFilter); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Previous</button>
          <span className="text-xs text-vs-text-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); fetchRecords(p, statusFilter, lotFilter, search, noDiscogsFilter); }}
            className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40">Next</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-vs-card border border-vs-border rounded-xl px-3 py-2.5 shadow-2xl shadow-black/30">
          {/* Count + clear */}
          <span className="text-xs font-semibold text-vs-text tabular-nums px-1 whitespace-nowrap">{selectedIds.size} selected</span>
          <button onClick={() => setSelectedIds(new Set())} className="p-1 text-vs-muted hover:text-vs-text rounded" title="Clear selection"><X size={13} /></button>
          <div className="w-px h-5 bg-vs-border mx-0.5" />

          {/* Delete */}
          <button
            onClick={() => setBulkDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-vs-danger hover:bg-vs-danger/10 text-xs font-medium transition-colors whitespace-nowrap"
            title="Delete selected"
          >
            <Trash2 size={12} />Delete
          </button>

          {/* Lot */}
          {lots.length > 0 && (
            <div className="relative">
              <select
                defaultValue=""
                onChange={(e) => { if (e.target.value) { handleBulkAddToLot(e.target.value); (e.target as HTMLSelectElement).value = ""; } }}
                className="pl-2.5 pr-6 py-1.5 bg-vs-raised border border-vs-border rounded-lg text-xs text-vs-text-2 focus:outline-none focus:border-vs-accent appearance-none cursor-pointer whitespace-nowrap"
              >
                <option value="" disabled>Add to lot…</option>
                {lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-vs-muted pointer-events-none" />
            </div>
          )}

          <div className="w-px h-5 bg-vs-border mx-0.5" />

          {/* Store — store only */}
          {storeMode && <>
          <button
            onClick={() => handleBulkStoreListed(true)}
            disabled={!records.some((r) => selectedIds.has(r.id) && !r.store_listed)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-vs-text-2 hover:text-vs-accent hover:bg-vs-accent/10 transition-colors disabled:opacity-35 whitespace-nowrap"
            title="Add to store"
          >
            <Store size={12} />In store
          </button>
          <button
            onClick={() => handleBulkStoreListed(false)}
            disabled={!records.some((r) => selectedIds.has(r.id) && r.store_listed)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-vs-text-2 hover:text-vs-text hover:bg-vs-raised transition-colors disabled:opacity-35 whitespace-nowrap"
            title="Remove from store"
          >
            <Store size={12} />Hide
          </button>
          </>}

          {/* Discogs list — store only */}
          {storeMode && discogsConnected && (
            <button
              onClick={handleBulkList}
              disabled={bulkListing || !records.some((r) => selectedIds.has(r.id) && r.discogs_release_id && r.asking_price && r.status === "in_stock" && !r.discogs_listing_id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-vs-text-2 hover:text-vs-accent hover:bg-vs-accent/10 transition-colors disabled:opacity-35 whitespace-nowrap"
              title="List on Discogs marketplace"
            >
              {bulkListing ? <Loader2 size={12} className="animate-spin" /> : <Tag size={12} />}
              List
            </button>
          )}

          {/* Auto-price — store only */}
          {storeMode && <button
            onClick={() => { setAutoPriceScope("selected"); setAutoPriceOpen(true); }}
            disabled={!records.some((r) => selectedIds.has(r.id) && r.asking_price == null)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-vs-text-2 hover:text-vs-accent hover:bg-vs-accent/10 transition-colors disabled:opacity-35 whitespace-nowrap"
            title="Auto-price selected"
          >
            <Wand2 size={12} />Price
          </button>}

          <div className="w-px h-5 bg-vs-border mx-0.5" />

          {/* Add to cart — store only */}
          {storeMode && <button
            onClick={handleAddToCart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-vs-accent text-white text-xs font-semibold hover:bg-vs-accent-bright transition-colors whitespace-nowrap"
          >
            <ShoppingCart size={12} />Add to cart
          </button>}
        </div>
      )}

      {showModal && (
        <RecordModal record={editRecord} lots={lots} onClose={() => setShowModal(false)} onSaved={handleSaved} discogsConnected={discogsConnected} user={user} />
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

      {autoPriceOpen && (() => {
        const targets = records.filter((r) => {
          if (r.asking_price != null) return false;
          if (autoPriceScope === "selected" && !selectedIds.has(r.id)) return false;
          return true;
        });
        const mult = parseFloat(autoPriceMultiplier) || 1;
        const manualVal = parseFloat(autoPriceManual);
        function calcPrice(r: CatalogRecord): number | null {
          const liveLowest = r.discogs_release_id != null ? (prices[String(r.discogs_release_id)]?.lowest ?? null) : null;
          const lowestPrice = r.discogs_lowest_price ?? liveLowest;
          if (autoPriceStrategy === "suggested") return r.discogs_suggested_price ?? lowestPrice ?? null;
          if (autoPriceStrategy === "lowest_x") return lowestPrice != null ? parseFloat((lowestPrice * mult).toFixed(2)) : null;
          if (autoPriceStrategy === "manual") return !isNaN(manualVal) && manualVal > 0 ? manualVal : null;
          return null;
        }
        const eligible = targets.filter((r) => calcPrice(r) != null);
        const preview = eligible.slice(0, 3);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" onClick={() => setAutoPriceOpen(false)} />
            <div className="relative bg-vs-card border border-vs-border rounded-xl p-6 max-w-md w-full shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <Wand2 size={16} className="text-vs-accent" />
                  <h3 className="text-base font-medium">Auto-price records</h3>
                </div>
                <button onClick={() => setAutoPriceOpen(false)} className="text-vs-muted hover:text-vs-text"><X size={15} /></button>
              </div>

              {/* Scope */}
              <div className="mb-4">
                <p className="text-xs text-vs-muted uppercase tracking-wider mb-2">Scope</p>
                <div className="flex gap-2">
                  {(["unpriced", "selected"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setAutoPriceScope(s)}
                      disabled={s === "selected" && selectedIds.size === 0}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-40 ${autoPriceScope === s ? "bg-vs-accent/15 border-vs-accent/40 text-vs-accent font-medium" : "border-vs-border text-vs-text-2 hover:border-vs-border-2"}`}
                    >
                      {s === "unpriced" ? `All unpriced (${records.filter((r) => r.asking_price == null).length})` : `Selected (${selectedIds.size})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Strategy */}
              <div className="mb-4">
                <p className="text-xs text-vs-muted uppercase tracking-wider mb-2">Pricing strategy</p>
                <div className="flex flex-col gap-2">
                  {([
                    { key: "suggested", label: "Discogs suggested price", desc: "Uses Discogs suggested price for the record's condition" },
                    { key: "lowest_x", label: "Lowest × multiplier", desc: "Lowest marketplace price times a multiplier" },
                    { key: "manual", label: "Fixed price", desc: "Same price applied to all records" },
                  ] as const).map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => setAutoPriceStrategy(key)}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${autoPriceStrategy === key ? "bg-vs-accent/10 border-vs-accent/40" : "border-vs-border hover:border-vs-border-2"}`}
                    >
                      <span className={`mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${autoPriceStrategy === key ? "border-vs-accent" : "border-vs-muted"}`}>
                        {autoPriceStrategy === key && <span className="w-1.5 h-1.5 rounded-full bg-vs-accent" />}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-vs-text">{label}</p>
                        <p className="text-xs text-vs-muted mt-0.5">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Multiplier / manual input */}
              {autoPriceStrategy === "lowest_x" && (
                <div className="mb-4 flex items-center gap-2">
                  <label className="text-sm text-vs-text-2 whitespace-nowrap">Multiplier:</label>
                  <input
                    type="number" min="0.1" step="0.1" value={autoPriceMultiplier}
                    onChange={(e) => setAutoPriceMultiplier(e.target.value)}
                    className="input w-24"
                  />
                  <span className="text-xs text-vs-muted">e.g. 1.5 = 150% of lowest</span>
                </div>
              )}
              {autoPriceStrategy === "manual" && (
                <div className="mb-4 flex items-center gap-2">
                  <label className="text-sm text-vs-text-2 whitespace-nowrap">Price ($):</label>
                  <input
                    type="number" min="0" step="0.01" value={autoPriceManual}
                    onChange={(e) => setAutoPriceManual(e.target.value)}
                    placeholder="0.00"
                    className="input w-28"
                  />
                </div>
              )}

              {/* Preview */}
              <div className="mb-5">
                <p className="text-xs text-vs-muted uppercase tracking-wider mb-2">
                  Preview —{" "}
                  {eligible.length > 0
                    ? `${eligible.length} record${eligible.length !== 1 ? "s" : ""} will be priced`
                    : targets.length === 0
                      ? "no unpriced records in this scope"
                      : autoPriceStrategy !== "manual"
                        ? "no records have market data — switch to Fixed price"
                        : "enter a price above"}
                </p>
                {eligible.length > 0 ? (
                  <div className="rounded-lg border border-vs-border overflow-hidden">
                    {preview.map((r, i) => (
                      <div key={r.id} className={`flex items-center justify-between px-3 py-2 ${i < preview.length - 1 ? "border-b border-vs-border/50" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-vs-text truncate">{r.title || "Untitled"}</p>
                          <p className="text-2xs text-vs-muted truncate">{r.artist}</p>
                        </div>
                        <span className="text-sm font-medium text-vs-gold ml-3">${calcPrice(r)!.toFixed(2)}</span>
                      </div>
                    ))}
                    {eligible.length > 3 && (
                      <div className="px-3 py-2 border-t border-vs-border/50 text-xs text-vs-muted">
                        + {eligible.length - 3} more
                      </div>
                    )}
                  </div>
                ) : targets.length > 0 && autoPriceStrategy !== "manual" ? (
                  <button
                    onClick={() => setAutoPriceStrategy("manual")}
                    className="w-full py-3 rounded-lg border border-dashed border-vs-border text-sm text-vs-muted hover:text-vs-accent hover:border-vs-accent/40 transition-colors"
                  >
                    Switch to Fixed price →
                  </button>
                ) : null}
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={() => setAutoPriceOpen(false)} className="btn-secondary">Cancel</button>
                <button
                  onClick={handleAutoPrice}
                  disabled={autoPricing || eligible.length === 0}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {autoPricing ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                  Apply to {eligible.length} record{eligible.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin text-vs-muted">⟳</div></div>}>
      <CatalogPageInner />
    </Suspense>
  );
}
