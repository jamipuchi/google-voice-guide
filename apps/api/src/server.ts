import cors from 'cors';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '@google-voice-guide/api-contract';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'api',
    now: new Date().toISOString()
  });
});

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter
  })
);

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
