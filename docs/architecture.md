# Live Call Coaching — System Architecture

## Overview

The system provides **real-time, two-channel call coaching**. Two separate audio inputs (one per participant) are transcribed independently and fed to an AI coach that advises "our user" during the call.

```
Browser (React)                              FastAPI + ADK (Python)
┌──────────────────────┐                    ┌──────────────────────────────┐
│  Mic A (Our User)  ──┼── audio_chunk ───► │  Transcriber Agent (Our User)│
│  Mic B (Counterpart)─┼── audio_chunk ───► │  Transcriber Agent (Counter) │
│                      │                    │              │                │
│                      │◄─ speaker_transcript│◄─────────────┘                │
│                      │                    │              │                │
│                      │                    │      ┌───────▼──────┐        │
│                      │◄─ coach_suggestion │◄─────│  Coach Agent │        │
│                      │◄─ field_update     │      └──────────────┘        │
└──────────────────────┘                    └──────────────────────────────┘
        WebSocket (ws://localhost:8001/ws/live-coach)
```

---

## Communication Channels

### Single WebSocket Connection

All communication runs over **one bidirectional WebSocket** at `/ws/live-coach`.


| Direction       | Message Type         | Purpose                                                             |
| --------------- | -------------------- | ------------------------------------------------------------------- |
| Client → Server | `context`            | Send call labels, goal, and context before audio starts             |
| Client → Server | `audio_chunk`        | Base64-encoded PCM audio (16 kHz, mono) for one speaker             |
| Client → Server | `ping`               | Keep-alive                                                          |
| Server → Client | `connected`          | Connection confirmed, includes model names                          |
| Server → Client | `ready`              | Context received, ready for audio                                   |
| Server → Client | `speaker_transcript` | Streaming transcription for a speaker (partial or final)            |
| Server → Client | `coach_suggestion`   | AI coaching recommendation (partial or final)                       |
| Server → Client | `field_update`       | AI-detected contact field changes (frontend ready, backend pending) |
| Server → Client | `error`              | Error notification                                                  |
| Server → Client | `pong`               | Keep-alive response                                                 |


### Message Payloads

`**context`** (client sends once before audio)

```json
{
  "type": "context",
  "ourUser": "Sales rep",
  "counterpart": "Prospect",
  "goal": "Understand pain points and secure a concrete next step",
  "context": "Additional context for the coach..."
}
```

`**audio_chunk**` (client sends continuously during call)

```json
{
  "type": "audio_chunk",
  "speaker": "ourUser",
  "data": "<base64-encoded PCM bytes>"
}
```

`**speaker_transcript**` (server streams back)

```json
{
  "type": "speaker_transcript",
  "speaker": "ourUser",
  "text": "Hola, estoy interesada en...",
  "finished": false
}
```

- `finished: false` = partial (updating in place)
- `finished: true` = turn complete, new entry

`**coach_suggestion**` (server streams back)

```json
{
  "type": "coach_suggestion",
  "text": "Mention the 12-month warranty now.",
  "finished": true
}
```

`**field_update**` (server sends when AI detects info)

```json
{
  "type": "field_update",
  "fields": {
    "name": "María García",
    "email": "maria@example.com"
  }
}
```

---

## The Three ADK Agents

All agents are defined in `apps/adk/app/agent.py` and use Google's ADK (Agent Development Kit) with Gemini models.

### Agent 1: `our_user_transcriber`

**Model:** `gemini-2.5-flash-native-audio-preview-12-2025` (env: `ADK_TRANSCRIBER_MODEL`)

**Role:** Receives raw PCM audio from our user's mic and outputs a verbatim transcript.

**Prompt:**

```
You receive audio from a single isolated channel that belongs only to OUR USER.

Speak back only a verbatim transcript of what that speaker just said.
Rules:
- Do not summarize.
- Do not explain.
- Do not add labels.
- Do not answer the speaker.
- Keep the response short and literal.
```

### Agent 2: `counterpart_transcriber`

**Model:** Same as above.

**Role:** Identical to agent 1 but for the counterpart's audio channel.

**Prompt:**

```
You receive audio from a single isolated channel that belongs only to
the OTHER PERSON on the call.

Speak back only a verbatim transcript of what that speaker just said.
Rules:
- Do not summarize.
- Do not explain.
- Do not add labels.
- Do not answer the speaker.
- Keep the response short and literal.
```

### Agent 3: `speaker_aware_call_coach`

**Model:** `gemini-2.5-flash-native-audio-preview-12-2025` (env: `ADK_COACH_MODEL`)

**Role:** Receives **labeled, finalized transcript lines** and coaches our user in real time.

**Input format:** The coach receives text messages like:

```
[Sales rep] Hola, le llamo de Pazy...
[Prospect] No tengo tiempo ahora.
```

**Prompt (summarized):**

```
You are a real-time call coach.

You receive speaker-labeled transcript lines:
[Our User] ...
[Counterpart] ...

Help OUR USER steer the conversation and handle objections for "Pazy"
funeral plans.

Rules:
- Speak only to OUR USER.
- At most 2 sentences per response.
- Prefer the single best next move.
- Include one exact sentence our user can say, in quotes.
- Flag objections, buying signals, confusion, or openings.

OBJECTION HANDLING GUIDE:
1. "Tengo que hablarlo con mi marido/mujer" → Close now, use time-limited discount
2. "Llámame en unos días" → Close now, traditional insurance increases over time
3. "Yo ahora pago menos" → Explain Pazy is fixed-price, finishes in ~10 years
4. "¿Qué pasa si desaparecéis?" → We belong to Grupo A3M (Atresmedia)
5. "No tengo tiempo" → Suggest scheduling or email summary
6. "No me fío por teléfono" → Call is recorded, audited, legal
7. "No tenéis punto físico" → No offices = lower cost for customer
8. "Si me cambio no estoy cubierta (75+)" → Family can finance remainder
9. "¿Si cambio de residencia?" → Full flexibility, just notify us
10. "Mi seguro vence en X meses" → We help step by step
11. "En la tele decís 3.500€" → Average reference, depends on province
```

---

## Data Flow — Step by Step

### 1. Session Setup

```
Browser                                Server
  │                                      │
  ├──── WS connect ────────────────────► │ accept(), create ConnectionState
  │◄──── { type: "connected" } ──────── │ with model names
  │                                      │
  ├──── { type: "context", ... } ──────► │ store labels/goal, seed session//s
  │◄──── { type: "ready" } ────────────  │ start 3 ADK runner sessions
```

### 2. Audio Streaming

```
Browser                                Server
  │                                      │
  │  AudioWorklet captures PCM@16kHz     │
  │  Buffer until 6400 bytes or 180ms    │
  │                                      │
  ├──── audio_chunk (ourUser) ─────────► │ decode base64 → Blob
  │                                      │ send to our_user_runner
  │                                      │
  ├──── audio_chunk (counterpart) ─────► │ decode base64 → Blob
  │                                      │ send to counterpart_runner
```

### 3. Transcription

```
Server internally
  │
  ADK Runner (ourUser)
  │  Gemini processes audio
  │  Emits output_transcription events
  │     ├── partial → extract_text_delta() → speaker_transcript (finished: false)
  │     └── turn_complete → speaker_transcript (finished: true)
  │                          └── maybe_send_to_coach()
  │
  Same for counterpart runner
```

### 4. Coaching

```
Server internally
  │
  maybe_send_to_coach() is called when a speaker finishes a turn
  │
  First call: sends briefing + labeled transcript
  ┌────────────────────────────────────────────────┐
  │ Call briefing:                                  │
  │ - Our user label: Sales rep                    │
  │ - Counterpart label: Prospect                  │
  │ - Goal: Understand pain points...              │
  │ - Additional context: ...                      │
  │                                                │
  │ [Sales rep] Hola, le llamo de Pazy...          │
  └────────────────────────────────────────────────┘
  │
  Subsequent calls: just labeled transcript
  ┌────────────────────────────────────────────────┐
  │ [Prospect] No tengo tiempo ahora.              │
  └────────────────────────────────────────────────┘
  │
  Coach agent generates suggestion
  │  → coach_suggestion (finished: false) partial stream
  │  → coach_suggestion (finished: true) final
  │
  Sent to browser via WebSocket
```

### 5. Field Updates (planned)

When the coach detects information from the conversation (e.g., the counterpart mentions their name, email, or deal preferences), the backend would send:

```json
{ "type": "field_update", "fields": { "name": "María García" } }
```

The frontend animates this with a **glow + typewriter effect** — the field border pulses blue and the new value types in character by character.

> **Status:** Frontend handler is implemented. Backend emission is not yet wired.

---

## Concurrency Model

The server runs **4 concurrent async tasks** per connection using `asyncio.gather()`:


| Task | Function                                       | Responsibility                                |
| ---- | ---------------------------------------------- | --------------------------------------------- |
| 1    | `speaker_transcriber_to_client("ourUser")`     | Stream our user's transcription to browser    |
| 2    | `speaker_transcriber_to_client("counterpart")` | Stream counterpart's transcription to browser |
| 3    | `coach_to_client()`                            | Stream coach suggestions to browser           |
| 4    | `client_to_backend()`                          | Receive audio chunks and control messages     |


All four run simultaneously. If any task raises an exception, the connection is torn down.

---

## Key Files


| File                                              | Purpose                                                   |
| ------------------------------------------------- | --------------------------------------------------------- |
| `apps/adk/app/agent.py`                           | ADK agent definitions (3 agents + prompts)                |
| `apps/adk/app/main.py`                            | FastAPI server, WebSocket handler, transcription pipeline |
| `apps/web/src/hooks/useLiveCoach.ts`              | Frontend hook: WebSocket, audio capture, state management |
| `apps/web/src/hooks/useCallTimer.ts`              | Live call timer (MM:SS)                                   |
| `apps/web/src/hooks/useInterleavedTranscripts.ts` | Merges both speaker transcripts chronologically           |
| `apps/web/src/hooks/useTypewriter.ts`             | Character-by-character typing animation                   |
| `apps/web/src/components/EditableField.tsx`       | Click-to-edit field with glow+typewriter animation        |
| `apps/web/src/components/SessionSetupDialog.tsx`  | Pre-call setup modal (devices, context, labels)           |
| `apps/web/src/routes/ContactDetailPage.tsx`       | Main live coaching UI (Subframe design)                   |
| `apps/web/src/routes/CoachPage.tsx`               | Debug/raw coaching UI                                     |
| `apps/web/public/audio-recorder-worklet.js`       | AudioWorklet: Float32 → Int16 PCM conversion              |
| `scripts/dev.sh`                                  | Starts both servers (web:5173, adk:8001)                  |


---

## Environment Variables


| Variable                | Default                                         | Purpose                          |
| ----------------------- | ----------------------------------------------- | -------------------------------- |
| `ADK_TRANSCRIBER_MODEL` | `gemini-2.5-flash-native-audio-preview-12-2025` | Model for transcription agents   |
| `ADK_COACH_MODEL`       | `gemini-2.5-flash-native-audio-preview-12-2025` | Model for coach agent            |
| `VITE_ADK_WS_URL`       | `ws://localhost:8001/ws/live-coach`             | WebSocket URL (frontend)         |
| `VITE_ADK_HTTP_URL`     | `http://localhost:8001`                         | Health check URL (frontend)      |
| `GOOGLE_API_KEY`        | —                                               | Google API key for Gemini models |


---

## Audio Pipeline Details

**Browser side:**

1. `navigator.mediaDevices.getUserMedia()` with specific `deviceId` per speaker
2. `AudioContext` at 16 kHz sample rate
3. `AudioWorkletNode` running `pcm-recorder-processor`
4. Worklet converts Float32 samples → Int16 PCM bytes
5. Chunks buffered in JS until 6400 bytes or 180ms timeout
6. Sent as base64 in JSON over WebSocket

**Server side:**

1. Base64 decoded to raw bytes
2. Wrapped in `google.genai.types.Blob(mime_type="audio/pcm;rate=16000", data=bytes)`
3. Sent to ADK runner via `live_request_queue.send_realtime(blob)`
4. Gemini processes audio and emits transcription events
5. `extract_text_delta()` handles partial vs. final transcription logic

