"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Plus } from "lucide-react";
import { subscribeCreditBalance } from "@/lib/api";

interface Props {
  initial: number;
}

export function CreditBalance({ initial }: Props) {
  const [credits, setCredits] = useState(initial);

  useEffect(() => {
    const unsub = subscribeCreditBalance((n) => setCredits(n));
    return unsub;
  }, []);

  return (
    <div className="card p-6 flex flex-col gap-2">
      <p className="text-vinyl-muted text-sm uppercase tracking-wider">Credits Remaining</p>
      <div className="flex items-end gap-3">
        <span className="text-5xl font-bold text-vinyl-gold">{credits}</span>
        <CreditCard size={28} className="text-vinyl-gold mb-1.5" />
      </div>
      <Link
        href="/credits"
        className="mt-2 flex items-center gap-1.5 text-vinyl-accent hover:text-red-400 text-sm font-medium transition-colors"
      >
        <Plus size={14} />
        Buy more credits
      </Link>
    </div>
  );
}
