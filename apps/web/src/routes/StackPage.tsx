const stack = [
  'pnpm workspaces',
  'React + Vite',
  'React Router',
  'Tailwind CSS',
  'Node + Express',
  'Python + FastAPI',
  'Google ADK',
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
          The repo is split between the web UI, the Node API, and a Python ADK
          live-streaming service. The browser captures audio, the ADK service
          transcribes and coaches, and the UI renders both streams in real time.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/10 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              Frontend
            </p>
            <p className="mt-2 text-sm leading-6 text-white/80">
              React Router and Tailwind drive the live testing UI, and the app
              streams microphone audio to the ADK websocket.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              Agent runtime
            </p>
            <p className="mt-2 text-sm leading-6 text-white/80">
              FastAPI hosts the ADK bidi stream while the Node API remains
              available for app-side APIs and future integrations.
            </p>
          </div>
        </div>
      </article>
    </section>
  );
}
