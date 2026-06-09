"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, Disc3, ShoppingCart, MoreHorizontal } from "lucide-react";
import { api, isStore as checkIsStore, isCollector as checkIsCollector, type User } from "@/lib/api";
import MobileMoreDrawer from "@/components/MobileMoreDrawer";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    api.me().then(setUser).catch(() => {});
  }, []);

  const storeMode = checkIsStore(user);
  const collectorMode = checkIsCollector(user);
  const pureCollector = collectorMode && !storeMode;

  const tabs = pureCollector
    ? [
        { href: "/mobile/home" as string | null,    label: "Home",       icon: Home },
        { href: "/mobile/scan" as string | null,    label: "Scan",       icon: Camera },
        { href: "/mobile/catalog" as string | null, label: "Collection", icon: Disc3 },
        { href: null,                               label: "More",       icon: MoreHorizontal },
      ]
    : [
        { href: "/mobile/home" as string | null,    label: "Home",    icon: Home },
        { href: "/mobile/scan" as string | null,    label: "Scan",    icon: Camera },
        { href: "/mobile/catalog" as string | null, label: "Catalog", icon: Disc3 },
        { href: "/mobile/sell" as string | null,    label: "Sell",    icon: ShoppingCart },
      ];

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
          const isScan = label === "Scan";
          const isMore = href === null;
          const active = !isMore && !!href && (pathname === href || pathname.startsWith(href + "/"));

          const iconEl = (
            <div className={`flex items-center justify-center ${isScan ? "w-12 h-12 rounded-full bg-vs-accent -mt-5 shadow-lg" : ""}`}>
              <Icon size={isScan ? 22 : 20} className={isScan ? "text-white" : ""} />
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
              {!isScan && <span className="text-[10px] font-medium">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <MobileMoreDrawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        pureCollector={pureCollector}
        isStore={storeMode}
        collectorMode={collectorMode}
      />

      <PWAInstallPrompt />
    </div>
  );
}
