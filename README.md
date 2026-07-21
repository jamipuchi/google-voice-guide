# Google Voice Guide

Google Voice Guide is a real-time, two-channel voice coaching app for live sales calls.
It captures one audio source for your rep and one for the counterpart, transcribes both
speakers independently, and streams short AI recommendations back into a CRM-style UI.

## What It Does

- Separates a live conversation into two browser audio inputs.
- Transcribes each speaker independently in real time.
- Sends speaker-labeled turns to a coaching agent.
- Shows very short next-step suggestions for the rep during the call.
- Extracts contact and deal details into the customer record as the conversation evolves.

## Architecture

This repo is a small monorepo with two apps:

- `apps/web`
  React + Vite frontend for the live coaching dashboard.
- `apps/adk`
  FastAPI + Google ADK backend for live transcription and coaching.

## Agents

The backend uses three live agents:

1. `our_user_transcriber`
   Transcribes only the sales rep audio channel.
2. `counterpart_transcriber`
   Transcribes only the counterpart audio channel.
3. `speaker_aware_call_coach`
   Reads the speaker-labeled transcript, produces very short coaching suggestions,
   and updates contact/deal fields when explicit facts are mentioned.

## Requirements

- Node.js 20+
- pnpm 10+
- `uv` for the Python ADK app

## Getting Started

```bash
pnpm install
pnpm dev
```

- Frontend: `http://localhost:5173`
- ADK backend: `http://localhost:8001`

## Scripts

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm adk:sync
pnpm adk:dev
```

## Project Structure

```text
apps/
  adk/
    app/
      agent.py
      main.py
  web/
    src/
      components/
      hooks/
      routes/
```

## UI Overview

The main screen is split into two areas:

- Left side
  Contact information, deal metadata, notes, and AI-updated CRM fields.
- Right side
  Live call status, assistant recommendations, agent actions, and the real-time transcript.

The document itself is viewport-locked, and scrolling is handled inside the app panels.

## Live Coaching Test Flow

1. Put the phone call on speaker, or route both call participants into separate input devices.
2. Expose each participant as a distinct browser audio input.
3. Open `http://localhost:5173`.
4. Configure the call labels, goal, and context.
5. Assign one input to your rep and one input to the counterpart.
6. Start the live session.
7. Watch the transcript and the assistant recommendations update in real time.
