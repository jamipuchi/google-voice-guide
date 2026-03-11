# Google Voice Guide

pnpm monorepo with:

- `apps/web`: React + Vite + React Router + Tailwind + tRPC client
- `apps/api`: Node + Express + tRPC server
- `apps/adk`: Python + FastAPI + Google ADK live voice coach
- `packages/api-contract`: shared tRPC router and types

## Requirements

- Node.js 20+
- pnpm 10+
- `uv` for the Python ADK app

## Getting Started

```bash
pnpm install
pnpm dev
```

Frontend runs on `http://localhost:5173`.
API runs on `http://localhost:3001`.
ADK voice coach runs on `http://localhost:8001`.

## Scripts

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm adk:sync
```

## Project Structure

```text
apps/
  adk/
  api/
  web/
packages/
  api-contract/
```

## Live Coaching Test Flow

1. Put the phone call on speaker, or route both call participants into the same input device.
2. Open `http://localhost:5173`.
3. Fill in the conversation goal and context.
4. Choose the audio input device and start listening.
5. Watch the live call transcript and the coach suggestions update in real time.
