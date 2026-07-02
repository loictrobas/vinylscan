"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Mail, Plus, Trash2, Copy, CheckCircle2, AlertCircle,
  Loader2, Shield, Ban, RefreshCw, ExternalLink, ChevronRight, FlaskConical, BarChart3,
} from "lucide-react";
import { api, type AdminUser, type AdminInvite } from "@/lib/api";

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = "users" | "invites";

// ── Helpers ───────────────────────────────────────────────────────────────────
function ago(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.adminListUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-vs-muted" /></div>;
  if (error) return <p className="text-vs-danger text-sm py-4">{error}</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-vs-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-vs-border bg-vs-raised/50">
            <th className="text-left px-4 py-3 text-vs-text-2 font-medium">User</th>
            <th className="text-left px-4 py-3 text-vs-text-2 font-medium">Credits</th>
            <th className="text-left px-4 py-3 text-vs-text-2 font-medium">Records</th>
            <th className="text-left px-4 py-3 text-vs-text-2 font-medium">Joined</th>
            <th className="text-left px-4 py-3 text-vs-text-2 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-vs-border/50 hover:bg-vs-raised/30 transition-colors">
              <td className="px-4 py-3">
                <p className="font-medium text-vs-text">{u.display_name || u.email || u.discogs_username}</p>
                <p className="text-xs text-vs-muted">{u.email ?? u.discogs_username ?? "—"}</p>
                {u.is_admin && (
                  <span className="inline-flex items-center gap-1 text-2xs text-vs-accent font-medium mt-0.5">
                    <Shield size={10} /> Admin
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-vs-text">{u.credits}</td>
              <td className="px-4 py-3 text-vs-text">{u.record_count}</td>
              <td className="px-4 py-3 text-vs-muted text-xs">{ago(u.created_at)}</td>
              <td className="px-4 py-3">
                <span className={`text-2xs font-medium px-2 py-0.5 rounded-full ${u.is_active ? "bg-vs-success/15 text-vs-success" : "bg-vs-danger/15 text-vs-danger"}`}>
                  {u.is_active ? "Active" : "Disabled"}
                </span>
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => router.push(`/admin/users/${u.id}`)}
                  className="p-1 rounded hover:bg-vs-raised text-vs-muted hover:text-vs-text transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && (
        <p className="text-center py-12 text-vs-muted text-sm">No users yet</p>
      )}
    </div>
  );
}

// ── Invites tab ───────────────────────────────────────────────────────────────
function InvitesTab() {
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setInvites(await api.adminListInvites()); } catch (e: unknown) { setError((e as Error).message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const inv = await api.adminCreateInvite(email.trim(), note.trim() || undefined);
      setInvites((prev) => [inv, ...prev]);
      setEmail("");
      setNote("");
    } catch (e: unknown) { setError((e as Error).message); }
    setCreating(false);
  }

  async function copyLink(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function revokeInvite(id: string) {
    if (!confirm("Revoke this invite?")) return;
    try {
      await api.adminRevokeInvite(id);
      setInvites((prev) => prev.filter((i) => i.id !== id));
    } catch (e: unknown) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-vs-text mb-4 flex items-center gap-2">
          <Plus size={16} className="text-vs-accent" /> New invite
        </h3>
        <form onSubmit={createInvite} className="flex gap-3 flex-wrap">
          <input
            type="email" required placeholder="store@example.com"
            className="input flex-1 min-w-48" value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="text" placeholder="Note (optional)"
            className="input flex-1 min-w-40" value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {creating ? "Creating…" : "Create invite"}
          </button>
        </form>
        {error && <p className="text-vs-danger text-xs mt-3">{error}</p>}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-vs-muted" /></div>
      ) : (
        <div className="space-y-2">
          {invites.map((inv) => {
            const used = !!inv.used_at;
            const expired = !used && inv.expires_at && new Date(inv.expires_at) < new Date();
            return (
              <div key={inv.id} className={`card p-4 flex items-center gap-4 ${used || expired ? "opacity-50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-vs-text">{inv.email}</p>
                  <p className="text-xs text-vs-muted">{inv.note ?? "—"}</p>
                  <p className="text-2xs text-vs-muted mt-0.5">
                    {used ? `Used ${ago(inv.used_at!)}` : expired ? "Expired" : `Expires ${inv.expires_at ? ago(inv.expires_at) : "never"}`}
                  </p>
                </div>
                {!used && !expired && (
                  <button
                    onClick={() => copyLink(inv.invite_url, inv.id)}
                    className="btn-secondary flex items-center gap-1.5 text-xs"
                    title="Copy invite link"
                  >
                    {copied === inv.id ? <CheckCircle2 size={13} className="text-vs-success" /> : <Copy size={13} />}
                    {copied === inv.id ? "Copied!" : "Copy link"}
                  </button>
                )}
                {!used && (
                  <button onClick={() => revokeInvite(inv.id)} className="p-1.5 rounded hover:bg-vs-raised text-vs-muted hover:text-vs-danger transition-colors" title="Revoke">
                    <Trash2 size={14} />
                  </button>
                )}
                {used && <CheckCircle2 size={16} className="text-vs-success flex-shrink-0" />}
              </div>
            );
          })}
          {invites.length === 0 && <p className="text-center py-8 text-vs-muted text-sm">No invites yet</p>}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-vs-accent" />
          <h1 className="text-2xl font-bold text-vs-text">Admin</h1>
        </div>
        <button
          onClick={() => router.push("/admin/eval")}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <BarChart3 size={15} />
          Eval
        </button>
        <button
          onClick={() => router.push("/admin/benchmark")}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <FlaskConical size={15} />
          Benchmark
        </button>
      </div>

      <div className="flex gap-1 border-b border-vs-border mb-6">
        {(["users", "invites"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "text-vs-accent border-b-2 border-vs-accent"
                : "text-vs-muted hover:text-vs-text"
            }`}
          >
            {t === "users" ? <><Users size={14} className="inline mr-1.5" />Users</> : <><Mail size={14} className="inline mr-1.5" />Invites</>}
          </button>
        ))}
      </div>

      {tab === "users" ? <UsersTab /> : <InvitesTab />}
    </div>
  );
}
