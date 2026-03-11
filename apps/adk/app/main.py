import asyncio
import json
from pathlib import Path
from typing import Any

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

from app.agent import MODEL_NAME, root_agent


APP_NAME = "google-voice-guide-live-coach"
AUDIO_MIME_TYPE = "audio/pcm;rate=16000"

session_service = InMemorySessionService()
runner = Runner(
    app_name=APP_NAME,
    agent=root_agent,
    session_service=session_service,
)

app = FastAPI()


def build_briefing(payload: dict[str, Any]) -> str:
    our_user = payload.get("ourUser") or "our user"
    counterpart = payload.get("counterpart") or "the other caller"
    goal = payload.get("goal") or "keep the conversation productive"
    context = payload.get("context") or "No additional context provided."

    return f"""
Call briefing:
- Our user: {our_user}
- Other participant: {counterpart}
- Goal: {goal}
- Extra context: {context}

Coach our user in real time during this conversation.
""".strip()


async def start_agent_session(user_id: str) -> tuple[Any, LiveRequestQueue]:
    session_id = f"{APP_NAME}-{user_id}"
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
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )
    live_request_queue = LiveRequestQueue()
    live_events = runner.run_live(
        user_id=user_id,
        session_id=session.id,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )
    return live_events, live_request_queue


async def send_json(websocket: WebSocket, payload: dict[str, Any]) -> bool:
    if websocket.client_state != WebSocketState.CONNECTED:
        return False

    try:
        await websocket.send_text(json.dumps(payload))
        return True
    except (RuntimeError, WebSocketDisconnect):
        return False


async def agent_to_client(websocket: WebSocket, live_events: Any) -> None:
    try:
        async for event in live_events:
            if event.input_transcription and event.input_transcription.text:
                await send_json(
                    websocket,
                    {
                        "type": "call_transcript",
                        "text": event.input_transcription.text,
                        "finished": bool(event.input_transcription.finished),
                    },
                )

            if event.output_transcription and event.output_transcription.text:
                await send_json(
                    websocket,
                    {
                        "type": "coach_transcript",
                        "text": event.output_transcription.text,
                        "finished": bool(event.output_transcription.finished),
                    },
                )

            if event.turn_complete or event.interrupted:
                await send_json(
                    websocket,
                    {
                        "type": "turn_state",
                        "turnComplete": bool(event.turn_complete),
                        "interrupted": bool(event.interrupted),
                    },
                )
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await send_json(
            websocket,
            {
                "type": "error",
                "message": f"Agent stream failed: {exc}",
            },
        )


async def handle_text_message(
    websocket: WebSocket,
    live_request_queue: LiveRequestQueue,
    raw_text: str,
) -> None:
    payload = json.loads(raw_text)
    message_type = payload.get("type")

    if message_type == "context":
        content = Content(
            role="user",
            parts=[Part.from_text(text=build_briefing(payload))],
        )
        live_request_queue.send_content(content=content)
        await send_json(
            websocket,
            {
                "type": "ready",
                "message": "Call context loaded. Start speaking when ready.",
                "model": MODEL_NAME,
            },
        )
        return

    if message_type == "text":
        text = payload.get("text", "").strip()
        if text:
            content = Content(role="user", parts=[Part.from_text(text=text)])
            live_request_queue.send_content(content=content)
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


async def client_to_agent(websocket: WebSocket, live_request_queue: LiveRequestQueue) -> None:
    try:
        while True:
            message = await websocket.receive()

            if message.get("text") is not None:
                await handle_text_message(
                    websocket,
                    live_request_queue,
                    message["text"],
                )
                continue

            if message.get("bytes") is not None:
                live_request_queue.send_realtime(
                    Blob(data=message["bytes"], mime_type=AUDIO_MIME_TYPE)
                )
                continue

            if message.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        return
    except Exception as exc:
        await send_json(
            websocket,
            {
                "type": "error",
                "message": f"Client stream failed: {exc}",
            },
        )


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "adk",
        "model": MODEL_NAME,
    }


@app.websocket("/ws/live-coach")
async def live_coach(websocket: WebSocket) -> None:
    await websocket.accept()
    user_id = str(id(websocket))
    live_events, live_request_queue = await start_agent_session(user_id)

    await send_json(
        websocket,
        {
            "type": "connected",
            "message": "Connected to the live coach.",
            "model": MODEL_NAME,
        },
    )

    agent_task = asyncio.create_task(agent_to_client(websocket, live_events))
    client_task = asyncio.create_task(client_to_agent(websocket, live_request_queue))

    try:
        done, pending = await asyncio.wait(
            [agent_task, client_task],
            return_when=asyncio.FIRST_EXCEPTION,
        )
        for task in done:
            exception = task.exception()
            if exception is not None and not isinstance(exception, WebSocketDisconnect):
                raise exception
    finally:
        for task in (agent_task, client_task):
            if not task.done():
                task.cancel()
        live_request_queue.close()
