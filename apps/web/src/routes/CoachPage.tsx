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

type SpeakerKey = 'ourUser' | 'counterpart';
type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'stopped' | 'error';

type AudioCapture = {
  audioContext: AudioContext;
  mediaStream: MediaStream;
  sourceNode: MediaStreamAudioSourceNode;
  workletNode: AudioWorkletNode;
  sinkNode: GainNode;
  chunks: Uint8Array[];
  chunkBytes: number;
  flushTimer: number | null;
};

type SpeakerLabels = Record<SpeakerKey, string>;
type DeviceSelections = Record<SpeakerKey, string>;
type TranscriptMap = Record<SpeakerKey, TranscriptEntry[]>;
type AudioCaptureMap = Record<SpeakerKey, AudioCapture | null>;

const speakers: SpeakerKey[] = ['ourUser', 'counterpart'];

const defaultContext = {
  ourUser: 'Sales rep',
  counterpart: 'Prospect',
  goal: 'Understand pain points and secure a concrete next step',
  context:
    'Capture each participant on a separate audio source. Coach our user with the best next move after each important turn.'
};

function buildWebSocketUrl() {
  const configuredUrl = import.meta.env.VITE_ADK_WS_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://localhost:8001/ws/live-coach`;
}

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
  const lastEntry = next.at(-1);

  if (lastEntry && !lastEntry.finished) {
    next[next.length - 1] = {
      ...lastEntry,
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

function joinUint8Arrays(chunks: Uint8Array[]) {
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const joined = new Uint8Array(totalBytes);
  let offset = 0;

  chunks.forEach((chunk) => {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return joined;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

function SectionHeader({
  eyebrow,
  title,
  count
}: {
  eyebrow: string;
  title: string;
  count: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-2xl font-black text-ink">{title}</h3>
      </div>
      <span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-coral">
        {count}
      </span>
    </div>
  );
}

export default function CoachPage() {
  const healthQuery = trpc.health.useQuery();

  const [context, setContext] = useState(defaultContext);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [deviceSelections, setDeviceSelections] = useState<DeviceSelections>({
    ourUser: '',
    counterpart: ''
  });
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState(
    'Choose one input for each participant and start the two-channel coach.'
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [speakerTranscripts, setSpeakerTranscripts] = useState<TranscriptMap>({
    ourUser: [],
    counterpart: []
  });
  const [coachTranscript, setCoachTranscript] = useState<TranscriptEntry[]>([]);
  const [transcriberModel, setTranscriberModel] = useState('');
  const [coachModel, setCoachModel] = useState('');

  const websocketRef = useRef<WebSocket | null>(null);
  const capturesRef = useRef<AudioCaptureMap>({
    ourUser: null,
    counterpart: null
  });

  const transcriptCounts = useMemo(
    () => ({
      ourUser: speakerTranscripts.ourUser.filter((entry) => entry.finished).length,
      counterpart: speakerTranscripts.counterpart.filter((entry) => entry.finished)
        .length,
      coach: coachTranscript.filter((entry) => entry.finished).length
    }),
    [coachTranscript, speakerTranscripts]
  );

  const speakerLabels: SpeakerLabels = {
    ourUser: context.ourUser || 'Our user',
    counterpart: context.counterpart || 'Counterpart'
  };

  async function loadAudioDevices() {
    const permissionStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });
    permissionStream.getTracks().forEach((track) => track.stop());

    const audioInputs = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Input ${index + 1}`
      }));

    setDevices(audioInputs);
    setDeviceSelections((current) => ({
      ourUser: current.ourUser || audioInputs[0]?.deviceId || '',
      counterpart: current.counterpart || audioInputs[1]?.deviceId || audioInputs[0]?.deviceId || ''
    }));
  }

  function flushSpeakerAudio(speaker: SpeakerKey, socket: WebSocket) {
    const capture = capturesRef.current[speaker];
    if (!capture || capture.chunks.length === 0 || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const joined = joinUint8Arrays(capture.chunks);
    capture.chunks = [];
    capture.chunkBytes = 0;

    if (capture.flushTimer) {
      window.clearTimeout(capture.flushTimer);
      capture.flushTimer = null;
    }

    socket.send(
      JSON.stringify({
        type: 'audio_chunk',
        speaker,
        data: bytesToBase64(joined)
      })
    );
  }

  function queueSpeakerAudio(
    speaker: SpeakerKey,
    chunk: Uint8Array,
    socket: WebSocket
  ) {
    const capture = capturesRef.current[speaker];
    if (!capture) {
      return;
    }

    capture.chunks.push(chunk);
    capture.chunkBytes += chunk.byteLength;

    if (capture.chunkBytes >= 6400) {
      flushSpeakerAudio(speaker, socket);
      return;
    }

    if (capture.flushTimer === null) {
      capture.flushTimer = window.setTimeout(() => {
        flushSpeakerAudio(speaker, socket);
      }, 180);
    }
  }

  async function startSpeakerCapture(
    speaker: SpeakerKey,
    deviceId: string,
    socket: WebSocket
  ) {
    const audioConstraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      deviceId: { exact: deviceId }
    };

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints
    });
    const audioContext = new AudioContext({ sampleRate: 16000 });
    await audioContext.audioWorklet.addModule('/audio-recorder-worklet.js');

    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    const workletNode = new AudioWorkletNode(
      audioContext,
      'pcm-recorder-processor'
    );
    const sinkNode = audioContext.createGain();
    sinkNode.gain.value = 0;

    workletNode.port.onmessage = (event) => {
      queueSpeakerAudio(
        speaker,
        new Uint8Array(event.data as ArrayBuffer),
        socket
      );
    };

    sourceNode.connect(workletNode);
    workletNode.connect(sinkNode);
    sinkNode.connect(audioContext.destination);

    capturesRef.current[speaker] = {
      audioContext,
      mediaStream,
      sourceNode,
      workletNode,
      sinkNode,
      chunks: [],
      chunkBytes: 0,
      flushTimer: null
    };
  }

  async function stopAllCaptures() {
    const captures = capturesRef.current;

    await Promise.all(
      speakers.map(async (speaker) => {
        const capture = captures[speaker];
        if (!capture) {
          return;
        }

        if (capture.flushTimer) {
          window.clearTimeout(capture.flushTimer);
        }

        capture.workletNode.disconnect();
        capture.sourceNode.disconnect();
        capture.sinkNode.disconnect();
        capture.mediaStream.getTracks().forEach((track) => track.stop());
        await capture.audioContext.close();
        captures[speaker] = null;
      })
    );
  }

  async function stopSession(nextStatus: ConnectionStatus = 'stopped') {
    websocketRef.current?.close();
    websocketRef.current = null;
    await stopAllCaptures();
    setConnectionStatus(nextStatus);
  }

  async function startSession() {
    try {
      setErrorMessage('');
      setStatusMessage('Connecting to the two-channel live coach...');
      setConnectionStatus('connecting');
      setSpeakerTranscripts({
        ourUser: [],
        counterpart: []
      });
      setCoachTranscript([]);

      await loadAudioDevices();

      const ourUserDevice = deviceSelections.ourUser;
      const counterpartDevice = deviceSelections.counterpart;

      if (!ourUserDevice || !counterpartDevice) {
        throw new Error('Select one audio input for each participant.');
      }

      const socket = new WebSocket(buildWebSocketUrl());
      websocketRef.current = socket;

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as {
          type: string;
          speaker?: SpeakerKey;
          text?: string;
          finished?: boolean;
          message?: string;
          transcriberModel?: string;
          coachModel?: string;
        };

        if (payload.transcriberModel) {
          setTranscriberModel(payload.transcriberModel);
        }

        if (payload.coachModel) {
          setCoachModel(payload.coachModel);
        }

        if (payload.type === 'connected' || payload.type === 'ready') {
          setStatusMessage(payload.message ?? 'Connected.');
          return;
        }

        if (payload.type === 'speaker_transcript' && payload.speaker && payload.text) {
          setSpeakerTranscripts((current) => ({
            ...current,
            [payload.speaker!]: upsertTranscript(
              current[payload.speaker!],
              payload.text!,
              Boolean(payload.finished)
            )
          }));
          return;
        }

        if (payload.type === 'coach_suggestion' && payload.text) {
          setCoachTranscript((entries) =>
            upsertTranscript(entries, payload.text!, Boolean(payload.finished))
          );
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
        setConnectionStatus((current) =>
          current === 'error' ? 'error' : 'stopped'
        );
      };

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error('WebSocket connection failed.'));
      });

      socket.send(
        JSON.stringify({
          type: 'context',
          ...context
        })
      );

      await Promise.all([
        startSpeakerCapture('ourUser', ourUserDevice, socket),
        startSpeakerCapture('counterpart', counterpartDevice, socket)
      ]);

      setConnectionStatus('live');
      setStatusMessage(
        'Two speaker feeds are live. Route each participant into its assigned input.'
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to start the live coach.';
      setErrorMessage(message);
      setStatusMessage('Unable to start the two-channel coach.');
      await stopSession('error');
    }
  }

  useEffect(() => {
    return () => {
      void stopSession('stopped');
    };
  }, []);

  return (
    <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <article className="rounded-[2rem] bg-ink p-8 text-sand shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-gold">
          Speaker-Aware Call Coach
        </p>
        <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          Run one isolated input per participant, then coach our user from the
          labeled transcript stream.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-sand/80">
          This design separates the conversation into two audio channels. Each
          channel is transcribed independently, and the coach reacts to
          speaker-labeled turns instead of a mixed microphone feed.
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
              Models
            </p>
            <p className="mt-2 text-sm font-semibold text-white/90">
              {transcriberModel || 'Connect to load transcriber'}
            </p>
            <p className="mt-1 text-sm font-semibold text-white/70">
              {coachModel || 'Connect to load coach'}
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

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-6 text-sand/80">
          Best results come from real channel separation.
          Use two USB headsets, a mixer/interface with two inputs, or virtual
          routing that exposes each participant as a distinct browser input.
        </div>
      </article>

      <article className="rounded-[2rem] border border-black/5 bg-white/75 p-8 shadow-panel backdrop-blur">
        <h3 className="text-xl font-black text-ink">Two-channel setup</h3>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/60">
              Our user label
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
              Counterpart label
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

          {speakers.map((speaker) => (
            <div key={speaker} className="grid gap-2">
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/60">
                {speakerLabels[speaker]} input
              </span>
              <select
                className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-teal"
                value={deviceSelections[speaker]}
                onChange={(event) =>
                  setDeviceSelections((current) => ({
                    ...current,
                    [speaker]: event.target.value
                  }))
                }
              >
                {devices.length === 0 ? (
                  <option value="">Click refresh to load inputs</option>
                ) : null}
                {devices.map((device) => (
                  <option key={`${speaker}-${device.deviceId}`} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-sand"
              onClick={() => void loadAudioDevices()}
            >
              Refresh devices
            </button>
            <button
              type="button"
              className="rounded-full bg-teal px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:bg-teal/50"
              disabled={connectionStatus === 'connecting' || connectionStatus === 'live'}
              onClick={() => void startSession()}
            >
              {connectionStatus === 'live'
                ? 'Running'
                : 'Start two-channel coach'}
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
        <SectionHeader
          eyebrow="Participant One"
          title={speakerLabels.ourUser}
          count={`${transcriptCounts.ourUser} turns`}
        />

        <div className="mt-6 flex max-h-[26rem] flex-col gap-3 overflow-y-auto pr-2">
          {speakerTranscripts.ourUser.length === 0 ? (
            <p className="rounded-2xl bg-sand p-4 text-sm leading-6 text-ink/70">
              The isolated transcript for {speakerLabels.ourUser} will appear here.
            </p>
          ) : (
            speakerTranscripts.ourUser.map((entry) => (
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

      <article className="rounded-[2rem] border border-black/5 bg-white/75 p-8 shadow-panel backdrop-blur">
        <SectionHeader
          eyebrow="Participant Two"
          title={speakerLabels.counterpart}
          count={`${transcriptCounts.counterpart} turns`}
        />

        <div className="mt-6 flex max-h-[26rem] flex-col gap-3 overflow-y-auto pr-2">
          {speakerTranscripts.counterpart.length === 0 ? (
            <p className="rounded-2xl bg-sand p-4 text-sm leading-6 text-ink/70">
              The isolated transcript for {speakerLabels.counterpart} will appear here.
            </p>
          ) : (
            speakerTranscripts.counterpart.map((entry) => (
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

      <article className="rounded-[2rem] bg-gradient-to-br from-teal to-ink p-8 text-white shadow-panel lg:col-span-2">
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
            {transcriptCounts.coach} responses
          </span>
        </div>

        <div className="mt-6 flex max-h-[24rem] flex-col gap-3 overflow-y-auto pr-2">
          {coachTranscript.length === 0 ? (
            <p className="rounded-2xl bg-white/10 p-4 text-sm leading-6 text-white/80">
              Once both channels start transcribing, the coach will respond to the
              labeled conversation here.
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
