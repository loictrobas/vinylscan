"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Disc3, LogOut } from "lucide-react";
import { api, clearToken, getToken, type User } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.me().then(setUser).catch(() => router.replace("/"));
  }, [router]);

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
