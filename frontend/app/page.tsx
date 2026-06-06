"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";
import { Disc3 } from "lucide-react";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-vs-bg">
      <Disc3 size={32} className="animate-spin text-vs-muted" style={{ animationDuration: "2s" }} />
    </div>
  );
}
