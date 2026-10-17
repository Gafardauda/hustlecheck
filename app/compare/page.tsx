import Link from "next/link";
import CompareForm from "@/components/CompareForm";

export const metadata = {
  title: "Compare cities — HustlePulse",
  description: "See which city your side hustle would pop in most.",
};

export default function ComparePage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <Link href="/" className="text-sm text-muted hover:text-fg">
        ← Back
      </Link>
      <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
        Which city wants your hustle <span className="text-gradient">most?</span>
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Drop your idea and we&apos;ll measure real demand across every city, then rank them.
      </p>
      <CompareForm />
    </main>
  );
}
