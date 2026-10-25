import Image from "next/image";
import type { ReactNode } from "react";
import { BarChart3, PlugZap, ShieldCheck } from "lucide-react";
import { DgLogo } from "@/components/brand/dg-logo";

// The branded two-column frame of the public account pages (login, forgotten / new password).

const FEATURES = [
  { icon: PlugZap, title: "Απευθείας από το SoftOne σας", text: "Πωλήσεις, αγορές, αποθήκη και ταμειακά — χωρίς χειροκίνητες εξαγωγές." },
  { icon: BarChart3, title: "Dashboards & APIs", text: "Έτοιμοι δείκτες για τη διοίκηση και webservices για τις δικές σας εφαρμογές." },
  { icon: ShieldCheck, title: "Πλήρης απομόνωση δεδομένων", text: "Κάθε επιχείρηση βλέπει μόνο τα δικά της δεδομένα." },
];

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-[#14161b] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_420px_at_10%_0%,rgb(227_30_42/0.35),transparent_65%),radial-gradient(600px_400px_at_100%_100%,rgb(0_120_212/0.25),transparent_60%)]"
        />
        <DgLogo aria-hidden className="pointer-events-none absolute -right-24 -bottom-28 size-[26rem] text-white/[0.04]" />

        <Image src="/brand/dgsoft-white.svg" alt="DGsoft — Business Software on Demand" width={220} height={79} priority className="relative h-auto w-52" />

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.2em] text-dg-red-300 uppercase">DGsmart BI</p>
            <h1 className="text-4xl leading-tight font-semibold tracking-tight">
              Τα δεδομένα του SoftOne σας, <span className="text-dg-red-400">σε μια ματιά.</span>
            </h1>
          </div>
          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-dg-red-500/15 text-dg-red-300 ring-1 ring-dg-red-400/30">
                  <f.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="block text-sm text-white/65">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/45">© {new Date().getFullYear()} DGsoft · Business Software on Demand</p>
      </section>

      {/* Form */}
      <section className="flex flex-col items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <DgLogo className="size-10 text-dg-red-500" title="DGsoft" />
              <span className="text-xl font-bold tracking-tight">
                DGsmart <span className="text-dg-red-500">BI</span>
              </span>
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-5 shadow-fluent-4 sm:p-6">
            {children}
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>ένα προϊόν της</span>
            <Image src="/brand/dgsoft-wordmark.webp" alt="DGsoft" width={500} height={126} className="h-4 w-auto" />
          </div>
        </div>
      </section>
    </main>
  );
}
