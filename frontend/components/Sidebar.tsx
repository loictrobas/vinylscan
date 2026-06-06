"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Disc3,
  Camera,
  Archive,
  Package,
  ShoppingCart,
  History,
  Users,
  ClipboardList,
  Settings,
  LogOut,
  Layers,
} from "lucide-react";
import { api, clearToken, clearMeCache, getToken, type User } from "@/lib/api";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    label: "",
    items: [
      { href: "/dashboard", label: "Home", icon: <LayoutDashboard size={16} />, exact: true },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/catalog",      label: "Records",   icon: <Disc3 size={16} /> },
      { href: "/scan",         label: "Scan & add", icon: <Camera size={16} /> },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory",        label: "Stock",    icon: <Archive size={16} /> },
      { href: "/catalog/lots",     label: "Lots",     icon: <Layers size={16} /> },
      { href: "/inventory/movements", label: "Movements", icon: <History size={16} /> },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/sales",              label: "POS",          icon: <ShoppingCart size={16} /> },
      { href: "/sales/history",      label: "Sales history", icon: <ClipboardList size={16} /> },
      { href: "/sales/consignments", label: "Consignments", icon: <Package size={16} /> },
    ],
  },
  {
    label: "Purchases",
    items: [
      { href: "/purchases/suppliers", label: "Suppliers",       icon: <Users size={16} /> },
      { href: "/purchases",           label: "Purchase orders", icon: <ClipboardList size={16} /> },
    ],
  },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    api.me().then(setUser).catch(() => {});
  }, []);

  async function handleLogout() {
    clearToken();
    clearMeCache();
    window.location.href = "/";
  }

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
        {NAV.map((section) => (
          <div key={section.label}>
            {section.label && (
              <p className="sidebar-section-label">{section.label}</p>
            )}
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive(pathname, item.href, item.exact) ? "active" : ""}`}
              >
                <span className={isActive(pathname, item.href, item.exact) ? "text-vs-accent" : "text-vs-muted"}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* User / settings footer */}
      <div className="border-t border-vs-border px-2 py-3 flex-shrink-0">
        {user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-vs-text truncate">{user.discogs_username}</p>
            <p className="text-2xs text-vs-muted">Record store</p>
          </div>
        )}
        <Link href="/settings" className={`sidebar-link ${isActive(pathname, "/settings") ? "active" : ""}`}>
          <span className="text-vs-muted"><Settings size={16} /></span>
          Settings
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
