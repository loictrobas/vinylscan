import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { CreditBalance } from "@/components/CreditBalance";
import { CreditPacks } from "@/components/CreditPacks";
import type { CreditPack, DashboardStats } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const { success } = await searchParams;

  const meRes = await fetch(`${API_URL}/auth/me`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!meRes.ok) redirect("/");

  const [statsRes, packsRes] = await Promise.all([
    fetch(`${API_URL}/dashboard/stats`, { headers: { Cookie: cookieHeader }, cache: "no-store" }),
    fetch(`${API_URL}/billing/packs`, { headers: { Cookie: cookieHeader }, cache: "no-store" }),
  ]);

  const stats: DashboardStats | null = statsRes.ok ? await statsRes.json() : null;
  const packs: CreditPack[] = packsRes.ok ? await packsRes.json() : [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 flex flex-col gap-10">
      <h1 className="text-3xl font-bold">Credits</h1>

      {success && (
        <div className="bg-green-500/20 border border-green-500/40 rounded-xl p-4 text-green-400 font-medium">
          Payment successful! Your credits have been added.
        </div>
      )}

      {stats && (
        <div className="max-w-xs">
          <CreditBalance initial={stats.credit_balance} />
        </div>
      )}

      {DEV_MODE ? (
        <div className="card p-5 border-vinyl-gold/30 bg-vinyl-gold/5">
          <p className="text-vinyl-gold font-semibold text-sm">Dev mode — unlimited credits active. Stripe disabled.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Buy Credits</h2>
            <p className="text-vinyl-muted text-sm">One-time purchase. No subscriptions. Credits never expire.</p>
          </div>
          <CreditPacks packs={packs} />
        </div>
      )}

      {stats && stats.recent_transactions.length > 0 && (
        <div className="card p-6 flex flex-col gap-4">
          <h2 className="text-lg font-bold">Transaction History</h2>
          <div className="flex flex-col gap-2">
            {stats.recent_transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-vinyl-border last:border-0">
                <div>
                  <p className="text-sm capitalize">{t.reason.replace("_", " ")}</p>
                  <p className="text-xs text-vinyl-muted">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <span className={`text-sm font-semibold ${t.amount > 0 ? "text-green-400" : "text-vinyl-accent"}`}>
                  {t.amount > 0 ? "+" : ""}{t.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
