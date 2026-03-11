import StatusPill from '../components/StatusPill';
import { trpc } from '../main';

export default function HomePage() {
  const greetingQuery = trpc.greeting.useQuery({ name: 'builder' });
  const healthQuery = trpc.health.useQuery();

  return (
    <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <article className="overflow-hidden rounded-[2rem] bg-ink px-8 py-10 text-sand shadow-panel">
        <StatusPill label="typed end to end" />
        <h2 className="mt-6 max-w-xl text-3xl font-black tracking-tight sm:text-4xl">
          {greetingQuery.data?.message ?? 'Connecting to the tRPC server...'}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-sand/80">
          The frontend is talking to the backend through tRPC. Shared router
          types live in a workspace package, so the client and server stay in
          sync without manual API types.
        </p>
      </article>

      <article className="rounded-[2rem] border border-black/5 bg-white/70 p-8 shadow-panel backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-ink">API status</h3>
          <StatusPill
            label={healthQuery.data?.status ?? 'loading'}
            tone={healthQuery.data?.status === 'ok' ? 'success' : 'default'}
          />
        </div>
        <dl className="mt-6 space-y-5">
          <div>
            <dt className="text-sm font-semibold uppercase tracking-[0.2em] text-ink/50">
              Server time
            </dt>
            <dd className="mt-2 text-lg font-semibold text-ink">
              {healthQuery.data?.now
                ? new Date(healthQuery.data.now).toLocaleString()
                : 'Waiting for response'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold uppercase tracking-[0.2em] text-ink/50">
              Router contract
            </dt>
            <dd className="mt-2 text-lg font-semibold text-ink">
              Shared in <code>@google-voice-guide/api-contract</code>
            </dd>
          </div>
        </dl>
      </article>
    </section>
  );
}
