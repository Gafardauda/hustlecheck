import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HustlePulse — Check the pulse of your side hustle",
  description:
    "Check the pulse of your side hustle before you launch. An AI agent that uses Qloo's taste graph to find real local demand, partners and a launch plan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line/60">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/" className="text-lg font-black tracking-tight">
              Hustle<span className="text-lime">Pulse</span>
            </Link>
            <span className="text-xs text-muted">Powered by Qloo&apos;s taste graph</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
