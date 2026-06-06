"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, X, Check, DollarSign } from "lucide-react";
import { getToken } from "@/lib/api";

type ConsignStatus = "active" | "sold" | "returned";

interface Consignment {
  id: string;
  consignor: string;
  item: string;
  asking_price: number;
  commission_pct: number;
  status: ConsignStatus;
  sold_price?: number;
  notes?: string;
  created_at: string;
}

const STORAGE_KEY = "vinylscan_consignments";
function load(): Consignment[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function save(c: Consignment[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }
let _i = 0;
function newId() { return `co-${Date.now()}-${_i++}`; }
function fmt(n: number) { return `$${n.toFixed(2)}`; }

const STATUS_STYLES: Record<ConsignStatus, string> = {
  active: "bg-vs-accent/15 text-vs-accent",
  sold: "bg-vs-teal/15 text-vs-teal",
  returned: "bg-vs-muted/15 text-vs-muted",
};

function ConsignModal({ onClose, onSaved }: { onClose: () => void; onSaved: (c: Consignment) => void }) {
  const [form, setForm] = useState({ consignor: "", item: "", asking_price: "", commission_pct: "30", notes: "" });
  const [error, setError] = useState("");
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  function saveItem() {
    if (!form.consignor || !form.item) { setError("Consignor and item required."); return; }
    onSaved({
      id: newId(),
      consignor: form.consignor,
      item: form.item,
      asking_price: parseFloat(form.asking_price) || 0,
      commission_pct: parseFloat(form.commission_pct) || 30,
      status: "active",
      notes: form.notes || undefined,
      created_at: new Date().toISOString(),
    });
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-vs-card border border-vs-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-vs-border">
          <h2 className="text-base font-medium">New consignment</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Consignor name</label>
            <input className="input" value={form.consignor} onChange={(e) => set("consignor", e.target.value)} placeholder="e.g. John D." />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Item description</label>
            <input className="input" value={form.item} onChange={(e) => set("item", e.target.value)} placeholder="Artist — Title (format, condition)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Asking price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
                <input className="input pl-6" type="number" min="0" step="0.01" value={form.asking_price} onChange={(e) => set("asking_price", e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Commission %</label>
              <div className="relative">
                <input className="input pr-6" type="number" min="0" max="100" value={form.commission_pct} onChange={(e) => set("commission_pct", e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-vs-muted text-xs">%</span>
              </div>
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
          <button onClick={saveItem} className="btn-primary">Add consignment</button>
        </div>
      </div>
    </div>
  );
}

export default function ConsignmentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Consignment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [sellId, setSellId] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState("");

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    setItems(load());
  }, [router]);

  function addItem(c: Consignment) {
    const next = [c, ...items];
    setItems(next); save(next);
  }

  function markSold(id: string, price: number) {
    const next = items.map((i) => i.id === id ? { ...i, status: "sold" as ConsignStatus, sold_price: price } : i);
    setItems(next); save(next); setSellId(null);
  }

  function markReturned(id: string) {
    const next = items.map((i) => i.id === id ? { ...i, status: "returned" as ConsignStatus } : i);
    setItems(next); save(next);
  }

  const activeItems = items.filter((i) => i.status === "active");
  const soldItems = items.filter((i) => i.status === "sold");
  const totalPayouts = soldItems.reduce((s, i) => {
    const sp = i.sold_price ?? i.asking_price;
    return s + sp * (1 - i.commission_pct / 100);
  }, 0);

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium">Consignments</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{activeItems.length} active · {soldItems.length} sold</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={14} />
          New consignment
        </button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="metric-card">
            <p className="text-xs text-vs-text-2">Active</p>
            <p className="text-2xl font-medium">{activeItems.length}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-vs-text-2">Sold</p>
            <p className="text-2xl font-medium text-vs-teal">{soldItems.length}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-vs-text-2">Pending payouts</p>
            <p className="text-2xl font-medium text-vs-gold">{fmt(totalPayouts)}</p>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Package size={36} className="text-vs-muted" />
          <p className="text-vs-text-2 text-sm">No consignments yet.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Add first item</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Consignor</th>
                <th>Status</th>
                <th>Asking</th>
                <th>Commission</th>
                <th>Payout</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const soldP = c.sold_price ?? c.asking_price;
                const payout = soldP * (1 - c.commission_pct / 100);
                return (
                  <tr key={c.id}>
                    <td><span className="text-sm font-medium">{c.item}</span></td>
                    <td><span className="text-xs text-vs-text-2">{c.consignor}</span></td>
                    <td>
                      <span className={`text-2xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[c.status]}`}>
                        {c.status}
                      </span>
                    </td>
                    <td><span className="text-sm font-medium text-vs-gold">{fmt(c.asking_price)}</span></td>
                    <td><span className="text-xs text-vs-text-2">{c.commission_pct}%</span></td>
                    <td>
                      <span className={`text-sm font-medium ${c.status === "sold" ? "text-vs-success" : "text-vs-text-2"}`}>
                        {c.status === "sold" ? fmt(payout) : `~${fmt(payout)}`}
                      </span>
                    </td>
                    <td>
                      {c.status === "active" && (
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => { setSellId(c.id); setSellPrice(String(c.asking_price)); }}
                            className="text-xs text-vs-muted hover:text-vs-success transition-colors flex items-center gap-1">
                            <DollarSign size={11} />Sell
                          </button>
                          <button onClick={() => markReturned(c.id)} className="text-xs text-vs-muted hover:text-vs-text">
                            Return
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <ConsignModal onClose={() => setShowModal(false)} onSaved={addItem} />}

      {sellId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSellId(null)} />
          <div className="relative bg-vs-card border border-vs-border rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-medium mb-3">Mark as sold</h3>
            <label className="text-xs text-vs-text-2 mb-1 block">Sold price</label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
              <input autoFocus className="input pl-6" type="number" min="0" step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSellId(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => markSold(sellId, parseFloat(sellPrice) || 0)} className="btn-primary">Confirm sale</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
