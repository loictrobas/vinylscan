"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Image as ImageIcon, Package, Eye, EyeOff } from "lucide-react";
import { api, type Accessory, ACCESSORY_CATEGORIES } from "@/lib/api";
import { AccessoryModal } from "@/components/AccessoryModal";

function fmt(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

export default function AccessoriesPage() {
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Accessory | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setAccessories(await api.listAccessories());
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = categoryFilter ? accessories.filter((a) => a.category === categoryFilter) : accessories;

  async function remove(id: string) {
    if (!confirm("Delete this accessory? This can't be undone.")) return;
    setDeletingId(id);
    try {
      await api.deleteAccessory(id);
      setAccessories((as) => as.filter((a) => a.id !== id));
      toast.success("Accessory deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeletingId(null); }
  }

  async function toggleListed(a: Accessory) {
    setTogglingId(a.id);
    try {
      const updated = await api.updateAccessory(a.id, { is_listed: !a.is_listed });
      setAccessories((as) => as.map((x) => (x.id === a.id ? updated : x)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setTogglingId(null);
    }
  }

  function upsert(saved: Accessory) {
    setAccessories((as) => {
      const idx = as.findIndex((a) => a.id === saved.id);
      return idx >= 0 ? as.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...as];
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-vs-text">Accessories</h1>
          <p className="text-xs text-vs-muted mt-0.5">Turntables, cartridges, sleeves and other non-record gear for your storefront.</p>
        </div>
        <button
          onClick={() => { setEditing(undefined); setModalOpen(true); }}
          className="btn-primary text-sm flex items-center gap-1.5"
        >
          <Plus size={14} />New accessory
        </button>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${!categoryFilter ? "bg-vs-accent text-white border-vs-accent" : "border-vs-border text-vs-muted hover:text-vs-text"}`}
        >
          All ({accessories.length})
        </button>
        {ACCESSORY_CATEGORIES.map((c) => {
          const count = accessories.filter((a) => a.category === c).length;
          if (count === 0) return null;
          return (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${categoryFilter === c ? "bg-vs-accent text-white border-vs-accent" : "border-vs-border text-vs-muted hover:text-vs-text"}`}
            >
              {c} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-vs-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Package size={28} className="text-vs-muted/40 mx-auto mb-2" />
          <p className="text-vs-muted text-sm">No accessories yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((a) => (
            <div key={a.id} className="bg-vs-card border border-vs-border rounded-xl overflow-hidden group">
              <div className="w-full aspect-square bg-vs-raised flex items-center justify-center overflow-hidden">
                {a.cover_image_url ? (
                  <img src={a.cover_image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={24} className="text-vs-muted" />
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-vs-text truncate">{a.name}</p>
                  <button
                    onClick={() => toggleListed(a)}
                    disabled={togglingId === a.id}
                    title={a.is_listed ? "Click to hide from storefront" : "Click to list on storefront"}
                    className={`text-2xs px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0 transition-colors disabled:opacity-50 ${
                      a.is_listed ? "bg-vs-success/10 text-vs-success hover:bg-vs-success/20" : "bg-vs-muted/20 text-vs-muted hover:bg-vs-muted/30"
                    }`}
                  >
                    {togglingId === a.id ? <Loader2 size={10} className="animate-spin" /> : a.is_listed ? <Eye size={10} /> : <EyeOff size={10} />}
                    {a.is_listed ? "Listed" : "Hidden"}
                  </button>
                </div>
                <p className="text-2xs text-vs-muted mt-0.5">{a.category}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-semibold text-vs-text">{fmt(a.price)}</span>
                  <span className={`text-2xs ${a.stock_quantity <= 0 ? "text-vs-danger" : "text-vs-muted"}`}>
                    {a.stock_quantity <= 0 ? "Out of stock" : `${a.stock_quantity} in stock`}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-vs-border">
                  <button
                    onClick={() => { setEditing(a); setModalOpen(true); }}
                    className="flex-1 text-2xs px-2 py-1.5 rounded border border-vs-border text-vs-muted hover:text-vs-accent hover:border-vs-accent/40 transition-colors flex items-center justify-center gap-1"
                  >
                    <Pencil size={11} />Edit
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    disabled={deletingId === a.id}
                    className="text-2xs px-2 py-1.5 rounded border border-vs-border text-vs-muted hover:text-vs-danger hover:border-vs-danger/40 transition-colors disabled:opacity-40"
                  >
                    {deletingId === a.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <AccessoryModal
          accessory={editing}
          onSaved={upsert}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
