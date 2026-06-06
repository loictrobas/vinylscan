"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Disc3, LogOut, Check } from "lucide-react";
import { api, clearToken, getToken, type User } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [markupInput, setMarkupInput] = useState("");
  const [markupSaved, setMarkupSaved] = useState(false);
  const [markupSaving, setMarkupSaving] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.me().then(setUser).catch(() => router.replace("/"));
    api.getPriceMarkup().then((d) => {
      setMarkupInput(d.price_markup_pct != null ? String(d.price_markup_pct) : "");
    }).catch(() => {});
  }, [router]);

  async function saveMarkup() {
    setMarkupSaving(true);
    try {
      const pct = markupInput === "" ? null : parseFloat(markupInput);
      await api.setPriceMarkup(isNaN(pct as number) ? null : pct);
      setMarkupSaved(true);
      setTimeout(() => setMarkupSaved(false), 2000);
    } finally {
      setMarkupSaving(false);
    }
  }

  const handleLogout = async () => {
    clearToken();
    await fetch(`${API_URL}/auth/logout`, { method: "POST" }).catch(() => {});
    router.replace("/");
  };

  if (!user) return (
    <div className="flex items-center justify-center min-h-screen">
      <Disc3 size={32} className="animate-spin text-vinyl-muted" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
      <h1 className="text-3xl font-bold">Settings</h1>

      <div className="card p-6 flex flex-col gap-5">
        <h2 className="text-lg font-bold">Discogs Account</h2>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-vinyl-border rounded-full flex items-center justify-center">
            <Disc3 size={24} className="text-vinyl-accent" />
          </div>
          <div>
            <p className="font-semibold">{user.discogs_username}</p>
            <p className="text-vinyl-muted text-sm">Connected since {new Date(user.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <a
          href={`https://www.discogs.com/user/${user.discogs_username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-vinyl-accent hover:underline text-sm"
        >
          View Discogs profile →
        </a>
      </div>

      <div className="card p-6 flex flex-col gap-4">
        <h2 className="text-lg font-bold">Account</h2>
        <p className="text-vinyl-muted text-sm">
          Member since {new Date(user.created_at).toLocaleDateString()}
        </p>
        <button onClick={handleLogout} className="btn-secondary flex items-center gap-2 w-fit">
          <LogOut size={16} />
          Log Out
        </button>
      </div>

      <div className="card p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold">Pricing</h2>
          <p className="text-vinyl-muted text-sm mt-1">
            Auto-markup applied on top of Discogs lowest price when a record is added.
            Leave blank for no markup.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="-100"
              max="500"
              step="1"
              value={markupInput}
              onChange={(e) => setMarkupInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveMarkup()}
              placeholder="0"
              className="w-24 bg-vinyl-border rounded-xl px-3 py-2 text-sm text-vinyl-text placeholder-vinyl-muted focus:outline-none focus:ring-1 focus:ring-vinyl-accent"
            />
            <span className="text-vinyl-muted text-sm">%</span>
          </div>
          <button
            onClick={saveMarkup}
            disabled={markupSaving}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5 disabled:opacity-50"
          >
            {markupSaved ? <><Check size={14} /> Saved</> : markupSaving ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="text-xs text-vinyl-muted">
          Example: 20% markup on a $5 lowest-price record → asking price $6.00
        </p>
      </div>

      <div className="card p-6 flex flex-col gap-3">
        <h2 className="text-lg font-bold">Quick Links</h2>
        <div className="flex flex-col gap-2">
          <Link href="/dashboard" className="text-vinyl-muted hover:text-vinyl-text text-sm transition-colors">→ Dashboard</Link>
          <Link href="/history" className="text-vinyl-muted hover:text-vinyl-text text-sm transition-colors">→ Scan History</Link>
          <Link href="/credits" className="text-vinyl-muted hover:text-vinyl-text text-sm transition-colors">→ Credits & Billing</Link>
        </div>
      </div>
    </div>
  );
}
