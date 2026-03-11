import asyncio
import base64
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, WebSocket
from fastapi.websockets import WebSocketDisconnect
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types
from google.genai.types import Blob, Content, Part
from starlette.websockets import WebSocketState

from app.agent import (
    COACH_MODEL,
    TRANSCRIBER_MODEL,
    coach_agent,
    counterpart_transcriber_agent,
    our_user_transcriber_agent,
)


SpeakerKey = Literal["ourUser", "counterpart"]

APP_NAME = "google-voice-guide-live-coach"
AUDIO_MIME_TYPE = "audio/pcm;rate=16000"


@dataclass
class LiveSession:
    live_events: Any
    live_request_queue: LiveRequestQueue


@dataclass
class ConnectionState:
    our_user_label: str = "Our User"
    counterpart_label: str = "Counterpart"
    goal: str = "Keep the conversation productive."
    context: str = ""
    coach_seeded: bool = False
    speaker_buffers: dict[SpeakerKey, str] = None  # type: ignore[assignment]
    coach_buffer: str = ""

    def __post_init__(self) -> None:
        self.speaker_buffers = {
            "ourUser": "",
            "counterpart": "",
        }


session_service = InMemorySessionService()
our_user_runner = Runner(
    app_name=APP_NAME,
    agent=our_user_transcriber_agent,
    session_service=session_service,
)
counterpart_runner = Runner(
    app_name=APP_NAME,
    agent=counterpart_transcriber_agent,
    session_service=session_service,
)
coach_runner = Runner(
    app_name=APP_NAME,
    agent=coach_agent,
    session_service=session_service,
)

app = FastAPI()


def build_call_briefing(state: ConnectionState) -> str:
    extra_context = state.context or "No extra context provided."
    return f"""
Call briefing:
- Our user label: {state.our_user_label}
- Counterpart label: {state.counterpart_label}
- Goal: {state.goal}
- Additional context: {extra_context}

Use the next labeled transcript lines to coach our user in real time.
""".strip()


def extract_text_delta(event: Any, current_buffer: str) -> str:
    if not event.output_transcription or not event.output_transcription.text:
        return ""

    delta = event.output_transcription.text
    if getattr(event.output_transcription, "finished", False):
        return current_buffer or delta
    if event.partial:
        return current_buffer + delta
    if current_buffer:
        return current_buffer
    return delta


async def send_json(websocket: WebSocket, payload: dict[str, Any]) -> bool:
    if websocket.client_state != WebSocketState.CONNECTED:
        return False

    try:
        await websocket.send_text(json.dumps(payload))
        return True
    except (RuntimeError, WebSocketDisconnect):
        return False


async def create_live_session(
    runner: Runner,
    user_id: str,
    session_suffix: str,
) -> LiveSession:
    session_id = f"{APP_NAME}-{session_suffix}-{user_id}"
    session = await session_service.get_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )
    if not session:
        session = await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )

    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=[types.Modality.AUDIO],
        session_resumption=types.SessionResumptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )
    live_request_queue = LiveRequestQueue()
    live_events = runner.run_live(
        user_id=user_id,
        session_id=session.id,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )
    return LiveSession(
        live_events=live_events,
        live_request_queue=live_request_queue,
    )


async def maybe_send_to_coach(
    speaker: SpeakerKey,
    transcript_text: str,
    connection_state: ConnectionState,
    coach_session: LiveSession,
) -> None:
    if not transcript_text:
        return

    speaker_label = (
        connection_state.our_user_label
        if speaker == "ourUser"
        else connection_state.counterpart_label
    )

    if not connection_state.coach_seeded:
        content_text = (
            f"{build_call_briefing(connection_state)}\n\n"
            f"[{speaker_label}] {transcript_text}"
        )
        connection_state.coach_seeded = True
    else:
        content_text = f"[{speaker_label}] {transcript_text}"

    coach_session.live_request_queue.send_content(
        content=Content(role="user", parts=[Part.from_text(text=content_text)])
    )


async def speaker_transcriber_to_client(
    websocket: WebSocket,
    speaker: SpeakerKey,
    live_session: LiveSession,
    coach_session: LiveSession,
    connection_state: ConnectionState,
) -> None:
    try:
        async for event in live_session.live_events:
            current_buffer = connection_state.speaker_buffers[speaker]
            next_buffer = extract_text_delta(event, current_buffer)

            if next_buffer and next_buffer != current_buffer:
                connection_state.speaker_buffers[speaker] = next_buffer
                await send_json(
                    websocket,
                    {
                        "type": "speaker_transcript",
                        "speaker": speaker,
                        "text": next_buffer,
                        "finished": False,
                    },
                )

            if event.turn_complete:
                final_text = connection_state.speaker_buffers[speaker].strip()
                if final_text:
                    await send_json(
                        websocket,
                        {
                            "type": "speaker_transcript",
                            "speaker": speaker,
                            "text": final_text,
                            "finished": True,
                        },
                    )
                    await maybe_send_to_coach(
                        speaker,
                        final_text,
                        connection_state,
                        coach_session,
                    )
                connection_state.speaker_buffers[speaker] = ""
    except WebSocketDisconnect:
        return


async def coach_to_client(
    websocket: WebSocket,
    coach_session: LiveSession,
    connection_state: ConnectionState,
) -> None:
    try:
        async for event in coach_session.live_events:
            next_buffer = extract_text_delta(event, connection_state.coach_buffer)
            if next_buffer and next_buffer != connection_state.coach_buffer:
                connection_state.coach_buffer = next_buffer
                await send_json(
                    websocket,
                    {
                        "type": "coach_suggestion",
                        "text": next_buffer,
                        "finished": False,
                    },
                )

            if event.turn_complete:
                final_text = connection_state.coach_buffer.strip()
                if final_text:
                    await send_json(
                        websocket,
                        {
                            "type": "coach_suggestion",
                            "text": final_text,
                            "finished": True,
                        },
                    )
                connection_state.coach_buffer = ""
    except WebSocketDisconnect:
        return


async def handle_text_message(
    websocket: WebSocket,
    raw_text: str,
    connection_state: ConnectionState,
    our_user_session: LiveSession,
    counterpart_session: LiveSession,
) -> None:
    payload = json.loads(raw_text)
    message_type = payload.get("type")

    if message_type == "context":
        connection_state.our_user_label = (
            payload.get("ourUser") or connection_state.our_user_label
        )
        connection_state.counterpart_label = (
            payload.get("counterpart") or connection_state.counterpart_label
        )
        connection_state.goal = payload.get("goal") or connection_state.goal
        connection_state.context = payload.get("context") or ""
        connection_state.coach_seeded = False

        await send_json(
            websocket,
            {
                "type": "ready",
                "message": "Two-channel context loaded. Start both speaker feeds when ready.",
                "transcriberModel": TRANSCRIBER_MODEL,
                "coachModel": COACH_MODEL,
            },
        )
        return

    if message_type == "audio_chunk":
        speaker = payload.get("speaker")
        encoded_audio = payload.get("data", "")

        if speaker not in ("ourUser", "counterpart"):
            await send_json(
                websocket,
                {"type": "error", "message": "Unsupported speaker channel."},
            )
            return

        if not encoded_audio:
            return

        target_session = (
            our_user_session if speaker == "ourUser" else counterpart_session
        )
        target_session.live_request_queue.send_realtime(
            Blob(
                data=base64.b64decode(encoded_audio),
                mime_type=AUDIO_MIME_TYPE,
            )
        )
        return

    if message_type == "ping":
        await send_json(websocket, {"type": "pong"})
        return

    await send_json(
        websocket,
        {
            "type": "error",
            "message": f"Unsupported message type: {message_type}",
        },
    )


async def client_to_backend(
    websocket: WebSocket,
    connection_state: ConnectionState,
    our_user_session: LiveSession,
    counterpart_session: LiveSession,
) -> None:
    try:
        while True:
            raw_text = await websocket.receive_text()
            await handle_text_message(
                websocket,
                raw_text,
                connection_state,
                our_user_session,
                counterpart_session,
            )
    except WebSocketDisconnect:
        return


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "adk",
        "transcriberModel": TRANSCRIBER_MODEL,
        "coachModel": COACH_MODEL,
    }


@app.websocket("/ws/live-coach")
async def live_coach(websocket: WebSocket) -> None:
    await websocket.accept()
    user_id = str(id(websocket))
    connection_state = ConnectionState()

    our_user_session, counterpart_session, coach_session = await asyncio.gather(
        create_live_session(our_user_runner, user_id, "our-user"),
        create_live_session(counterpart_runner, user_id, "counterpart"),
        create_live_session(coach_runner, user_id, "coach"),
    )

    await send_json(
        websocket,
        {
            "type": "connected",
            "message": "Connected to the two-channel live coach.",
            "transcriberModel": TRANSCRIBER_MODEL,
            "coachModel": COACH_MODEL,
        },
    )

    tasks = [
        asyncio.create_task(
            speaker_transcriber_to_client(
                websocket,
                "ourUser",
                our_user_session,
                coach_session,
                connection_state,
            )
        ),
        asyncio.create_task(
            speaker_transcriber_to_client(
                websocket,
                "counterpart",
                counterpart_session,
                coach_session,
                connection_state,
            )
        ),
        asyncio.create_task(
            coach_to_client(websocket, coach_session, connection_state)
        ),
        asyncio.create_task(
            client_to_backend(
                websocket,
                connection_state,
                our_user_session,
                counterpart_session,
            )
        ),
    ]

    try:
        done, _pending = await asyncio.wait(
            tasks,
            return_when=asyncio.FIRST_EXCEPTION,
        )
        for task in done:
            exception = task.exception()
            if exception is not None and not isinstance(exception, WebSocketDisconnect):
                raise exception
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        for session in (our_user_session, counterpart_session, coach_session):
            session.live_request_queue.close()
