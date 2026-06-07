"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Store, ExternalLink, Copy, Check, Loader2, Eye, EyeOff } from "lucide-react";
import { api, getToken, type StoreSettings } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const FRONTEND_URL = typeof window !== "undefined" ? window.location.origin : "";

export default function StoreSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [form, setForm] = useState({
    store_name: "",
    store_slug: "",
    store_description: "",
    store_contact: "",
    store_public: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.getStoreSettings()
      .then((s) => {
        setSettings(s);
        setForm({
          store_name: s.store_name ?? "",
          store_slug: s.store_slug ?? "",
          store_description: s.store_description ?? "",
          store_contact: s.store_contact ?? "",
          store_public: s.store_public,
        });
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const updated = await api.updateStoreSettings({
        store_name: form.store_name || null,
        store_slug: form.store_slug || null,
        store_description: form.store_description || null,
        store_contact: form.store_contact || null,
        store_public: form.store_public,
      });
      setSettings(updated);
      setForm({
        store_name: updated.store_name ?? "",
        store_slug: updated.store_slug ?? "",
        store_description: updated.store_description ?? "",
        store_contact: updated.store_contact ?? "",
        store_public: updated.store_public,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg.includes("409") || msg.toLowerCase().includes("taken") ? "That URL slug is already taken." : msg);
    } finally { setSaving(false); }
  }

  const storeUrl = settings?.store_slug
    ? `${FRONTEND_URL}/store/${settings.store_slug}`
    : null;

  async function copyUrl() {
    if (!storeUrl) return;
    await navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin text-vs-muted" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-vs-raised border border-vs-border-2 flex items-center justify-center">
          <Store size={16} className="text-vs-accent" />
        </div>
        <div>
          <h1 className="text-xl font-medium">Your store</h1>
          <p className="text-xs text-vs-muted mt-0.5">Public browsable catalog for your customers</p>
        </div>
      </div>

      {/* Public toggle hero */}
      <div className="card p-4 mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-vs-text">
            {form.store_public ? "Store is live" : "Store is private"}
          </p>
          <p className="text-xs text-vs-muted mt-0.5">
            {form.store_public
              ? "Customers can browse and build carts"
              : "Only you can see it — flip the switch when ready"}
          </p>
        </div>
        <button
          onClick={() => setForm((f) => ({ ...f, store_public: !f.store_public }))}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.store_public ? "bg-vs-success" : "bg-vs-border"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.store_public ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Store URL */}
      {storeUrl && (
        <div className="mb-5 p-3 rounded-xl bg-vs-raised border border-vs-border flex items-center gap-2">
          <p className="text-xs text-vs-text-2 flex-1 truncate">{storeUrl}</p>
          <button onClick={copyUrl} className="text-vs-muted hover:text-vs-text flex-shrink-0 transition-colors">
            {copied ? <Check size={14} className="text-vs-success" /> : <Copy size={14} />}
          </button>
          <a href={`/store/${settings!.store_slug}`} target="_blank" rel="noopener noreferrer"
            className="text-vs-muted hover:text-vs-text flex-shrink-0 transition-colors">
            <ExternalLink size={14} />
          </a>
        </div>
      )}

      {/* Form */}
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-vs-text-2 mb-1 block">Store name</label>
          <input
            className="input"
            value={form.store_name}
            onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
            placeholder="e.g. Bendito Records"
          />
        </div>

        <div>
          <label className="text-xs text-vs-text-2 mb-1 block">URL slug</label>
          <div className="flex items-center gap-0">
            <span className="px-3 py-2 bg-vs-raised border border-r-0 border-vs-border rounded-l-lg text-xs text-vs-muted whitespace-nowrap">
              /store/
            </span>
            <input
              className="input rounded-l-none"
              value={form.store_slug}
              onChange={(e) => setForm((f) => ({ ...f, store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
              placeholder="bendito-records"
            />
          </div>
          <p className="text-2xs text-vs-muted mt-1">Letters, numbers, hyphens only. Leave blank to auto-generate.</p>
        </div>

        <div>
          <label className="text-xs text-vs-text-2 mb-1 block">Description</label>
          <textarea
            className="input resize-none"
            rows={2}
            value={form.store_description}
            onChange={(e) => setForm((f) => ({ ...f, store_description: e.target.value }))}
            placeholder="A short description of your store…"
          />
        </div>

        <div>
          <label className="text-xs text-vs-text-2 mb-1 block">Contact (WhatsApp number or email)</label>
          <input
            className="input"
            value={form.store_contact}
            onChange={(e) => setForm((f) => ({ ...f, store_contact: e.target.value }))}
            placeholder="+1 555 000 0000 or hello@store.com"
          />
          <p className="text-2xs text-vs-muted mt-1">Used for the "Send cart" button on your store. Phone numbers get a WhatsApp link.</p>
        </div>

        {error && <p className="text-xs text-vs-danger">{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
          {saving ? "Saving…" : saved ? "Saved!" : "Save settings"}
        </button>
      </div>
    </div>
  );
}
