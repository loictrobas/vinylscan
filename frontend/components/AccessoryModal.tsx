"use client";

import { useState, useRef } from "react";
import { X, Loader2, Image as ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Accessory, ACCESSORY_CATEGORIES } from "@/lib/api";

interface AccessoryModalProps {
  accessory?: Accessory;
  onClose: () => void;
  onSaved: (a: Accessory) => void;
}

export function AccessoryModal({ accessory, onClose, onSaved }: AccessoryModalProps) {
  const isNew = !accessory;
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(accessory?.name ?? "");
  const [category, setCategory] = useState(accessory?.category ?? "Other");
  const [description, setDescription] = useState(accessory?.description ?? "");
  const [price, setPrice] = useState(accessory?.price != null ? String(accessory.price) : "");
  const [stockQuantity, setStockQuantity] = useState(String(accessory?.stock_quantity ?? 0));
  const [isListed, setIsListed] = useState(accessory?.is_listed ?? true);
  const [coverImageUrl, setCoverImageUrl] = useState(accessory?.cover_image_url ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function buildBody() {
    return {
      name: name.trim(),
      category,
      description: description.trim() || null,
      price: price ? parseFloat(price) : null,
      stock_quantity: stockQuantity ? parseInt(stockQuantity, 10) : 0,
      is_listed: isListed,
    };
  }

  async function save() {
    if (!name.trim()) { setError("Name required."); return; }
    setSaving(true);
    setError("");
    try {
      const body = buildBody();
      const saved = isNew
        ? await api.createAccessory(body)
        : await api.updateAccessory(accessory!.id, body);
      onSaved(saved);
      toast.success(isNew ? "Accessory added" : "Changes saved");
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleImageSelect(file: File) {
    if (isNew) {
      toast.error("Save the accessory first, then add an image.");
      return;
    }
    setUploading(true);
    try {
      const saved = await api.uploadAccessoryImage(accessory!.id, file);
      setCoverImageUrl(saved.cover_image_url);
      onSaved(saved);
      toast.success("Image uploaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage() {
    if (isNew) return;
    setUploading(true);
    try {
      const saved = await api.deleteAccessoryImage(accessory!.id);
      setCoverImageUrl(null);
      onSaved(saved);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-vs-card border border-vs-border rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-vs-border">
          <h2 className="font-semibold text-vs-text">{isNew ? "New accessory" : "Edit accessory"}</h2>
          <button onClick={onClose} className="text-vs-muted hover:text-vs-text transition-colors"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Image */}
          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Image</label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg bg-vs-raised border border-vs-border flex items-center justify-center overflow-hidden flex-shrink-0">
                {coverImageUrl ? (
                  <img src={coverImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={20} className="text-vs-muted" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : null}
                  {coverImageUrl ? "Replace" : "Upload"}
                </button>
                {coverImageUrl && (
                  <button onClick={removeImage} disabled={uploading} className="text-2xs text-vs-danger hover:underline disabled:opacity-50 flex items-center gap-1">
                    <Trash2 size={11} />Remove
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleImageSelect(e.target.files[0]); e.target.value = ""; }}
              />
            </div>
            {isNew && <p className="text-2xs text-vs-muted mt-1">Save first, then add an image.</p>}
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Name *</label>
            <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Slipmat" />
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Category</label>
            <select className="input w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
              {ACCESSORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-vs-text-2 mb-1 block">Description</label>
            <textarea className="input w-full resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short blurb shown on the storefront" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Price $</label>
              <input className="input w-full" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-vs-text-2 mb-1 block">Stock quantity</label>
              <input className="input w-full" type="number" min="0" step="1" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-vs-text-2 cursor-pointer">
            <input type="checkbox" checked={isListed} onChange={(e) => setIsListed(e.target.checked)} />
            Listed on storefront
          </label>

          {error && <p className="text-xs text-vs-danger">{error}</p>}
        </div>

        <div className="px-6 pb-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
