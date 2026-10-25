import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "greek"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "greek"],
});

export const metadata: Metadata = {
  title: { default: "DG Complete", template: "%s · DG Complete" },
  description: "Αυτόματες καταχωρίσεις σε web συστήματα — DGsoft",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="el" className={`${inter.variable} ${jetbrainsMono.variable} h-full`}>
      <body className="min-h-full">
        {/* Every page reads the session: stream it behind the static shell (P01 brings the shells into it). */}
        <TooltipProvider delayDuration={300}>
          <Suspense>{children}</Suspense>
        </TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
