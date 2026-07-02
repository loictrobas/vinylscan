"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CheckCircle, AlertCircle, Clock, X, Loader2 } from "lucide-react";
import { api, type Consignor, type ConsignedRecord } from "@/lib/api";

const TABS = ["On floor", "Sold", "All"] as const;
type Tab = (typeof TABS)[number];

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function fmt(n: number | null | undefined, prefix = "$"): string {
  if (n == null) return "—";
  return `${prefix}${n.toFixed(2)}`;
}

// ── Consignor form modal ──────────────────────────────────────────────────────

interface ConsignorFormProps {
  initial?: Consignor;
  onSave: (c: Consignor) => void;
  onClose: () => void;
}

function ConsignorForm({ initial, onSave, onClose }: ConsignorFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [commission, setCommission] = useState(String(initial?.default_commission_pct ?? 30));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      let c: Consignor;
      if (initial) {
        c = await api.updateConsignor(initial.id, {
          name: name.trim(),
          contact: contact.trim() || null,
          default_commission_pct: parseFloat(commission) || 30,
          notes: notes.trim() || null,
        });
      } else {
        c = await api.createConsignor({
          name: name.trim(),
          contact: contact.trim() || null,
          default_commission_pct: parseFloat(commission) || 30,
          notes: notes.trim() || null,
        });
      }
      onSave(c);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-vs-card border border-vs-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-vs-border">
          <h2 className="font-semibold text-vs-text">{initial ? "Edit consignor" : "New consignor"}</h2>
          <button onClick={onClose} className="text-vs-muted hover:text-vs-text transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Name *</label>
            <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Contact (email / phone)</label>
            <input className="input w-full" value={contact} onChange={e => setContact(e.target.value)} placeholder="jane@example.com" />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Default commission %</label>
            <input className="input w-full" type="number" min="0" max="100" step="0.5" value={commission} onChange={e => setCommission(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Notes</label>
            <textarea className="input w-full resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConsignmentsPage() {
  const [consignors, setConsignors] = useState<Consignor[]>([]);
  const [records, setRecords] = useState<ConsignedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("On floor");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editConsignor, setEditConsignor] = useState<Consignor | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [cs, rs] = await Promise.all([api.listConsignors(), api.listConsignedRecords()]);
      setConsignors(cs);
      setRecords(rs);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const selectedConsignor = consignors.find(c => c.id === selectedId) ?? null;

  const filteredRecords = records.filter(r => {
    if (selectedId && r.consignor_id !== selectedId) return false;
    if (tab === "On floor") return r.status === "in_stock";
    if (tab === "Sold") return r.status === "sold";
    return true;
  });

  const owedTotal = filteredRecords
    .filter(r => r.status === "sold" && r.consignor_payout_status !== "paid")
    .reduce((s, r) => s + (r.consignor_amount_owed ?? 0), 0);

  async function deleteConsignor(id: number) {
    if (!confirm("Delete this consignor? Their records will stay in your catalog but lose the consignor link.")) return;
    setDeletingId(id);
    try {
      await api.deleteConsignor(id);
      setConsignors(cs => cs.filter(c => c.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast.success("Consignor deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeletingId(null); }
  }

  async function markPaid(recordId: string) {
    setMarkingPaid(recordId);
    try {
      await api.markConsignorPaid(recordId);
      await load();
      toast.success("Marked as paid");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setMarkingPaid(null); }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Consignor list sidebar */}
      <aside className="w-64 border-r border-vs-border bg-vs-sidebar flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-vs-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-vs-text">Consignors</h2>
          <button
            onClick={() => { setEditConsignor(undefined); setFormOpen(true); }}
            className="p-1.5 rounded-lg hover:bg-vs-raised text-vs-muted hover:text-vs-accent transition-colors"
            title="Add consignor"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="p-2 space-y-0.5">
          <button
            onClick={() => setSelectedId(null)}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${!selectedId ? "bg-vs-accent/15 text-vs-accent font-medium" : "text-vs-text-2 hover:bg-vs-raised"}`}
          >
            All consignors
            <span className="ml-1 text-vs-muted">({consignors.length})</span>
          </button>
          {consignors.map(c => (
            <div key={c.id} className="group relative">
              <button
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selectedId === c.id ? "bg-vs-accent/15 text-vs-accent font-medium" : "text-vs-text-2 hover:bg-vs-raised"}`}
              >
                <p className="truncate">{c.name}</p>
                <p className="text-vs-muted mt-0.5">{c.on_floor_count} on floor · {c.sold_count} sold</p>
                {c.total_owed - c.total_paid > 0.01 && (
                  <p className="text-vs-warning text-2xs mt-0.5">owes ${(c.total_owed - c.total_paid).toFixed(2)}</p>
                )}
              </button>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                <button
                  onClick={() => { setEditConsignor(c); setFormOpen(true); }}
                  className="p-1 rounded text-vs-muted hover:text-vs-accent"
                  title="Edit"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => deleteConsignor(c.id)}
                  disabled={deletingId === c.id}
                  className="p-1 rounded text-vs-muted hover:text-vs-danger"
                  title="Delete"
                >
                  {deletingId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-vs-bg">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-vs-text">
              {selectedConsignor ? selectedConsignor.name : "All consignments"}
            </h1>
            {selectedConsignor && selectedConsignor.contact && (
              <p className="text-xs text-vs-muted mt-0.5">{selectedConsignor.contact}</p>
            )}
          </div>

          {/* Stats row */}
          {!loading && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                {
                  label: "On floor",
                  value: records.filter(r => r.status === "in_stock" && (!selectedId || r.consignor_id === selectedId)).length,
                  sub: null,
                },
                {
                  label: "Sold",
                  value: records.filter(r => r.status === "sold" && (!selectedId || r.consignor_id === selectedId)).length,
                  sub: null,
                },
                {
                  label: "Total owed",
                  value: fmt(selectedConsignor ? selectedConsignor.total_owed : consignors.reduce((s, c) => s + c.total_owed, 0)),
                  sub: null,
                },
                {
                  label: "Outstanding",
                  value: fmt(selectedConsignor
                    ? selectedConsignor.total_owed - selectedConsignor.total_paid
                    : consignors.reduce((s, c) => s + (c.total_owed - c.total_paid), 0)),
                  sub: owedTotal > 0 ? "unpaid" : "all clear",
                },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-vs-card border border-vs-border rounded-xl p-4">
                  <p className="text-2xs text-vs-muted uppercase tracking-wide">{label}</p>
                  <p className="text-lg font-bold text-vs-text mt-1">{value}</p>
                  {sub && <p className="text-2xs text-vs-muted mt-0.5">{sub}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-vs-border">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  tab === t
                    ? "border-vs-accent text-vs-accent"
                    : "border-transparent text-vs-muted hover:text-vs-text"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Records table */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-vs-muted" />
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-vs-muted text-sm">No records in this view.</p>
            </div>
          ) : (
            <div className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-vs-border bg-vs-raised">
                    <th className="text-left px-4 py-2.5 text-vs-muted font-medium">Record</th>
                    {!selectedId && <th className="text-left px-4 py-2.5 text-vs-muted font-medium">Consignor</th>}
                    <th className="text-left px-4 py-2.5 text-vs-muted font-medium">Consigned</th>
                    <th className="text-right px-4 py-2.5 text-vs-muted font-medium">Agreed</th>
                    <th className="text-right px-4 py-2.5 text-vs-muted font-medium">Commission</th>
                    <th className="text-right px-4 py-2.5 text-vs-muted font-medium">Owed</th>
                    <th className="text-right px-4 py-2.5 text-vs-muted font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map(r => {
                    const days = r.consigned_at ? daysSince(r.consigned_at) : null;
                    const aging = days != null && days > 60 && r.status === "in_stock";
                    const consignorName = consignors.find(c => c.id === r.consignor_id)?.name ?? "—";
                    return (
                      <tr key={r.id} className={`border-b border-vs-border last:border-0 hover:bg-vs-raised/50 transition-colors ${aging ? "bg-amber-500/5" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {r.cover_image_url && (
                              <img src={r.cover_image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                            )}
                            <div>
                              <p className="font-medium text-vs-text truncate max-w-[180px]">{r.artist} – {r.title}</p>
                              <p className="text-vs-muted">{r.year ?? "—"} · {r.condition}</p>
                            </div>
                          </div>
                        </td>
                        {!selectedId && <td className="px-4 py-3 text-vs-text-2">{consignorName}</td>}
                        <td className="px-4 py-3 text-vs-text-2">
                          {r.consigned_at ? (
                            <span className={aging ? "text-amber-500 flex items-center gap-1" : ""}>
                              {aging && <AlertCircle size={11} />}
                              {days}d ago
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-vs-text-2">{fmt(r.consignor_agreed_price)}</td>
                        <td className="px-4 py-3 text-right text-vs-text-2">
                          {r.consignor_commission_pct != null ? `${r.consignor_commission_pct}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {r.status === "sold" ? (
                            <span className={r.consignor_payout_status === "paid" ? "text-vs-success" : "text-vs-warning"}>
                              {fmt(r.consignor_amount_owed)}
                            </span>
                          ) : (
                            <span className="text-vs-muted">pending sale</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === "sold" && r.consignor_payout_status === "paid" ? (
                            <span className="inline-flex items-center gap-1 text-vs-success text-2xs">
                              <CheckCircle size={11} /> Paid
                            </span>
                          ) : r.status === "sold" ? (
                            <span className="inline-flex items-center gap-1 text-vs-warning text-2xs">
                              <Clock size={11} /> Pending
                            </span>
                          ) : (
                            <span className="text-vs-muted text-2xs">In stock</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === "sold" && r.consignor_payout_status !== "paid" && r.consignor_amount_owed != null && (
                            <button
                              onClick={() => markPaid(r.id)}
                              disabled={markingPaid === r.id}
                              className="text-2xs px-2 py-1 rounded border border-vs-success/40 text-vs-success hover:bg-vs-success/10 transition-colors disabled:opacity-40"
                            >
                              {markingPaid === r.id ? <Loader2 size={11} className="animate-spin inline" /> : "Mark paid"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {formOpen && (
        <ConsignorForm
          initial={editConsignor}
          onSave={saved => {
            setConsignors(cs => {
              const idx = cs.findIndex(c => c.id === saved.id);
              return idx >= 0 ? cs.map(c => c.id === saved.id ? saved : c) : [...cs, saved];
            });
            setFormOpen(false);
            toast.success(editConsignor ? "Consignor updated" : "Consignor created");
          }}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
