"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Disc3, ShoppingCart, Wifi, WifiOff, Zap } from "lucide-react";
import Link from "next/link";
import { api, getToken, type User } from "@/lib/api";
import { getOfflineQueue } from "@/lib/offline";

export default function MobileHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<{ total_in_stock: number; total_sold: number } | null>(null);
  const [online, setOnline] = useState(true);
  const [queueLen, setQueueLen] = useState(0);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    setOnline(navigator.onLine);
    setQueueLen(getOfflineQueue().length);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    api.me().then(setUser).catch(() => {});
    api.catalogStats().then(setStats).catch(() => {});
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [router]);

  return (
    <div className="px-4 pt-10 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-vs-muted">Welcome back</p>
          <h1 className="text-xl font-bold">{user?.display_name ?? user?.discogs_username ?? "Store"}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {online
            ? <Wifi size={14} className="text-vs-success" />
            : <WifiOff size={14} className="text-vs-danger" />}
          <span className={`text-xs font-medium ${online ? "text-vs-success" : "text-vs-danger"}`}>
            {online ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {/* Offline queue banner */}
      {queueLen > 0 && (
        <Link href="/mobile/scan" className="block mb-4 px-4 py-3 rounded-xl bg-vs-gold/10 border border-vs-gold/30 text-vs-gold text-xs font-medium">
          {queueLen} scan{queueLen > 1 ? "s" : ""} queued offline — tap to sync
        </Link>
      )}

      {/* Credits */}
      <div className="mb-5 px-4 py-4 rounded-2xl bg-vs-raised border border-vs-border flex items-center justify-between">
        <div>
          <p className="text-xs text-vs-muted">Scan credits</p>
          <p className="text-3xl font-bold text-vs-accent mt-0.5">{user?.credits ?? "—"}</p>
        </div>
        <Zap size={28} className="text-vs-accent opacity-40" />
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="px-4 py-3 rounded-2xl bg-vs-raised border border-vs-border">
            <p className="text-xs text-vs-muted">In stock</p>
            <p className="text-2xl font-bold mt-0.5">{stats.total_in_stock}</p>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-vs-raised border border-vs-border">
            <p className="text-xs text-vs-muted">Sold</p>
            <p className="text-2xl font-bold mt-0.5">{stats.total_sold}</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <p className="text-xs font-medium text-vs-muted mb-3 uppercase tracking-wide">Quick actions</p>
      <div className="flex flex-col gap-3">
        <Link href="/mobile/scan"
          className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-vs-accent text-white font-medium active:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Camera size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold">Scan a record</p>
            <p className="text-xs opacity-70">Camera or barcode</p>
          </div>
        </Link>
        <Link href="/mobile/catalog"
          className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-vs-raised border border-vs-border font-medium active:opacity-70 transition-opacity"
        >
          <div className="w-10 h-10 rounded-xl bg-vs-accent/10 flex items-center justify-center flex-shrink-0">
            <Disc3 size={20} className="text-vs-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold">Browse catalog</p>
            <p className="text-xs text-vs-muted">Search and edit records</p>
          </div>
        </Link>
        <Link href="/mobile/sell"
          className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-vs-raised border border-vs-border font-medium active:opacity-70 transition-opacity"
        >
          <div className="w-10 h-10 rounded-xl bg-vs-success/10 flex items-center justify-center flex-shrink-0">
            <ShoppingCart size={20} className="text-vs-success" />
          </div>
          <div>
            <p className="text-sm font-semibold">Sell a record</p>
            <p className="text-xs text-vs-muted">Quick point of sale</p>
          </div>
        </Link>
      </div>

      {/* Desktop link */}
      <p className="text-center mt-8 text-xs text-vs-muted">
        <a href="/dashboard" className="underline underline-offset-2">Switch to desktop view</a>
      </p>
    </div>
  );
}
