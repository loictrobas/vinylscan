"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanInterface } from "@/components/ScanInterface";
import { api, getToken, type User } from "@/lib/api";

export default function ScanPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/"); return; }
    api.me().then(setUser).catch(() => {});
  }, [router]);

  const isAdmin = user?.is_admin ?? false;

  return (
    <div>
      <div className="sticky top-0 z-20 bg-vs-bg px-6 pt-6 pb-4 border-b border-vs-border/50 mb-5">
        <h1 className="text-xl font-medium">Scan records</h1>
        <p className="text-sm text-vs-text-2 mt-0.5">Upload photos to identify and add to your catalog</p>
      </div>
      <div className="px-6 pb-10">
        <ScanInterface showDebug={isAdmin} />
      </div>
    </div>
  );
}
