import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ScanInterface } from "@/components/ScanInterface";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function ScanPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) redirect("/");

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-8 text-center">Scan a Record</h1>
      <ScanInterface />
    </div>
  );
}
