import Link from "next/link";
import { Disc3, Camera, Zap, CheckCircle, CreditCard } from "lucide-react";
import { api } from "@/lib/api";

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center text-center px-4 py-24 sm:py-36 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-vinyl-accent/10 via-vinyl-black to-vinyl-black pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center gap-6 max-w-3xl">
          <div className="flex items-center gap-3 text-vinyl-accent">
            <Disc3 size={56} className="animate-spin" style={{ animationDuration: "8s" }} />
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold leading-tight">
            Scan your vinyl.{" "}
            <span className="text-vinyl-accent">Add to Discogs.</span>{" "}
            Instantly.
          </h1>
          <p className="text-vinyl-muted text-lg sm:text-xl max-w-xl">
            Point your phone at any record. AI identifies it. One tap adds it to your Discogs collection.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/discogs/login`}
              className="btn-primary text-lg px-8 py-4 flex items-center gap-2"
            >
              <Disc3 size={20} />
              Connect with Discogs — it&apos;s free
            </a>
          </div>
          <p className="text-vinyl-muted text-sm">
            <span className="text-vinyl-gold font-semibold">5 free credits every month</span>, on us. No card required to start.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-vinyl-dark border-t border-vinyl-border py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: <Camera size={32} />, step: "1. Scan", desc: "Take a photo of your record's cover or label. Works with any phone camera." },
              { icon: <Zap size={32} />, step: "2. Identify", desc: "Claude AI instantly reads the record — artist, title, year, label, and more." },
              { icon: <CheckCircle size={32} />, step: "3. Add to Discogs", desc: "Confirm the match and it's in your Discogs collection. No manual searching." },
            ].map(({ icon, step, desc }) => (
              <div key={step} className="card p-6 flex flex-col gap-4">
                <div className="text-vinyl-accent">{icon}</div>
                <h3 className="font-bold text-lg">{step}</h3>
                <p className="text-vinyl-muted text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Free credits callout */}
      <section className="py-16 px-4 bg-vinyl-accent/5 border-t border-vinyl-border">
        <div className="max-w-2xl mx-auto text-center flex flex-col gap-4">
          <CreditCard size={36} className="text-vinyl-gold mx-auto" />
          <h2 className="text-2xl font-bold">Start free. 5 credits every month, on us.</h2>
          <p className="text-vinyl-muted">
            Every account gets 5 free credits on the 1st of each month. Each scan uses 1 credit — that&apos;s 5 records a month, free. Need more? Buy only what you need.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 border-t border-vinyl-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-2">Buy only what you need.</h2>
          <p className="text-center text-vinyl-muted mb-12">No subscriptions. Credits never expire.</p>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { name: "Small Pack", credits: 25, price: "$1.99", best: false },
              { name: "Medium Pack", credits: 75, price: "$4.99", best: true },
              { name: "Large Pack", credits: 200, price: "$9.99", best: false },
            ].map(({ name, credits, price, best }) => (
              <div
                key={name}
                className={`card p-6 flex flex-col gap-4 ${best ? "border-vinyl-accent" : ""} relative`}
              >
                {best && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-vinyl-accent text-white text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                )}
                <h3 className="font-bold text-lg">{name}</h3>
                <p className="text-4xl font-extrabold text-vinyl-gold">{credits} <span className="text-base font-normal text-vinyl-muted">credits</span></p>
                <p className="text-2xl font-bold">{price}</p>
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/discogs/login`}
                  className="btn-primary text-center"
                >
                  Get Started
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA footer */}
      <section className="py-20 px-4 text-center border-t border-vinyl-border bg-vinyl-dark">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          <Disc3 size={48} className="text-vinyl-accent mx-auto animate-spin" style={{ animationDuration: "8s" }} />
          <h2 className="text-3xl font-bold">Ready to digitize your collection?</h2>
          <p className="text-vinyl-muted">Connect your Discogs account and start scanning in seconds.</p>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/auth/discogs/login`}
            className="btn-primary text-lg px-8 py-4 self-center"
          >
            Connect with Discogs — it&apos;s free
          </a>
        </div>
      </section>
    </div>
  );
}
