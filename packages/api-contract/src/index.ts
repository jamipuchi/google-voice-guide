import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const appRouter = t.router({
  health: t.procedure.query(() => ({
    status: 'ok',
    now: new Date().toISOString()
  })),
  greeting: t.procedure
    .input(
      z.object({
        name: z.string().min(1)
      })
    )
    .query(({ input }) => ({
      message: `Hello ${input.name}, your monorepo is ready.`
    }))
});

export type AppRouter = typeof appRouter;
