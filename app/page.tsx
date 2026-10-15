import PitchForm from "@/components/PitchForm";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6 sm:py-20">
      <p className="mb-5 inline-block rounded-full border border-violet px-3 py-1 text-xs font-medium text-lime">
        Real taste data, not guesses
      </p>
      <h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
        Check the <span className="text-lime">pulse</span> of your side hustle before you launch.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        Tell us your idea and city. Our agent asks Qloo&apos;s taste graph where your Gen Z customers are, who to
        collab with, and how strong the demand really is.
      </p>
      <PitchForm />
    </main>
  );
}
