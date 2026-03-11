# Google Voice Guide

pnpm monorepo with:

- `apps/web`: React + Vite + React Router + Tailwind + tRPC client
- `apps/api`: Node + Express + tRPC server
- `packages/api-contract`: shared tRPC router and types

## Requirements

- Node.js 20+
- pnpm 10+

## Getting Started

```bash
pnpm install
pnpm dev
```

Frontend runs on `http://localhost:5173`.
API runs on `http://localhost:3001`.

## Scripts

```bash
pnpm dev
pnpm build
pnpm typecheck
```

## Project Structure

```text
apps/
  api/
  web/
packages/
  api-contract/
```
