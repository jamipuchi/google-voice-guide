const stack = [
  'pnpm workspaces',
  'React + Vite',
  'React Router',
  'Tailwind CSS',
  'Node + Express',
  'tRPC',
  'TypeScript'
];

export default function StackPage() {
  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <article className="rounded-[2rem] border border-black/5 bg-white/70 p-8 shadow-panel backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-coral">
          What is included
        </p>
        <ul className="mt-6 grid gap-3">
          {stack.map((item) => (
            <li
              key={item}
              className="rounded-2xl bg-sand px-4 py-3 text-base font-semibold text-ink"
            >
              {item}
            </li>
          ))}
        </ul>
      </article>

      <article className="rounded-[2rem] bg-gradient-to-br from-teal to-ink p-8 text-white shadow-panel">
        <h2 className="text-3xl font-black tracking-tight">
          Ready for feature work.
        </h2>
        <p className="mt-4 max-w-xl text-base leading-7 text-white/80">
          The repo is split into app and package workspaces, with a dedicated
          contract package for the router. That keeps cross-package imports
          deliberate and makes build order predictable.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/10 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              Frontend
            </p>
            <p className="mt-2 text-sm leading-6 text-white/80">
              React Router is already mounted, Tailwind is configured, and tRPC
              is connected through React Query.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              Backend
            </p>
            <p className="mt-2 text-sm leading-6 text-white/80">
              Express serves the tRPC endpoint and a basic health route, with
              the shared router package providing type-safe procedures.
            </p>
          </div>
        </div>
      </article>
    </section>
  );
}
