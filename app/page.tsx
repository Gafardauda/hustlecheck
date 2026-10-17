import PitchForm from "@/components/PitchForm";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6 sm:py-20">
      <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet bg-panel/60 px-3 py-1 text-xs font-medium text-lime">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
        </span>
        Real taste data, not guesses
      </p>
      <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-tight sm:text-7xl">
        Will your side hustle <span className="text-gradient">actually pop?</span>
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted sm:text-xl">
        Drop your idea and city. In seconds you get a <span className="font-semibold text-fg">PulseScore</span>, the
        neighbourhoods that want it, who to collab with, and a launch plan — backed by real taste data, not vibes.
      </p>
      <PitchForm />
    </main>
  );
}
