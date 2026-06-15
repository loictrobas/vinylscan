"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Disc3, Camera, Store, Zap, ArrowRight, CheckCircle2 } from "lucide-react";
import { api, getToken, isStore, isCollector } from "@/lib/api";

const STEPS = [
  {
    key: "welcome",
    title: "Welcome to VinylScan",
    sub: "You're all set. Here's how to get started in 3 steps.",
  },
  {
    key: "scan",
    title: "Scan your first record",
    sub: "Point your camera at any sleeve — AI identifies it instantly.",
    cta: "Scan now",
    href: "/scan",
  },
  {
    key: "store",
    title: "Set up your store",
    sub: "Add a name, URL slug, and go live for customers to browse.",
    cta: "Set up store",
    href: "/settings/store",
    storeOnly: true,
  },
  {
    key: "upgrade",
    title: "Start your free trial",
    sub: "14 days of Pro — unlimited scans, POS, storefront, and more.",
    cta: "Start free trial",
    href: "/subscription",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ display_name: string | null; account_type: string } | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.me().then(setUser).catch(() => null);
  }, [router]);

  const storeMode = isStore(user as Parameters<typeof isStore>[0]);
  const steps = STEPS.filter(s => !s.storeOnly || storeMode);
  const allDone = steps.every(s => done.has(s.key));

  function mark(key: string) {
    setDone(prev => new Set([...prev, key]));
  }

  return (
    <div className="min-h-screen bg-vs-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-vs-raised border border-vs-border-2 flex items-center justify-center">
            <Disc3 size={18} className="text-vs-accent" />
          </div>
          <span className="text-lg font-semibold text-vs-text">VinylScan</span>
        </div>

        <h1 className="text-2xl font-bold text-vs-text text-center mb-1">
          Welcome{user?.display_name ? `, ${user.display_name}` : ""}!
        </h1>
        <p className="text-vs-text-2 text-center text-sm mb-8">
          {storeMode ? "Your record store is ready." : "Your collection is ready."} Let's get you set up.
        </p>

        {/* Steps */}
        <div className="flex flex-col gap-3 mb-6">
          {steps.map((step, i) => {
            const isDone = done.has(step.key);
            return (
              <div
                key={step.key}
                className={`card p-4 transition-colors ${isDone ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${isDone ? "bg-vs-success/20 text-vs-success" : "bg-vs-accent/15 text-vs-accent"}`}>
                    {isDone ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-vs-text">{step.title}</p>
                    <p className="text-xs text-vs-muted mt-0.5">{step.sub}</p>
                  </div>
                  {step.href && !isDone && (
                    <Link
                      href={step.href}
                      onClick={() => mark(step.key)}
                      className="flex items-center gap-1 text-xs text-vs-accent hover:underline flex-shrink-0 mt-0.5"
                    >
                      {step.cta} <ArrowRight size={11} />
                    </Link>
                  )}
                  {isDone && (
                    <span className="text-xs text-vs-success flex-shrink-0 mt-0.5">Done</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Skip / Go to dashboard */}
        <div className="flex flex-col items-center gap-3">
          <Link href="/dashboard" className="btn-primary w-full flex items-center justify-center gap-2">
            {allDone ? <><CheckCircle2 size={14} /> Go to dashboard</> : <><Zap size={14} /> Go to dashboard</>}
          </Link>
          <p className="text-xs text-vs-muted">You can always find these in the sidebar settings</p>
        </div>
      </div>
    </div>
  );
}
