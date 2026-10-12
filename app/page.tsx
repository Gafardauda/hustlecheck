export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[#0E0B1F] px-6 text-center text-white">
      <p className="mb-4 rounded-full border border-[#7C3AED] px-4 py-1 text-sm text-[#C6FF3D]">
        Powered by Qloo&apos;s taste graph
      </p>
      <h1 className="text-5xl font-black tracking-tight sm:text-7xl">
        Hustle<span className="text-[#C6FF3D]">Pulse</span>
      </h1>
      <p className="mt-4 max-w-xl text-lg text-white/70">
        Check the pulse of your side hustle before you launch.
      </p>
      <p className="mt-10 text-sm text-white/40">Get your PulseScore — coming soon.</p>
    </main>
  );
}
