"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, Disc3, ShoppingCart } from "lucide-react";

const TABS = [
  { href: "/mobile/home",    label: "Home",    icon: Home },
  { href: "/mobile/scan",    label: "Scan",    icon: Camera },
  { href: "/mobile/catalog", label: "Catalog", icon: Disc3 },
  { href: "/mobile/sell",    label: "Sell",    icon: ShoppingCart },
];

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col min-h-screen bg-vs-bg text-vs-text">
      <main className="flex-1 overflow-y-auto pb-[calc(64px+env(safe-area-inset-bottom))]">
        {children}
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-vs-card border-t border-vs-border flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          const isScan = href === "/mobile/scan";
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
                isScan
                  ? active
                    ? "text-vs-accent"
                    : "text-vs-muted hover:text-vs-text"
                  : active
                  ? "text-vs-accent"
                  : "text-vs-muted hover:text-vs-text"
              }`}
            >
              <div className={`flex items-center justify-center ${isScan ? "w-12 h-12 rounded-full bg-vs-accent -mt-5 shadow-lg" : ""}`}>
                <Icon size={isScan ? 22 : 20} className={isScan ? "text-white" : ""} />
              </div>
              {!isScan && <span className="text-[10px] font-medium">{label}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
