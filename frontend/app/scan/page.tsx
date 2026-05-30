"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ScanInterface } from "@/components/ScanInterface";
import { getToken } from "@/lib/api";

export default function ScanPage() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) router.replace("/");
  }, [router]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-8 text-center">Scan a Record</h1>
      <ScanInterface />
    </div>
  );
}
