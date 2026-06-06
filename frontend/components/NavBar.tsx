"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Disc3, CreditCard } from "lucide-react";
import { api, subscribeCreditBalance } from "@/lib/api";

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export function NavBar() {
  const [user, setUser] = useState<{ discogs_username: string; credits: number } | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    api.me().then((u) => {
      setUser(u);
      setCredits(u.credits);
    }).catch(() => setUser(null));

    const unsub = subscribeCreditBalance((n) => setCredits(n));
    return unsub;
  }, []);

  return (
    <nav className="border-b border-vinyl-border bg-vinyl-dark sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-vinyl-text font-bold text-xl">
          <Disc3 className="text-vinyl-accent" size={28} />
          VinylScan
        </Link>

        {user ? (
          <div className="flex items-center gap-4">
            <Link
              href="/credits"
              className="flex items-center gap-1.5 bg-vinyl-card border border-vinyl-border px-3 py-1.5 rounded-lg text-sm hover:border-vinyl-accent transition-colors"
            >
              <CreditCard size={14} className="text-vinyl-gold" />
              <span className="text-vinyl-gold font-semibold">{DEV_MODE ? "∞" : (credits ?? user.credits)}</span>
              <span className="text-vinyl-muted">credits</span>
            </Link>
            <Link href="/catalog" className="text-sm text-vinyl-muted hover:text-vinyl-text transition-colors">
              Catalog
            </Link>
            <Link href="/dashboard" className="text-sm text-vinyl-muted hover:text-vinyl-text transition-colors">
              Dashboard
            </Link>
            <Link href="/history" className="text-sm text-vinyl-muted hover:text-vinyl-text transition-colors">
              History
            </Link>
            <Link href="/settings" className="text-sm text-vinyl-muted hover:text-vinyl-text transition-colors">
              {user.discogs_username}
            </Link>
          </div>
        ) : (
          <a href={api.loginUrl()} className="btn-primary text-sm py-2 px-4">
            Connect with Discogs
          </a>
        )}
      </div>
    </nav>
  );
}
