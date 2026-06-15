"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Disc3,
  Camera,
  ShoppingCart,
  ClipboardList,
  Settings,
  LogOut,
  Layers,
  Store,
  Sun,
  Moon,
  Smartphone,
  Zap,
} from "lucide-react";
import { api, clearToken, clearMeCache, getToken, isSubscribed, type User } from "@/lib/api";

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    api.me().then(setUser).catch(() => {});
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("vs-theme", isDark ? "dark" : "light");
    setDark(isDark);
  }

  async function handleLogout() {
    clearToken();
    clearMeCache();
    window.location.href = "/";
  }

  const subscribed = isSubscribed(user);

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-vs-sidebar border-r border-vs-border flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-vs-border flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-vs-raised border border-vs-border-2 flex items-center justify-center">
          <Disc3 size={15} className="text-vs-accent" />
        </div>
        <span className="text-sm font-medium text-vs-text">VinylScan</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div>
          <Link
            href="/dashboard"
            className={`sidebar-link ${isActive(pathname, "/dashboard", true) ? "active" : ""}`}
          >
            <span className={isActive(pathname, "/dashboard", true) ? "text-vs-accent" : "text-vs-muted"}>
              <LayoutDashboard size={16} />
            </span>
            Home
          </Link>
        </div>

        <div>
          <p className="sidebar-section-label">CATALOG</p>
          <Link href="/catalog" className={`sidebar-link ${isActive(pathname, "/catalog") ? "active" : ""}`}>
            <span className={isActive(pathname, "/catalog") ? "text-vs-accent" : "text-vs-muted"}><Disc3 size={16} /></span>
            Records
          </Link>
          <Link href="/scan" className={`sidebar-link ${isActive(pathname, "/scan") ? "active" : ""}`}>
            <span className={isActive(pathname, "/scan") ? "text-vs-accent" : "text-vs-muted"}><Camera size={16} /></span>
            Scan &amp; add
          </Link>
          <Link href="/catalog/lots" className={`sidebar-link ${isActive(pathname, "/catalog/lots") ? "active" : ""}`}>
            <span className={isActive(pathname, "/catalog/lots") ? "text-vs-accent" : "text-vs-muted"}><Layers size={16} /></span>
            Lots
          </Link>
        </div>

        <div>
          <p className="sidebar-section-label">SALES</p>
          <Link href="/sales" className={`sidebar-link ${isActive(pathname, "/sales", true) ? "active" : ""}`}>
            <span className={isActive(pathname, "/sales", true) ? "text-vs-accent" : "text-vs-muted"}><ShoppingCart size={16} /></span>
            Point of sale
          </Link>
          <Link href="/sales/history" className={`sidebar-link ${isActive(pathname, "/sales/history") ? "active" : ""}`}>
            <span className={isActive(pathname, "/sales/history") ? "text-vs-accent" : "text-vs-muted"}><ClipboardList size={16} /></span>
            Sales history
          </Link>
        </div>

        <div>
          <p className="sidebar-section-label">STORE</p>
          <Link href="/settings/store" className={`sidebar-link ${isActive(pathname, "/settings/store") ? "active" : ""}`}>
            <span className={isActive(pathname, "/settings/store") ? "text-vs-accent" : "text-vs-muted"}><Store size={16} /></span>
            My store
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-vs-border px-2 py-3 flex-shrink-0">
        {/* Upgrade nudge for free users */}
        {user && !subscribed && (
          <Link
            href="/subscription"
            className="flex items-center gap-2 mx-1 mb-2 px-3 py-2 rounded-lg bg-vs-accent/10 border border-vs-accent/20 hover:bg-vs-accent/15 transition-colors"
          >
            <Zap size={13} className="text-vs-accent flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-vs-accent">Upgrade to Pro</p>
              <p className="text-2xs text-vs-muted">14-day free trial</p>
            </div>
          </Link>
        )}

        {user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-vs-text truncate">{user.display_name || user.discogs_username || user.email}</p>
            <p className="text-2xs text-vs-muted">Record store</p>
          </div>
        )}
        <Link href="/subscription" className={`sidebar-link ${isActive(pathname, "/subscription") ? "active" : ""}`}>
          <span className={isActive(pathname, "/subscription") ? "text-vs-accent" : "text-vs-muted"}><Zap size={16} /></span>
          Subscription
        </Link>
        <Link href="/settings" className={`sidebar-link ${isActive(pathname, "/settings", true) ? "active" : ""}`}>
          <span className={isActive(pathname, "/settings", true) ? "text-vs-accent" : "text-vs-muted"}><Settings size={16} /></span>
          Settings
        </Link>
        <button
          onClick={toggleTheme}
          className="sidebar-link w-full text-left"
        >
          <span className="text-vs-muted">{dark ? <Sun size={16} /> : <Moon size={16} />}</span>
          {dark ? "Light mode" : "Dark mode"}
        </button>
        <Link href="/?mobile=1" className="sidebar-link text-vs-muted">
          <Smartphone size={16} />
          Mobile view
        </Link>
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-left text-vs-danger hover:text-vs-danger hover:bg-vs-danger/10"
        >
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </aside>
  );
}
