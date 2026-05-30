"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, Zap } from "lucide-react";
import { api, type CreditPack } from "@/lib/api";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

function CheckoutForm({ pack, onCancel }: { pack: CreditPack; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/credits?success=1`,
      },
    });
    if (result.error) {
      setError(result.error.message || "Payment failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="bg-vinyl-border/40 rounded-lg p-3 text-sm">
        <span className="text-vinyl-muted">Purchasing: </span>
        <span className="font-semibold text-vinyl-gold">{pack.credits} credits</span>
        <span className="text-vinyl-muted"> for </span>
        <span className="font-semibold">{pack.price_display}</span>
      </div>
      <PaymentElement />
      {error && <p className="text-vinyl-accent text-sm">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          Pay {pack.price_display}
        </button>
      </div>
    </form>
  );
}

interface Props {
  packs: CreditPack[];
}

export function CreditPacks({ packs }: Props) {
  const [selected, setSelected] = useState<CreditPack | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  async function startPurchase(pack: CreditPack) {
    setLoadingPack(pack.id);
    try {
      const res = await api.createPayment(pack.id);
      setClientSecret(res.client_secret);
      setSelected(pack);
    } catch {
      alert("Failed to start payment. Please try again.");
    } finally {
      setLoadingPack(null);
    }
  }

  if (selected && clientSecret) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-bold mb-4">Complete Purchase</h3>
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night" } }}>
          <CheckoutForm pack={selected} onCancel={() => { setSelected(null); setClientSecret(null); }} />
        </Elements>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {packs.map((pack) => (
        <div key={pack.id} className="card p-6 flex flex-col gap-4 hover:border-vinyl-accent transition-colors">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-vinyl-gold" />
            <h3 className="font-bold">{pack.name}</h3>
          </div>
          <div>
            <p className="text-3xl font-bold text-vinyl-gold">{pack.credits}</p>
            <p className="text-vinyl-muted text-sm">credits</p>
          </div>
          <p className="text-2xl font-bold">{pack.price_display}</p>
          <button
            onClick={() => startPurchase(pack)}
            disabled={loadingPack === pack.id}
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loadingPack === pack.id ? <Loader2 size={16} className="animate-spin" /> : null}
            Buy Now
          </button>
        </div>
      ))}
    </div>
  );
}
