import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "VinylScan — Record store management",
  description: "Scan, catalog, and sell vinyl records with AI.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VinylScan",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#07070a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Runs before paint to avoid flash — reads localStorage, defaults to light */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('vs-theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})()` }} />
      </head>
      <body className="min-h-screen bg-vs-bg text-vs-text">
        <ServiceWorkerRegistrar />
        <AppShell>{children}</AppShell>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: "rgb(var(--vs-card))", border: "1px solid rgb(var(--vs-border))", color: "rgb(var(--vs-text))" },
          }}
        />
      </body>
    </html>
  );
}
