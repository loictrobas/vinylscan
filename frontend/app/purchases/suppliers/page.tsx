"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, X, Building2 } from "lucide-react";
import { getToken } from "@/lib/api";

interface Supplier {
  id: string;
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

// Local-only stub — no backend yet. Stored in localStorage until API is built.
const STORAGE_KEY = "vinylscan_suppliers";
function loadSuppliers(): Supplier[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function saveSuppliers(s: Supplier[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

let _id = 0;
function newId() { return `local-${Date.now()}-${_id++}`; }

function SupplierModal({ onClose, onSaved }: { onClose: () => void; onSaved: (s: Supplier) => void }) {
  const [form, setForm] = useState({ name: "", contact: "", email: "", phone: "", notes: "" });
  const [error, setError] = useState("");
  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  function save() {
    if (!form.name.trim()) { setError("Name required."); return; }
    onSaved({ id: newId(), ...form });
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-vs-card border border-vs-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-vs-border">
          <h2 className="text-base font-medium">Add supplier</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          {[
            { k: "name", label: "Name", placeholder: "Record shop / person name" },
            { k: "contact", label: "Contact name", placeholder: "" },
            { k: "email", label: "Email", placeholder: "supplier@email.com" },
            { k: "phone", label: "Phone", placeholder: "+1 555 0000" },
          ].map(({ k, label, placeholder }) => (
            <div key={k}>
              <label className="text-xs text-vs-text-2 mb-1 block">{label}</label>
              <input className="input" value={(form as Record<string, string>)[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
            </div>
          ))}
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          {error && <p className="text-xs text-vs-danger">{error}</p>}
        </div>
        <div className="px-6 pb-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} className="btn-primary">Add supplier</button>
        </div>
      </div>
    </div>
  );
}

export default function SuppliersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    setSuppliers(loadSuppliers());
  }, [router]);

  function addSupplier(s: Supplier) {
    const next = [s, ...suppliers];
    setSuppliers(next);
    saveSuppliers(next);
  }

  function deleteSupplier(id: string) {
    const next = suppliers.filter((s) => s.id !== id);
    setSuppliers(next);
    saveSuppliers(next);
    setDeleteId(null);
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium">Suppliers</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={14} />
          Add supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Users size={36} className="text-vs-muted" />
          <p className="text-vs-text-2 text-sm">No suppliers yet. Add your first source.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Add supplier</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-vs-raised border border-vs-border flex items-center justify-center flex-shrink-0">
                  <Building2 size={15} className="text-vs-muted" />
                </div>
                <button onClick={() => setDeleteId(s.id)} className="text-vs-muted hover:text-vs-danger">
                  <X size={13} />
                </button>
              </div>
              <h3 className="text-sm font-medium text-vs-text">{s.name}</h3>
              {s.contact && <p className="text-xs text-vs-text-2 mt-0.5">{s.contact}</p>}
              <div className="mt-3 flex flex-col gap-1">
                {s.email && <p className="text-xs text-vs-muted">{s.email}</p>}
                {s.phone && <p className="text-xs text-vs-muted">{s.phone}</p>}
                {s.notes && <p className="text-xs text-vs-muted border-t border-vs-border/50 pt-2 mt-1">{s.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <SupplierModal onClose={() => setShowModal(false)} onSaved={addSupplier} />}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDeleteId(null)} />
          <div className="relative bg-vs-card border border-vs-border rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-medium mb-2">Remove supplier?</h3>
            <p className="text-sm text-vs-text-2 mb-4">This only removes from your local list.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => deleteSupplier(deleteId)} className="btn-danger">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
