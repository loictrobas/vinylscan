"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Heart, Plus, X, RefreshCw, Disc3, ArrowRight, Music2,
} from "lucide-react";
import { api, getToken, type WantlistItem, type User } from "@/lib/api";

interface AddModalProps {
  onClose: () => void;
  onSaved: (item: WantlistItem) => void;
}

function AddModal({ onClose, onSaved }: AddModalProps) {
  const [form, setForm] = useState({ artist: "", title: "", year: "", label: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.artist.trim() || !form.title.trim()) { setError("Artist and title required."); return; }
    setSaving(true); setError("");
    try {
      const saved = await api.addWantlistItem({
        artist: form.artist.trim(),
        title: form.title.trim(),
        year: form.year ? parseInt(form.year) : null,
        label: form.label.trim() || null,
        notes: form.notes.trim() || null,
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
          <h2 className="text-base font-medium">Add to wantlist</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-vs-text-2 mb-1 block">Artist <span className="text-vs-danger">*</span></label>
              <input className="input w-full" value={form.artist} onChange={(e) => set("artist", e.target.value)} placeholder="e.g. John Coltrane" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-vs-text-2 mb-1 block">Title <span className="text-vs-danger">*</span></label>
              <input className="input w-full" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. A Love Supreme" />
            </div>
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Year</label>
              <input className="input w-full" type="number" min="1900" max="2099" value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="1965" />
            </div>
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Label</label>
              <input className="input w-full" value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Impulse!" />
            </div>
          </div>
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Notes</label>
            <textarea className="input resize-none w-full" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Original pressing only, UK version" />
          </div>
          {error && <p className="text-xs text-vs-danger">{error}</p>}
        </div>
        <div className="px-6 pb-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Adding…" : "Add to wantlist"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WantlistRow({ item, onDelete }: { item: WantlistItem; onDelete: (id: number) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function del() {
    setDeleting(true);
    try {
      await api.deleteWantlistItem(item.id);
      onDelete(item.id);
    } catch { setDeleting(false); setConfirming(false); }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-vs-border bg-vs-card hover:border-vs-border-2 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-vs-danger/10 flex items-center justify-center flex-shrink-0">
        <Heart size={14} className="text-vs-danger" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-vs-text truncate">{item.artist} — {item.title}</p>
        <p className="text-xs text-vs-muted">
          {[item.year, item.label].filter(Boolean).join(" · ") || "No details"}
        </p>
        {item.notes && (
          <p className="text-xs text-vs-muted/70 mt-0.5 italic truncate">{item.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {confirming ? (
          <>
            <button
              onClick={del}
              disabled={deleting}
              className="text-xs px-2.5 py-1 rounded-lg bg-vs-danger text-white font-medium disabled:opacity-50"
            >
              {deleting ? "…" : "Remove"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs px-2.5 py-1 rounded-lg text-vs-muted hover:text-vs-text"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="p-1.5 rounded-lg text-vs-muted hover:text-vs-danger transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function WantlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<WantlistItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.listWantlist()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.me().then(setUser).catch(() => {});
    load();
  }, [router, load]);

  async function syncDiscogs() {
    setSyncing(true);
    try {
      const synced = await api.syncDiscogsWantlist();
      setItems(synced);
    } catch { /* ignore */ }
    finally { setSyncing(false); }
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const discogsConnected = !!user?.discogs_username;

  return (
    <div className="px-6 py-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-vs-text">Wantlist</h1>
          <p className="text-sm text-vs-text-2 mt-0.5">{items.length} record{items.length !== 1 ? "s" : ""} to find</p>
        </div>
        <div className="flex items-center gap-2">
          {discogsConnected && (
            <button
              onClick={syncDiscogs}
              disabled={syncing}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              Sync Discogs
            </button>
          )}
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} />
            Add record
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Disc3 size={24} className="animate-spin text-vs-muted" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Music2 size={36} className="text-vs-muted" />
          <div>
            <p className="text-vs-text-2 text-sm">No records on your wantlist yet</p>
            <p className="text-xs text-vs-muted mt-1">Add records you're hunting for</p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-1">Add first record</button>
          {discogsConnected && (
            <button onClick={syncDiscogs} disabled={syncing} className="btn-secondary flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
              Import from Discogs wantlist
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <WantlistRow key={item.id} item={item} onDelete={removeItem} />
          ))}
        </div>
      )}

      {showModal && (
        <AddModal
          onClose={() => setShowModal(false)}
          onSaved={(item) => { setItems((prev) => [item, ...prev]); setShowModal(false); }}
        />
      )}
    </div>
  );
}
