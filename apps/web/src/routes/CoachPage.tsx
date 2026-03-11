import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '../main';

type TranscriptEntry = {
  id: string;
  text: string;
  finished: boolean;
};

type DeviceOption = {
  deviceId: string;
  label: string;
};

type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'stopped' | 'error';

const defaultContext = {
  ourUser: 'Sales rep',
  counterpart: 'Prospect',
  goal: 'Understand pain points and secure a concrete next step',
  context:
    'We help teams automate follow-up work after voice conversations. Recommend what our user should say next and flag objections or buying signals.'
};

function upsertTranscript(
  previous: TranscriptEntry[],
  text: string,
  finished: boolean
): TranscriptEntry[] {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return previous;
  }

  const next = [...previous];
  const unfinishedIndex = [...next]
    .reverse()
    .findIndex((entry) => !entry.finished);
  const targetIndex =
    unfinishedIndex === -1 ? -1 : next.length - 1 - unfinishedIndex;

  if (targetIndex >= 0) {
    const existingEntry = next[targetIndex];
    if (!existingEntry) {
      return previous;
    }

    next[targetIndex] = {
      ...existingEntry,
      text: trimmedText,
      finished
    };
    return next;
  }

  next.push({
    id: crypto.randomUUID(),
    text: trimmedText,
    finished
  });
  return next;
}

function buildWebSocketUrl() {
  const configuredUrl = import.meta.env.VITE_ADK_WS_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://localhost:8001/ws/live-coach`;
}

export default function CoachPage() {
  const healthQuery = trpc.health.useQuery();
  const [context, setContext] = useState(defaultContext);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState(
    'Load your call context, pick an input, and start listening.'
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [callTranscript, setCallTranscript] = useState<TranscriptEntry[]>([]);
  const [coachTranscript, setCoachTranscript] = useState<TranscriptEntry[]>([]);
  const [modelName, setModelName] = useState('');

  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sinkNodeRef = useRef<GainNode | null>(null);

  const transcriptCount = useMemo(
    () => ({
      call: callTranscript.filter((entry) => entry.finished).length,
      coach: coachTranscript.filter((entry) => entry.finished).length
    }),
    [callTranscript, coachTranscript]
  );

  async function loadAudioDevices() {
    const permissionStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    permissionStream.getTracks().forEach((track) => track.stop());

    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = mediaDevices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Input ${index + 1}`
      }));

    setDevices(audioInputs);
    if (!selectedDeviceId && audioInputs[0]) {
      setSelectedDeviceId(audioInputs[0].deviceId);
    }
  }

  async function stopAudioCapture() {
    workletNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    sinkNodeRef.current?.disconnect();

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    workletNodeRef.current = null;
    sourceNodeRef.current = null;
    sinkNodeRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }

  async function stopSession(nextStatus: ConnectionStatus = 'stopped') {
    websocketRef.current?.close();
    websocketRef.current = null;
    await stopAudioCapture();
    setConnectionStatus(nextStatus);
  }

  async function startAudioCapture(socket: WebSocket) {
    const audioConstraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };

    if (selectedDeviceId) {
      audioConstraints.deviceId = { exact: selectedDeviceId };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints
    });

    const audioContext = new AudioContext({ sampleRate: 16000 });
    await audioContext.audioWorklet.addModule('/audio-recorder-worklet.js');

    const sourceNode = audioContext.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(
      audioContext,
      'pcm-recorder-processor'
    );
    const sinkNode = audioContext.createGain();
    sinkNode.gain.value = 0;

    workletNode.port.onmessage = (event) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(event.data);
      }
    };

    sourceNode.connect(workletNode);
    workletNode.connect(sinkNode);
    sinkNode.connect(audioContext.destination);

    mediaStreamRef.current = stream;
    audioContextRef.current = audioContext;
    sourceNodeRef.current = sourceNode;
    workletNodeRef.current = workletNode;
    sinkNodeRef.current = sinkNode;
  }

  async function startSession() {
    try {
      setErrorMessage('');
      setStatusMessage('Connecting to the live coach...');
      setConnectionStatus('connecting');
      setCallTranscript([]);
      setCoachTranscript([]);

      await loadAudioDevices();

      const socket = new WebSocket(buildWebSocketUrl());
      socket.binaryType = 'arraybuffer';

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as {
          type: string;
          text?: string;
          finished?: boolean;
          message?: string;
          model?: string;
        };

        if (payload.model) {
          setModelName(payload.model);
        }

        if (payload.type === 'connected' || payload.type === 'ready') {
          setStatusMessage(payload.message ?? 'Connected.');
          return;
        }

        if (payload.type === 'call_transcript' && payload.text) {
          setCallTranscript((entries) =>
            upsertTranscript(entries, payload.text!, Boolean(payload.finished))
          );
          return;
        }

        if (payload.type === 'coach_transcript' && payload.text) {
          setCoachTranscript((entries) =>
            upsertTranscript(entries, payload.text!, Boolean(payload.finished))
          );
          return;
        }

        if (payload.type === 'turn_state') {
          setStatusMessage('Coach processed the latest speech turn.');
          return;
        }

        if (payload.type === 'error') {
          setErrorMessage(payload.message ?? 'Unknown live coach error.');
          setConnectionStatus('error');
        }
      };

      socket.onerror = () => {
        setErrorMessage('WebSocket connection failed.');
        setConnectionStatus('error');
      };

      socket.onclose = () => {
        setConnectionStatus((currentStatus) =>
          currentStatus === 'error' ? 'error' : 'stopped'
        );
      };

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error('WebSocket connection failed.'));
      });

      websocketRef.current = socket;
      socket.send(
        JSON.stringify({
          type: 'context',
          ...context
        })
      );

      await startAudioCapture(socket);

      setConnectionStatus('live');
      setStatusMessage(
        'Listening live. Put the phone on speaker or route the call into the selected input.'
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to start the live coach.';
      setErrorMessage(message);
      setStatusMessage('Unable to start the live coach.');
      setConnectionStatus('error');
      await stopSession('error');
    }
  }

  useEffect(() => {
    return () => {
      void stopSession('stopped');
    };
  }, []);

  return (
    <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <article className="rounded-[2rem] bg-ink p-8 text-sand shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-gold">
          Live Phone Coach
        </p>
        <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          Listen to a call, surface transcript, and suggest the next move in real
          time.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-sand/80">
          This setup uses Google ADK live streaming with Gemini native audio.
          The agent listens to the selected input device, transcribes the call,
          and generates short coaching suggestions for your user.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/10 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              Node API
            </p>
            <p className="mt-2 text-lg font-bold text-white">
              {healthQuery.data?.status ?? 'loading'}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              Live model
            </p>
            <p className="mt-2 text-sm font-semibold text-white/90">
              {modelName || 'Connect to load model'}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
            Current status
          </p>
          <p className="mt-2 text-lg font-semibold text-white">{statusMessage}</p>
          {errorMessage ? (
            <p className="mt-3 text-sm font-semibold text-coral">{errorMessage}</p>
          ) : null}
        </div>
      </article>

      <article className="rounded-[2rem] border border-black/5 bg-white/75 p-8 shadow-panel backdrop-blur">
        <h3 className="text-xl font-black text-ink">Test setup</h3>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/60">
              Our user
            </span>
            <input
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-teal"
              value={context.ourUser}
              onChange={(event) =>
                setContext((current) => ({
                  ...current,
                  ourUser: event.target.value
                }))
              }
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/60">
              Counterpart
            </span>
            <input
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-teal"
              value={context.counterpart}
              onChange={(event) =>
                setContext((current) => ({
                  ...current,
                  counterpart: event.target.value
                }))
              }
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/60">
              Goal
            </span>
            <input
              className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-teal"
              value={context.goal}
              onChange={(event) =>
                setContext((current) => ({
                  ...current,
                  goal: event.target.value
                }))
              }
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/60">
              Context
            </span>
            <textarea
              className="min-h-32 rounded-3xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-ink outline-none transition focus:border-teal"
              value={context.context}
              onChange={(event) =>
                setContext((current) => ({
                  ...current,
                  context: event.target.value
                }))
              }
            />
          </label>

          <div className="grid gap-2">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/60">
              Input device
            </span>
            <div className="flex gap-3">
              <select
                className="min-w-0 flex-1 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-teal"
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
              >
                {devices.length === 0 ? (
                  <option value="">Click refresh to load inputs</option>
                ) : null}
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-2xl border border-black/10 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-sand"
                onClick={() => void loadAudioDevices()}
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              className="rounded-full bg-teal px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:bg-teal/50"
              disabled={connectionStatus === 'connecting' || connectionStatus === 'live'}
              onClick={() => void startSession()}
            >
              {connectionStatus === 'live' ? 'Listening' : 'Start listening'}
            </button>
            <button
              type="button"
              className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-sand disabled:cursor-not-allowed disabled:text-ink/40"
              disabled={connectionStatus !== 'live' && connectionStatus !== 'connecting'}
              onClick={() => void stopSession('stopped')}
            >
              Stop
            </button>
          </div>
        </div>
      </article>

      <article className="rounded-[2rem] border border-black/5 bg-white/75 p-8 shadow-panel backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
              Call transcript
            </p>
            <h3 className="mt-2 text-2xl font-black text-ink">
              What the microphone hears
            </h3>
          </div>
          <span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-coral">
            {transcriptCount.call} turns
          </span>
        </div>

        <div className="mt-6 flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-2">
          {callTranscript.length === 0 ? (
            <p className="rounded-2xl bg-sand p-4 text-sm leading-6 text-ink/70">
              Live transcription will appear here after you start streaming audio.
            </p>
          ) : (
            callTranscript.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl bg-sand p-4 text-sm leading-6 text-ink"
              >
                {entry.text}
              </div>
            ))
          )}
        </div>
      </article>

      <article className="rounded-[2rem] bg-gradient-to-br from-teal to-ink p-8 text-white shadow-panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              Coach suggestions
            </p>
            <h3 className="mt-2 text-2xl font-black">
              What our user should say next
            </h3>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
            {transcriptCount.coach} responses
          </span>
        </div>

        <div className="mt-6 flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-2">
          {coachTranscript.length === 0 ? (
            <p className="rounded-2xl bg-white/10 p-4 text-sm leading-6 text-white/80">
              Short, transcribed coaching responses from the agent will appear here.
            </p>
          ) : (
            coachTranscript.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl bg-white/10 p-4 text-sm leading-6 text-white"
              >
                {entry.text}
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
