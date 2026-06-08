import Link from "next/link";
import { Disc3 } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-vs-raised border border-vs-border flex items-center justify-center mx-auto mb-4">
          <Disc3 size={26} className="text-vs-muted" />
        </div>
        <h1 className="text-lg font-semibold mb-1">Page not found</h1>
        <p className="text-sm text-vs-muted mb-6">This page doesn't exist or was moved.</p>
        <Link href="/dashboard" className="btn-primary">Go to dashboard</Link>
      </div>
    </div>
  );
}
