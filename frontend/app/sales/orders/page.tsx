"use client";

import { useEffect, useState } from "react";
import { Loader2, PackageOpen, ChevronDown, ChevronUp } from "lucide-react";
import { api, type Order } from "@/lib/api";

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.listOrders().then(setOrders).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-vs-text">Storefront Orders</h1>
        <p className="text-xs text-vs-muted mt-0.5">Orders placed through your storefront's checkout. Pickup only — customer pays in person.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-vs-muted" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <PackageOpen size={28} className="text-vs-muted/40 mx-auto mb-2" />
          <p className="text-vs-muted text-sm">No orders yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => {
            const expanded = expandedId === order.id;
            return (
              <div key={order.id} className="bg-vs-card border border-vs-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : order.id)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xs font-mono px-2 py-0.5 rounded-full bg-vs-accent/10 text-vs-accent flex-shrink-0">{order.order_ref}</span>
                    <p className="text-sm font-medium text-vs-text truncate">{order.customer_name}</p>
                    <p className="text-xs text-vs-muted truncate hidden sm:inline">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-vs-text">{fmt(order.total)}</span>
                    <span className="text-xs text-vs-muted">{fmtDate(order.created_at)}</span>
                    {expanded ? <ChevronUp size={14} className="text-vs-muted" /> : <ChevronDown size={14} className="text-vs-muted" />}
                  </div>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 border-t border-vs-border pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><p className="text-vs-muted mb-0.5">Contact</p><p className="text-vs-text">{order.customer_contact}</p></div>
                      {order.note && <div><p className="text-vs-muted mb-0.5">Note</p><p className="text-vs-text">{order.note}</p></div>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-vs-text">{item.name} {item.qty > 1 ? `×${item.qty}` : ""}</span>
                          {item.price != null && <span className="text-vs-muted font-mono">{fmt(item.price * item.qty)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
