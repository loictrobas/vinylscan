"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Shield, Ban, CheckCircle2, RefreshCw, Copy, Loader2,
  Disc3, AlertCircle, Save,
} from "lucide-react";
import { api, type AdminUser } from "@/lib/api";

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Editable fields
  const [displayName, setDisplayName] = useState("");
  const [credits, setCredits] = useState(0);

  // Reset link
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [resetCopied, setResetCopied] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    api.adminGetUser(id)
      .then((u) => {
        setUser(u);
        setDisplayName(u.display_name ?? "");
        setCredits(u.credits);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function saveChanges() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.adminPatchUser(id, {
        display_name: displayName || undefined,
        credits,
      });
      setUser(updated);
      showToast("Saved");
    } catch (e: unknown) { setError((e as Error).message); }
    setSaving(false);
  }

  async function toggleActive() {
    if (!user) return;
    const confirmed = confirm(user.is_active ? "Disable this account?" : "Re-enable this account?");
    if (!confirmed) return;
    try {
      const updated = await api.adminPatchUser(id, { is_active: !user.is_active });
      setUser(updated);
      showToast(updated.is_active ? "Account enabled" : "Account disabled");
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function toggleAdmin() {
    if (!user) return;
    const msg = user.is_admin ? "Remove admin access?" : "Grant admin access?";
    if (!confirm(msg)) return;
    try {
      const updated = await api.adminPatchUser(id, { is_admin: !user.is_admin });
      setUser(updated);
      showToast(updated.is_admin ? "Admin granted" : "Admin removed");
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function generateResetLink() {
    setResetLoading(true);
    setResetUrl(null);
    setError(null);
    try {
      const res = await api.adminGenerateResetLink(id);
      setResetUrl(res.reset_url);
    } catch (e: unknown) { setError((e as Error).message); }
    setResetLoading(false);
  }

  async function copyResetLink() {
    if (!resetUrl) return;
    await navigator.clipboard.writeText(resetUrl);
    setResetCopied(true);
    setTimeout(() => setResetCopied(false), 2000);
  }

  async function clearDiscogs() {
    if (!confirm("Clear Discogs connection? User will need to re-connect.")) return;
    try {
      await api.adminClearDiscogs(id);
      setUser((u) => u ? { ...u, discogs_username: null, last_discogs_sync: null } : u);
      showToast("Discogs connection cleared");
    } catch (e: unknown) { setError((e as Error).message); }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin text-vs-muted" />
    </div>
  );

  if (!user) return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <p className="text-vs-danger">User not found.</p>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back */}
      <button onClick={() => router.push("/admin")} className="flex items-center gap-2 text-vs-muted hover:text-vs-text text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to admin
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-vs-raised border border-vs-border flex items-center justify-center text-vs-muted">
          {user.display_name ? user.display_name[0].toUpperCase() : "?"}
        </div>
        <div>
          <h1 className="text-xl font-bold text-vs-text">{user.display_name || user.email || user.discogs_username}</h1>
          <p className="text-vs-muted text-sm">{user.email ?? "No email"}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            {user.is_admin && (
              <span className="inline-flex items-center gap-1 text-2xs bg-vs-accent/15 text-vs-accent px-2 py-0.5 rounded-full font-medium">
                <Shield size={10} /> Admin
              </span>
            )}
            <span className={`text-2xs font-medium px-2 py-0.5 rounded-full ${user.is_active ? "bg-vs-success/15 text-vs-success" : "bg-vs-danger/15 text-vs-danger"}`}>
              {user.is_active ? "Active" : "Disabled"}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Records", value: user.record_count },
          { label: "Scans", value: user.scan_count },
          { label: "Credits", value: user.credits },
        ].map(({ label, value }) => (
          <div key={label} className="card p-3 text-center">
            <p className="text-xl font-bold text-vs-text">{value}</p>
            <p className="text-xs text-vs-muted">{label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-vs-danger text-sm bg-vs-danger/10 rounded-xl px-4 py-3 mb-4">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Edit section */}
      <div className="card p-5 space-y-4 mb-4">
        <h3 className="text-sm font-semibold text-vs-text">Edit account</h3>
        <div>
          <label className="text-xs text-vs-text-2 mb-1 block">Display name</label>
          <input type="text" className="input w-full" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Store name" />
        </div>
        <div>
          <label className="text-xs text-vs-text-2 mb-1 block">Credits</label>
          <input type="number" min={0} className="input w-32" value={credits} onChange={(e) => setCredits(Number(e.target.value))} />
        </div>
        <button onClick={saveChanges} disabled={saving} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Password reset */}
      {user.email && (
        <div className="card p-5 space-y-3 mb-4">
          <h3 className="text-sm font-semibold text-vs-text">Password reset</h3>
          <p className="text-xs text-vs-muted">Generate a reset link (valid 48 h). Copy and send it to the user yourself.</p>
          <button onClick={generateResetLink} disabled={resetLoading} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
            {resetLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {resetLoading ? "Generating…" : "Generate reset link"}
          </button>
          {resetUrl && (
            <div className="bg-vs-raised rounded-xl p-3 flex items-center gap-3">
              <code className="text-xs text-vs-text flex-1 break-all">{resetUrl}</code>
              <button onClick={copyResetLink} className="btn-secondary flex items-center gap-1.5 text-xs flex-shrink-0">
                {resetCopied ? <CheckCircle2 size={13} className="text-vs-success" /> : <Copy size={13} />}
                {resetCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Danger zone */}
      <div className="card p-5 space-y-3 border-vs-danger/30">
        <h3 className="text-sm font-semibold text-vs-danger">Danger zone</h3>
        <div className="flex gap-3 flex-wrap">
          <button onClick={toggleActive} className={`btn-secondary flex items-center gap-2 text-sm ${!user.is_active ? "text-vs-success" : "text-vs-danger"}`}>
            {user.is_active ? <Ban size={14} /> : <CheckCircle2 size={14} />}
            {user.is_active ? "Disable account" : "Enable account"}
          </button>
          <button onClick={toggleAdmin} className="btn-secondary flex items-center gap-2 text-sm">
            <Shield size={14} />
            {user.is_admin ? "Remove admin" : "Make admin"}
          </button>
          {user.discogs_username && (
            <button onClick={clearDiscogs} className="btn-secondary flex items-center gap-2 text-sm text-vs-warning">
              <Disc3 size={14} />
              Clear Discogs connection
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-vs-card border border-vs-border rounded-xl px-4 py-3 shadow-xl flex items-center gap-2 text-sm text-vs-text z-50">
          <CheckCircle2 size={16} className="text-vs-success" /> {toast}
        </div>
      )}
    </div>
  );
}
