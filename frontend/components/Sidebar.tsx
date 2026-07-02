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
  Zap,
  Star,
  Copy,
  Check,
  HandshakeIcon,
  Package,
  Inbox,
  PackageOpen,
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
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    api.me().then(setUser).catch(() => {});
    api.getStoreSettings().then((s) => setStoreSlug(s.store_slug ?? null)).catch(() => {});
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
        <span className="text-sm font-medium text-vs-text flex-1">VinylScan</span>
        <button onClick={toggleTheme} title={dark ? "Switch to light mode" : "Switch to dark mode"} className="p-1.5 rounded-lg text-vs-muted hover:text-vs-text hover:bg-vs-raised transition-colors">
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
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
          <Link href="/catalog/consignments" className={`sidebar-link ${isActive(pathname, "/catalog/consignments") ? "active" : ""}`}>
            <span className={isActive(pathname, "/catalog/consignments") ? "text-vs-accent" : "text-vs-muted"}><HandshakeIcon size={16} /></span>
            Consignments
          </Link>
          <Link href="/catalog/accessories" className={`sidebar-link ${isActive(pathname, "/catalog/accessories") ? "active" : ""}`}>
            <span className={isActive(pathname, "/catalog/accessories") ? "text-vs-accent" : "text-vs-muted"}><Package size={16} /></span>
            Accessories
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
          <Link href="/sales/leads" className={`sidebar-link ${isActive(pathname, "/sales/leads") ? "active" : ""}`}>
            <span className={isActive(pathname, "/sales/leads") ? "text-vs-accent" : "text-vs-muted"}><Inbox size={16} /></span>
            Sell/Trade Leads
          </Link>
          <Link href="/sales/orders" className={`sidebar-link ${isActive(pathname, "/sales/orders") ? "active" : ""}`}>
            <span className={isActive(pathname, "/sales/orders") ? "text-vs-accent" : "text-vs-muted"}><PackageOpen size={16} /></span>
            Storefront Orders
          </Link>
        </div>

        <div>
          <p className="sidebar-section-label">STORE</p>
          <div className="flex items-center group/storelink">
            <Link href="/settings/store" className={`sidebar-link flex-1 ${isActive(pathname, "/settings/store") ? "active" : ""}`}>
              <span className={isActive(pathname, "/settings/store") ? "text-vs-accent" : "text-vs-muted"}><Store size={16} /></span>
              My store
            </Link>
            {storeSlug && (
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(`${window.location.origin}/store/${storeSlug}`);
                  setUrlCopied(true);
                  setTimeout(() => setUrlCopied(false), 2000);
                }}
                title="Copy store URL"
                className="opacity-0 group-hover/storelink:opacity-100 p-1 mr-1 rounded text-vs-muted hover:text-vs-accent transition-all"
              >
                {urlCopied ? <Check size={12} className="text-vs-success" /> : <Copy size={12} />}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-vs-border px-2 py-3 flex-shrink-0">
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
            <p className="text-2xs text-vs-muted mt-0.5">{user.credits} scan credit{user.credits !== 1 ? "s" : ""}</p>
          </div>
        )}

        <Link href="/subscription" className={`sidebar-link ${isActive(pathname, "/subscription") ? "active" : ""}`}>
          <span className={isActive(pathname, "/subscription") ? "text-vs-accent" : "text-vs-muted"}><Zap size={16} /></span>
          Subscription
        </Link>
        <Link href="/credits" className={`sidebar-link ${isActive(pathname, "/credits") ? "active" : ""}`}>
          <span className={isActive(pathname, "/credits") ? "text-vs-accent" : "text-vs-muted"}><Star size={16} /></span>
          Credits
        </Link>
        <Link href="/settings" className={`sidebar-link ${isActive(pathname, "/settings", true) ? "active" : ""}`}>
          <span className={isActive(pathname, "/settings", true) ? "text-vs-accent" : "text-vs-muted"}><Settings size={16} /></span>
          Settings
        </Link>
        <button
          onClick={handleLogout}
          className="sidebar-link w-full text-left text-vs-danger hover:text-vs-danger hover:bg-vs-danger/10"
        >
          <span className="text-vs-danger"><LogOut size={16} /></span>
          Log out
        </button>
      </div>
    </aside>
  );
}
