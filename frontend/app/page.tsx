"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/api";
import {
  Disc3, Camera, ShoppingCart, BarChart3, Zap,
  CheckCircle2, ArrowRight, Store, Layers,
} from "lucide-react";

export default function RootPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-vs-bg">
      <Disc3 size={28} className="animate-spin text-vs-muted" style={{ animationDuration: "2s" }} />
    </div>
  );

  return (
    <div className="min-h-screen bg-vs-bg text-vs-text">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-vs-border bg-vs-bg/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-vs-raised border border-vs-border-2 flex items-center justify-center">
              <Disc3 size={15} className="text-vs-accent" />
            </div>
            <span className="text-sm font-semibold text-vs-text">VinylScan</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-vs-muted hover:text-vs-text transition-colors">
              Sign in
            </Link>
            <Link href="/login" className="btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5">
              Get started <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-vs-accent/10 border border-vs-accent/20 text-xs text-vs-accent font-medium mb-6">
          <Zap size={12} />
          Built for independent record stores
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-vs-text leading-tight mb-5">
          Run your record store<br />
          <span className="text-vs-accent">smarter, not harder</span>
        </h1>
        <p className="text-lg text-vs-text-2 max-w-xl mx-auto mb-8">
          Scan vinyl with your phone camera, catalog your inventory, and sell — all in one place. No spreadsheets.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/login" className="btn-primary flex items-center justify-center gap-2 px-6 py-3 text-base">
            <Zap size={16} />
            Start free trial
          </Link>
          <a
            href="#features"
            className="btn-secondary flex items-center justify-center gap-2 px-6 py-3 text-base"
          >
            See how it works
          </a>
        </div>
        <p className="text-xs text-vs-muted mt-4">14-day free trial · No credit card required</p>
      </section>

      {/* Feature grid */}
      <section id="features" className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: <Camera size={20} className="text-vs-accent" />,
              title: "AI-powered scanning",
              body: "Point your camera at any record sleeve. VinylScan identifies artist, title, year, and label instantly using computer vision + Discogs.",
            },
            {
              icon: <ShoppingCart size={20} className="text-vs-accent" />,
              title: "Point of sale",
              body: "Search your catalog, ring up sales, and track revenue — all without a clunky POS system. Works on desktop and mobile.",
            },
            {
              icon: <BarChart3 size={20} className="text-vs-accent" />,
              title: "Revenue dashboard",
              body: "Today, this week, this month — see your numbers at a glance. Track margins, inventory value, and sales history.",
            },
            {
              icon: <Disc3 size={20} className="text-vs-accent" />,
              title: "Smart catalog",
              body: "Your full inventory in one place. Filter by condition, format, genre, or price. Bulk price with Discogs market data.",
            },
            {
              icon: <Layers size={20} className="text-vs-accent" />,
              title: "Purchase tracking",
              body: "Log record hauls and lots. Track what you paid, when you bought, and which records came from which purchase.",
            },
            {
              icon: <Store size={20} className="text-vs-accent" />,
              title: "Public storefront",
              body: "Share a live link to your in-stock inventory. Customers browse, build a cart, and send an order via WhatsApp or email.",
            },
          ].map(({ icon, title, body }) => (
            <div key={title} className="card p-5">
              <div className="w-9 h-9 rounded-lg bg-vs-accent/10 flex items-center justify-center mb-3">
                {icon}
              </div>
              <h3 className="text-sm font-semibold text-vs-text mb-1.5">{title}</h3>
              <p className="text-sm text-vs-text-2 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold text-center mb-2">Simple pricing</h2>
        <p className="text-vs-text-2 text-center mb-8">Start free, upgrade when you&apos;re ready</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          <div className="card p-6">
            <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-2">Free</p>
            <p className="text-3xl font-bold text-vs-text mb-4">$0</p>
            <div className="space-y-2 mb-6">
              {["5 scan credits/month", "Up to 50 records", "Basic catalog"].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-vs-text-2">
                  <CheckCircle2 size={14} className="text-vs-muted flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
            <Link href="/login" className="btn-secondary w-full flex items-center justify-center gap-2">
              Get started free
            </Link>
          </div>
          <div className="card p-6 border-vs-accent/40 bg-vs-accent/5 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-3 py-1 rounded-full bg-vs-accent text-white text-xs font-medium">Most popular</span>
            </div>
            <p className="text-xs text-vs-accent uppercase tracking-widest font-medium mb-2">Pro</p>
            <div className="flex items-end gap-1 mb-4">
              <p className="text-3xl font-bold text-vs-text">$29</p>
              <p className="text-vs-muted mb-1">/month</p>
            </div>
            <div className="space-y-2 mb-6">
              {[
                "Unlimited scan credits",
                "Unlimited catalog",
                "Full POS + sales history",
                "Purchase lot tracking",
                "Public storefront",
                "Priority support",
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-vs-text">
                  <CheckCircle2 size={14} className="text-vs-success flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
            <Link href="/login" className="btn-primary w-full flex items-center justify-center gap-2">
              <Zap size={14} />
              Start 14-day free trial
            </Link>
            <p className="text-xs text-vs-muted text-center mt-2">No credit card required</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-vs-border">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold mb-3">Ready to scan your first record?</h2>
          <p className="text-vs-text-2 mb-6">Join independent record stores already using VinylScan.</p>
          <Link href="/login" className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-base">
            <Zap size={16} />
            Get started — it&apos;s free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-vs-border">
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-vs-muted">
          <div className="flex items-center gap-2">
            <Disc3 size={13} className="text-vs-accent" />
            VinylScan — Record store management
          </div>
          <Link href="/login" className="hover:text-vs-text">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
