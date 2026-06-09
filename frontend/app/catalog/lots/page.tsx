"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Layers, Plus, X, Disc3, TrendingUp, DollarSign, Package, ChevronRight,
} from "lucide-react";
import { api, getToken, isStore, isCollector, type Lot, type User } from "@/lib/api";

function fmt(n: number) { return `$${n.toFixed(2)}`; }

function roiPct(lot: Lot): number | null {
  if (!lot.purchase_price || !lot.total_sold) return null;
  return ((lot.total_sold - lot.purchase_price) / lot.purchase_price) * 100;
}

interface LotModalProps {
  onClose: () => void;
  onSaved: (l: Lot) => void;
  pureCollector?: boolean;
}

function LotModal({ onClose, onSaved, pureCollector }: LotModalProps) {
  const [form, setForm] = useState({ name: "", purchase_price: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.name.trim()) { setError("Name required."); return; }
    setSaving(true); setError("");
    try {
      const saved = await api.createLot({
        name: form.name.trim(),
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : undefined,
        notes: form.notes || undefined,
      });
      onSaved(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-vs-card border border-vs-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-vs-border">
          <h2 className="text-base font-medium">{pureCollector ? "Create haul" : "Create lot"}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Lot name</label>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Estate sale — March 2026" />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Total amount paid</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
              <input className="input pl-6" type="number" min="0" step="0.01" value={form.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          {error && <p className="text-xs text-vs-danger">{error}</p>}
        </div>
        <div className="px-6 pb-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : pureCollector ? "Create haul" : "Create lot"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LotCard({ lot, onClick, pureCollector }: { lot: Lot; onClick: () => void; pureCollector?: boolean }) {
  const r = pureCollector ? null : roiPct(lot);
  const pct = lot.record_count > 0 ? Math.round((lot.sold_count / lot.record_count) * 100) : 0;

  return (
    <div onClick={onClick} className="card p-5 cursor-pointer hover:border-vs-border-2 transition-colors group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-vs-text group-hover:text-vs-accent transition-colors truncate">{lot.name}</h3>
          <p className="text-xs text-vs-muted mt-0.5">
            {lot.purchase_price != null ? fmt(lot.purchase_price) : "No price"} ·{" "}
            {new Date(lot.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <ChevronRight size={14} className="text-vs-muted group-hover:text-vs-accent transition-colors flex-shrink-0 mt-0.5" />
      </div>

      <div className={`grid gap-3 mb-4 ${pureCollector ? "grid-cols-2" : "grid-cols-3"}`}>
        <div>
          <p className="text-xs text-vs-muted mb-0.5">{pureCollector ? "In collection" : "In stock"}</p>
          <p className="text-base font-medium">{lot.in_stock_count}</p>
        </div>
        <div>
          <p className="text-xs text-vs-muted mb-0.5">Total records</p>
          <p className="text-base font-medium">{lot.record_count}</p>
        </div>
        {!pureCollector && (
          <div>
            <p className="text-xs text-vs-muted mb-0.5">Revenue</p>
            <p className="text-base font-medium text-vs-gold">{lot.total_sold != null ? fmt(lot.total_sold) : "—"}</p>
          </div>
        )}
      </div>

      {!pureCollector && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-vs-muted">{pct}% sold through</span>
            <span className="text-xs text-vs-text-2">{lot.sold_count}/{lot.record_count}</span>
          </div>
          <div className="h-1 bg-vs-raised rounded-full overflow-hidden">
            <div className="h-full bg-vs-teal rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {r != null && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${r >= 0 ? "text-vs-success" : "text-vs-danger"}`}>
          <TrendingUp size={11} />
          {r >= 0 ? "+" : ""}{r.toFixed(1)}% ROI
          {lot.purchase_price != null && lot.total_sold != null && (
            <span className="text-vs-muted font-normal ml-1">
              ({lot.total_sold >= lot.purchase_price ? "+" : ""}{fmt(lot.total_sold - lot.purchase_price)})
            </span>
          )}
        </div>
      )}

      {lot.notes && (
        <p className="text-xs text-vs-muted mt-2 border-t border-vs-border/50 pt-2 truncate">{lot.notes}</p>
      )}
    </div>
  );
}

export default function LotsPage() {
  const router = useRouter();
  const [lots, setLots] = useState<Lot[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLots(await api.listLots()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.me().then(setUser).catch(() => null);
    load();
  }, [router, load]);

  const pureCollector = isCollector(user) && !isStore(user);
  const pageTitle = pureCollector ? "Hauls" : "Lots";
  const newLabel = pureCollector ? "New haul" : "New lot";
  const emptyLabel = pureCollector
    ? "No hauls yet. Create one to group records by acquisition."
    : "No lots yet. Create one to group records by purchase.";
  const firstCreateLabel = pureCollector ? "Create first haul" : "Create first lot";

  const totalPaid = lots.reduce((s, l) => s + (l.purchase_price ?? 0), 0);
  const totalRevenue = lots.reduce((s, l) => s + (l.total_sold ?? 0), 0);
  const totalInStock = lots.reduce((s, l) => s + l.in_stock_count, 0);
  const overallRoi = totalPaid > 0 ? ((totalRevenue - totalPaid) / totalPaid * 100) : null;

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium">{pageTitle}</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{lots.length} {pureCollector ? `haul${lots.length !== 1 ? "s" : ""}` : `lot${lots.length !== 1 ? "s" : ""}`}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={14} />
          {newLabel}
        </button>
      </div>

      {lots.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {(pureCollector ? [
            { label: `Total ${pureCollector ? "hauls" : "lots"}`, value: String(lots.length), icon: <Layers size={14} /> },
            { label: "Total paid", value: fmt(totalPaid), icon: <DollarSign size={14} /> },
            { label: "In collection", value: `${totalInStock}`, icon: <Package size={14} />, accent: true },
          ] : [
            { label: "Total lots", value: String(lots.length), icon: <Layers size={14} /> },
            { label: "Total invested", value: fmt(totalPaid), icon: <DollarSign size={14} /> },
            { label: "Total revenue", value: fmt(totalRevenue), icon: <TrendingUp size={14} />, accent: true },
            { label: "In stock", value: `${totalInStock}`, icon: <Package size={14} /> },
          ]).map((c) => (
            <div key={c.label} className="metric-card">
              <div className="flex items-start justify-between">
                <p className="text-xs text-vs-text-2">{c.label}</p>
                <span className={`p-1.5 rounded-lg ${c.accent ? "bg-vs-accent/15 text-vs-accent" : "bg-vs-raised text-vs-muted"}`}>{c.icon}</span>
              </div>
              <div>
                <p className="text-2xl font-medium">{c.value}</p>
                {c.label === "Total revenue" && overallRoi != null && (
                  <p className={`text-xs mt-0.5 ${overallRoi >= 0 ? "text-vs-success" : "text-vs-danger"}`}>
                    {overallRoi >= 0 ? "+" : ""}{overallRoi.toFixed(1)}% overall ROI
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Disc3 size={24} className="animate-spin text-vs-muted" />
        </div>
      ) : lots.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Layers size={36} className="text-vs-muted" />
          <p className="text-vs-text-2 text-sm">{emptyLabel}</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">{firstCreateLabel}</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lots.map((l) => (
            <LotCard key={l.id} lot={l} onClick={() => router.push(`/catalog/lots/${l.id}`)} pureCollector={pureCollector} />
          ))}
        </div>
      )}

      {showModal && (
        <LotModal
          onClose={() => setShowModal(false)}
          onSaved={(l) => { setLots((prev) => [l, ...prev]); setShowModal(false); }}
          pureCollector={pureCollector}
        />
      )}
    </div>
  );
}
