"use client";

import Link from "next/link";
import { X, Layers, Heart, History, Settings, Monitor } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  pureCollector: boolean;
  isStore: boolean;
  collectorMode: boolean;
}

export default function MobileMoreDrawer({ open, onClose, pureCollector, isStore, collectorMode }: Props) {
  if (!open) return null;

  const items = [
    ...(pureCollector
      ? [
          { href: "/catalog/lots", icon: Layers,  label: "Hauls",    sub: "Track acquisitions" },
          { href: "/wantlist",     icon: Heart,   label: "Wantlist", sub: "Records to find" },
        ]
      : [
          { href: "/catalog/lots",  icon: Layers,   label: "Lots",          sub: "Track purchases" },
          { href: "/sales/history", icon: History,  label: "Sales history", sub: "Past transactions" },
          ...(collectorMode ? [{ href: "/wantlist", icon: Heart, label: "Wantlist", sub: "Records to find" }] : []),
        ]
    ),
    { href: "/mobile/settings", icon: Settings, label: "Settings",     sub: "Account & preferences" },
    { href: "/dashboard?desktop=1", icon: Monitor,  label: "Desktop view", sub: "Full web app" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-vs-card rounded-t-3xl border-t border-vs-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-vs-border" />
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-sm font-semibold">More</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-vs-muted hover:text-vs-text">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 pb-4 flex flex-col gap-1">
          {items.map(({ href, icon: Icon, label, sub }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-vs-raised border border-vs-border active:opacity-70 transition-opacity"
            >
              <div className="w-9 h-9 rounded-xl bg-vs-accent/10 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-vs-accent" />
              </div>
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-vs-muted">{sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
