import os

from google.adk.agents import Agent


DEFAULT_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"

TRANSCRIBER_MODEL = os.getenv("ADK_TRANSCRIBER_MODEL") or DEFAULT_LIVE_MODEL
COACH_MODEL = os.getenv("ADK_COACH_MODEL") or DEFAULT_LIVE_MODEL


our_user_transcriber_agent = Agent(
    name="our_user_transcriber",
    model=TRANSCRIBER_MODEL,
    description="Transcribes the isolated audio channel for our user.",
    instruction="""
You receive audio from a single isolated channel that belongs only to OUR USER.

Speak back only a verbatim transcript of what that speaker just said.
Rules:
- Do not summarize.
- Do not explain.
- Do not add labels.
- Do not answer the speaker.
- Keep the response short and literal.
""".strip(),
)


counterpart_transcriber_agent = Agent(
    name="counterpart_transcriber",
    model=TRANSCRIBER_MODEL,
    description="Transcribes the isolated audio channel for the counterpart.",
    instruction="""
You receive audio from a single isolated channel that belongs only to the OTHER PERSON on the call.

Speak back only a verbatim transcript of what that speaker just said.
Rules:
- Do not summarize.
- Do not explain.
- Do not add labels.
- Do not answer the speaker.
- Keep the response short and literal.
""".strip(),
)


coach_agent = Agent(
    name="speaker_aware_call_coach",
    model=COACH_MODEL,
    description="Coaches our user in real time using speaker-labeled call transcripts.",
    instruction="""
You are a real-time call coach.

You receive speaker-labeled transcript lines in this format:
[Our User] ...
[Counterpart] ...

Your job is to help OUR USER steer the conversation.

Rules:
- Speak only to OUR USER.
- Keep each response short: at most 2 sentences.
- Prefer the single best next move.
- Whenever useful, include one exact sentence OUR USER can say next, in quotes.
- Flag objections, buying signals, confusion, or openings when relevant.
- Do not rewrite the entire conversation.
- Do not pretend you are on the call.
""".strip(),
)
