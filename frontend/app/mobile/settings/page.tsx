"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User as UserIcon, Disc3, Monitor, LogOut, Check, Loader2, ChevronRight,
} from "lucide-react";
import { api, getToken, clearToken, clearMeCache, type User } from "@/lib/api";

export default function MobileSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.me().then((u) => {
      setUser(u);
      setEditName(u.display_name ?? "");
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [router]);

  async function saveName() {
    if (!user || editName === (user.display_name ?? "")) return;
    setNameSaving(true);
    try {
      const updated = await api.updateMe({ display_name: editName });
      setUser(updated);
      clearMeCache();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch { /* ignore */ }
    finally { setNameSaving(false); }
  }

  function signOut() {
    clearToken();
    router.replace("/");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin text-vs-muted" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-safe pb-8">
      <h1 className="text-xl font-bold mb-6">Settings</h1>

      {/* Display name */}
      <div className="mb-5">
        <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-3">Profile</p>
        <div className="rounded-2xl bg-vs-raised border border-vs-border overflow-hidden">
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-vs-accent/15 flex items-center justify-center flex-shrink-0">
              <UserIcon size={15} className="text-vs-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-vs-muted mb-1">Display name</p>
              <input
                className="input w-full text-sm py-1.5"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={saveName}
                placeholder={user?.discogs_username ?? "Your name"}
              />
            </div>
            {nameSaving && <Loader2 size={14} className="animate-spin text-vs-muted flex-shrink-0" />}
            {nameSaved && <Check size={14} className="text-vs-success flex-shrink-0" />}
          </div>
          <div className="border-t border-vs-border px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-vs-muted">Email</p>
              <p className="text-sm text-vs-text-2 mt-0.5">{user?.email ?? "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Discogs */}
      <div className="mb-5">
        <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-3">Discogs</p>
        <div className="rounded-2xl bg-vs-raised border border-vs-border overflow-hidden">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Disc3 size={16} className="text-vs-muted" />
              <div>
                <p className="text-sm font-medium">Discogs account</p>
                <p className="text-xs text-vs-muted mt-0.5">
                  {user?.discogs_username ? `Connected as @${user.discogs_username}` : "Not connected"}
                </p>
              </div>
            </div>
            <a href="/settings?desktop=1" className="flex items-center gap-1 text-xs text-vs-accent">
              Manage <ChevronRight size={13} />
            </a>
          </div>
        </div>
      </div>

      {/* More settings */}
      <div className="mb-5">
        <a
          href="/settings?desktop=1"
          className="flex items-center justify-between px-4 py-3.5 rounded-2xl bg-vs-raised border border-vs-border"
        >
          <div className="flex items-center gap-3">
            <Monitor size={16} className="text-vs-muted" />
            <div>
              <p className="text-sm font-medium">All settings</p>
              <p className="text-xs text-vs-muted">Open desktop settings for more options</p>
            </div>
          </div>
          <ChevronRight size={14} className="text-vs-muted" />
        </a>
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-vs-danger/30 text-vs-danger text-sm font-medium active:opacity-70 transition-opacity"
      >
        <LogOut size={15} />
        Sign out
      </button>
    </div>
  );
}
