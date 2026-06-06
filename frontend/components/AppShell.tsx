"use client";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

const AUTH_ROUTES = ["/login", "/register", "/reset-password"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "?"));

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  );
}
