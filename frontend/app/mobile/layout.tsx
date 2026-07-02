"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Disc3, ShoppingCart, MoreHorizontal } from "lucide-react";
import MobileMoreDrawer from "@/components/MobileMoreDrawer";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

const TABS = [
  { href: "/mobile/home" as string | null,    label: "Home",    icon: Home },
  { href: "/mobile/catalog" as string | null, label: "Catalog", icon: Disc3 },
  { href: "/mobile/sell" as string | null,    label: "Sell",    icon: ShoppingCart },
  { href: null,                                label: "More",    icon: MoreHorizontal },
];

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = TABS;

  return (
    <div className="flex flex-col min-h-screen bg-vs-bg text-vs-text">
      <main className="flex-1 overflow-y-auto pb-[calc(64px+env(safe-area-inset-bottom))]">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-vs-card border-t border-vs-border flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const isMore = href === null;
          const active = !isMore && !!href && (pathname === href || pathname.startsWith(href + "/"));

          const iconEl = (
            <div className="flex items-center justify-center">
              <Icon size={20} />
            </div>
          );

          if (isMore) {
            return (
              <button
                key="more"
                onClick={() => setMoreOpen(true)}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-vs-muted hover:text-vs-text transition-colors"
              >
                {iconEl}
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          }

          return (
            <Link
              key={href}
              href={href!}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
                active ? "text-vs-accent" : "text-vs-muted hover:text-vs-text"
              }`}
            >
              {iconEl}
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      <MobileMoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} />

      <PWAInstallPrompt />
    </div>
  );
}
