"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, X, Package, ChevronRight } from "lucide-react";
import { getToken } from "@/lib/api";
import Link from "next/link";

interface PurchaseOrder {
  id: string;
  supplier: string;
  date: string;
  records_count: number;
  total_paid: number;
  notes?: string;
}

const STORAGE_KEY = "vinylscan_purchase_orders";
function load(): PurchaseOrder[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function save(orders: PurchaseOrder[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(orders)); }

let _i = 0;
function newId() { return `po-${Date.now()}-${_i++}`; }

function fmt(n: number) { return `$${n.toFixed(2)}`; }

function POModal({ onClose, onSaved }: { onClose: () => void; onSaved: (po: PurchaseOrder) => void }) {
  const [form, setForm] = useState({ supplier: "", date: new Date().toISOString().slice(0, 10), records_count: "", total_paid: "", notes: "" });
  const [error, setError] = useState("");
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  function saveOrder() {
    if (!form.supplier.trim()) { setError("Supplier required."); return; }
    onSaved({
      id: newId(),
      supplier: form.supplier,
      date: form.date,
      records_count: parseInt(form.records_count) || 0,
      total_paid: parseFloat(form.total_paid) || 0,
      notes: form.notes || undefined,
    });
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-vs-card border border-vs-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-vs-border">
          <h2 className="text-base font-medium">New purchase order</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Supplier</label>
            <input className="input" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Supplier name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Date</label>
              <input className="input" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Records count</label>
              <input className="input" type="number" min="0" value={form.records_count} onChange={(e) => set("records_count", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Total paid</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vs-muted text-xs">$</span>
              <input className="input pl-6" type="number" min="0" step="0.01" value={form.total_paid} onChange={(e) => set("total_paid", e.target.value)} placeholder="0.00" />
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
          <button onClick={saveOrder} className="btn-primary">Save order</button>
        </div>
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    setOrders(load());
  }, [router]);

  function addOrder(po: PurchaseOrder) {
    const next = [po, ...orders];
    setOrders(next);
    save(next);
  }

  const totalPaid = orders.reduce((s, o) => s + o.total_paid, 0);
  const totalRecords = orders.reduce((s, o) => s + o.records_count, 0);

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium">Purchase orders</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/purchases/suppliers" className="btn-secondary text-sm flex items-center gap-2">
            Suppliers
          </Link>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} />
            New order
          </button>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="metric-card">
            <p className="text-xs text-vs-text-2">Orders</p>
            <p className="text-2xl font-medium">{orders.length}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-vs-text-2">Records acquired</p>
            <p className="text-2xl font-medium">{totalRecords}</p>
          </div>
          <div className="metric-card">
            <p className="text-xs text-vs-text-2">Total invested</p>
            <p className="text-2xl font-medium text-vs-gold">{fmt(totalPaid)}</p>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ClipboardList size={36} className="text-vs-muted" />
          <p className="text-vs-text-2 text-sm">No purchase orders yet.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Create first order</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Date</th>
                <th>Records</th>
                <th>Total paid</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Package size={13} className="text-vs-muted flex-shrink-0" />
                      <span className="text-sm font-medium">{o.supplier}</span>
                    </div>
                  </td>
                  <td><span className="text-xs text-vs-text-2">{new Date(o.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></td>
                  <td><span className="text-sm">{o.records_count}</span></td>
                  <td><span className="text-sm font-medium text-vs-gold">{fmt(o.total_paid)}</span></td>
                  <td><span className="text-xs text-vs-muted truncate max-w-[180px] block">{o.notes ?? "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <POModal onClose={() => setShowModal(false)} onSaved={addOrder} />}
    </div>
  );
}
