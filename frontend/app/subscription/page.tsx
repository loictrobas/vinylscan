"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Zap, CheckCircle2, Clock, CreditCard, ArrowUpRight,
  Disc3, Star, AlertTriangle, XCircle,
} from "lucide-react";
import { api, getToken, isSubscribed, type User } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    free:     { label: "Free",      className: "bg-vs-raised text-vs-muted",            icon: <Disc3 size={12} /> },
    trialing: { label: "Trial",     className: "bg-vs-accent/15 text-vs-accent",        icon: <Clock size={12} /> },
    active:   { label: "Pro",       className: "bg-vs-success/15 text-vs-success",      icon: <Star size={12} /> },
    past_due: { label: "Past due",  className: "bg-vs-danger/15 text-vs-danger",        icon: <AlertTriangle size={12} /> },
    canceled: { label: "Canceled",  className: "bg-vs-raised text-vs-muted",            icon: <XCircle size={12} /> },
  };
  const { label, className, icon } = map[status] ?? map.free;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${className}`}>
      {icon}{label}
    </span>
  );
}

function SubscriptionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User & { scans_this_month?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    if (searchParams.get("subscribed") === "1") router.replace("/subscription");
    api.me().then(setUser).finally(() => setLoading(false));
  }, [router, searchParams]);

  async function handleUpgrade() {
    setUpgrading(true);
    try { const { url } = await api.checkoutSubscribe(); window.location.href = url; }
    catch { setUpgrading(false); }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try { const { url } = await api.billingPortal(); window.location.href = url; }
    catch { setPortalLoading(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Disc3 size={28} className="animate-spin text-vs-muted" />
    </div>
  );

  if (!user) return null;

  const subscribed = isSubscribed(user);
  const scansUsed = (user as any).scans_this_month ?? 0;
  const creditsLeft = user.credits;
  const totalCredits = creditsLeft + scansUsed;
  const usagePct = totalCredits > 0 ? Math.round((scansUsed / totalCredits) * 100) : 0;

  const trialDays = user.trial_ends_at ? daysUntil(user.trial_ends_at) : null;
  const periodEnd = user.subscription_current_period_end
    ? new Date(user.subscription_current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="px-6 py-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-medium text-vs-text">Subscription</h1>
        <p className="text-sm text-vs-text-2 mt-0.5">Manage your plan and credits</p>
      </div>

      {/* Plan card */}
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-1">Current plan</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-medium text-vs-text">
                {user.subscription_status === "free" ? "Free" : "VinylScan Pro"}
              </p>
              <StatusBadge status={user.subscription_status} />
            </div>
          </div>
          {subscribed && periodEnd && (
            <p className="text-xs text-vs-muted text-right">
              {user.subscription_status === "trialing" ? "Trial ends" : "Renews"}<br />
              <span className="text-vs-text">{periodEnd}</span>
            </p>
          )}
        </div>

        {/* Trial countdown */}
        {user.subscription_status === "trialing" && trialDays !== null && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-vs-accent/8 border border-vs-accent/20 flex items-center gap-2">
            <Clock size={14} className="text-vs-accent flex-shrink-0" />
            <p className="text-sm text-vs-text">
              <span className="font-medium">{trialDays} days</span> left in trial
              {trialDays <= 3 && <span className="text-vs-danger ml-1">— upgrade to keep access</span>}
            </p>
          </div>
        )}

        {/* Past due warning */}
        {user.subscription_status === "past_due" && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-vs-danger/8 border border-vs-danger/20 flex items-center gap-2">
            <AlertTriangle size={14} className="text-vs-danger flex-shrink-0" />
            <p className="text-sm text-vs-danger">Payment failed — update your billing to keep access</p>
          </div>
        )}

        {/* Plan features */}
        <div className="border-t border-vs-border pt-4">
          {user.subscription_status === "free" ? (
            <div className="space-y-2">
              {[
                "5 free scan credits/month",
                "Catalog up to 50 records",
                "No POS / sales features",
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-vs-muted">
                  <div className="w-4 h-4 rounded-full border border-vs-border flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {[
                "Unlimited scan credits",
                "Unlimited catalog",
                "Full POS + sales history",
                "Lots / purchase tracking",
                "Public storefront",
                "Priority support",
              ].map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-vs-text">
                  <CheckCircle2 size={14} className="text-vs-success flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-4 pt-4 border-t border-vs-border flex gap-2">
          {!subscribed ? (
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="btn-primary flex items-center gap-2 disabled:opacity-60"
            >
              <Zap size={14} />
              {upgrading ? "Loading…" : "Start 14-day free trial · $29/mo"}
            </button>
          ) : (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="btn-secondary flex items-center gap-2 disabled:opacity-60"
            >
              <CreditCard size={14} />
              {portalLoading ? "Loading…" : "Manage billing"}
            </button>
          )}
        </div>
      </div>

      {/* Credits card */}
      <div className="card p-5 mb-4">
        <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-4">Scan credits</p>
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-2xl font-medium text-vs-text">{creditsLeft}</p>
            <p className="text-xs text-vs-muted mt-0.5">credits remaining</p>
          </div>
          <p className="text-sm text-vs-text-2">{scansUsed} used this month</p>
        </div>
        {/* Usage bar */}
        <div className="h-1.5 bg-vs-raised rounded-full overflow-hidden mt-3">
          <div
            className="h-full bg-vs-accent rounded-full transition-all"
            style={{ width: `${Math.min(usagePct, 100)}%` }}
          />
        </div>

        <div className="mt-4 pt-4 border-t border-vs-border">
          <p className="text-xs text-vs-muted mb-3">
            Each scan uses 1 credit. Pro plan includes unlimited credits.
            {!subscribed && " Buy a one-time top-up below."}
          </p>
          {!subscribed && (
            <a href="/credits" className="btn-secondary text-xs flex items-center gap-2 w-fit">
              <ArrowUpRight size={13} />
              Buy credit pack
            </a>
          )}
        </div>
      </div>

      {/* Pricing comparison (only for free users) */}
      {!subscribed && (
        <div className="card p-5">
          <p className="text-xs text-vs-muted uppercase tracking-widest font-medium mb-4">Plans</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Free */}
            <div className="rounded-xl border border-vs-border p-4">
              <p className="font-medium text-vs-text mb-0.5">Free</p>
              <p className="text-2xl font-medium text-vs-text mb-3">$0</p>
              <div className="space-y-1.5 text-xs text-vs-muted">
                <p>5 scans / month</p>
                <p>50 record limit</p>
                <p>Basic catalog</p>
              </div>
            </div>
            {/* Pro */}
            <div className="rounded-xl border border-vs-accent/40 bg-vs-accent/5 p-4">
              <p className="font-medium text-vs-accent mb-0.5">Pro</p>
              <p className="text-2xl font-medium text-vs-text mb-3">$29<span className="text-sm text-vs-muted">/mo</span></p>
              <div className="space-y-1.5 text-xs text-vs-text-2">
                <p>Unlimited scans</p>
                <p>Unlimited catalog</p>
                <p>POS + sales</p>
                <p>Public storefront</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            className="btn-primary w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Zap size={14} />
            {upgrading ? "Loading…" : "Start free trial"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense>
      <SubscriptionPageInner />
    </Suspense>
  );
}
