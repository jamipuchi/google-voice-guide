import { useEffect, useRef, useState } from 'react';

export type TranscriptEntry = {
  id: string;
  seq: number;
  text: string;
  finished: boolean;
};

export type DeviceOption = {
  deviceId: string;
  label: string;
};

export type SpeakerKey = 'ourUser' | 'counterpart';
export type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'stopped' | 'error';

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

export type SpeakerLabels = Record<SpeakerKey, string>;
export type DeviceSelections = Record<SpeakerKey, string>;
export type TranscriptMap = Record<SpeakerKey, TranscriptEntry[]>;
type AudioCaptureMap = Record<SpeakerKey, AudioCapture | null>;

export const speakers: SpeakerKey[] = ['ourUser', 'counterpart'];

export type LiveCoachContext = {
  ourUser: string;
  counterpart: string;
  goal: string;
  context: string;
};

export const defaultContext: LiveCoachContext = {
  ourUser: 'Sales rep',
  counterpart: 'Prospect',
  goal: 'Understand pain points and secure a concrete next step',
  context:
    'Capture each participant on a separate audio source. Coach our user with the best next move after each important turn.',
};

function buildWebSocketUrl() {
  const configuredUrl = import.meta.env.VITE_ADK_WS_URL;
  if (configuredUrl) return configuredUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://localhost:8001/ws/live-coach`;
}

function joinUint8Arrays(chunks: Uint8Array[]) {
  const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
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
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export type ContactFields = {
  name: string;
  phone: string;
  email: string;
  location: string;
  notes: string;
  serviceType: string;
  package: string;
  pipeline: string;
  registryId: string;
  dealOwner: string;
  contractorName: string;
  dealValue: string;
  dealStage: string;
};

export const defaultContactFields: ContactFields = {
  name: 'Dácil - Suegra',
  phone: '+34 616 32 12 90',
  email: '',          // to be filled by AI
  location: '',       // to be filled by AI
  notes: '',
  serviceType: '',    // to be filled by AI
  package: '',        // to be filled by AI
  pipeline: 'LucIA',
  registryId: '493183264963',
  dealOwner: 'Jordi V.',
  contractorName: 'Dácil',
  dealValue: '',      // to be filled by AI
  dealStage: '',      // to be filled by AI
};

export type UseLiveCoachOptions = {
  initialContext?: Partial<LiveCoachContext>;
  initialFields?: Partial<ContactFields>;
};

export function useLiveCoach(options?: UseLiveCoachOptions) {
  const [context, setContext] = useState<LiveCoachContext>({
    ...defaultContext,
    ...options?.initialContext,
  });
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [deviceSelections, setDeviceSelections] = useState<DeviceSelections>({
    ourUser: '',
    counterpart: '',
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState(
    'Choose one input for each participant and start the two-channel coach.'
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [speakerTranscripts, setSpeakerTranscripts] = useState<TranscriptMap>({
    ourUser: [],
    counterpart: [],
  });
  const [coachTranscript, setCoachTranscript] = useState<TranscriptEntry[]>([]);
  const [adkHealth, setAdkHealth] = useState<'loading' | 'ok' | 'offline'>('loading');
  const [transcriberModel, setTranscriberModel] = useState('');
  const [coachModel, setCoachModel] = useState('');
  const [contactFields, setContactFields] = useState<ContactFields>({
    ...defaultContactFields,
    ...options?.initialFields,
  });
  // Tracks which fields were recently updated by the AI (for animation)
  const [aiUpdatedFields, setAiUpdatedFields] = useState<Set<keyof ContactFields>>(new Set());
  // Log of AI field update actions for the right panel
  const [aiActions, setAiActions] = useState<{ id: string; fields: Partial<ContactFields>; ts: number }[]>([]);

  const websocketRef = useRef<WebSocket | null>(null);
  const capturesRef = useRef<AudioCaptureMap>({ ourUser: null, counterpart: null });
  const seqRef = useRef(0);

  const speakerLabels: SpeakerLabels = {
    ourUser: context.ourUser || 'Our user',
    counterpart: context.counterpart || 'Counterpart',
  };

  function nextSeq() {
    seqRef.current += 1;
    return seqRef.current;
  }

  function upsertTranscript(
    previous: TranscriptEntry[],
    text: string,
    finished: boolean
  ): TranscriptEntry[] {
    const trimmed = text.trim();
    if (!trimmed) return previous;

    const next = [...previous];
    const last = next.at(-1);

    if (last && !last.finished) {
      next[next.length - 1] = { ...last, text: trimmed, finished, seq: finished ? last.seq : last.seq };
      return next;
    }

    next.push({ id: crypto.randomUUID(), seq: nextSeq(), text: trimmed, finished });
    return next;
  }

  function flushSpeakerAudio(speaker: SpeakerKey, socket: WebSocket) {
    const capture = capturesRef.current[speaker];
    if (!capture || capture.chunks.length === 0 || socket.readyState !== WebSocket.OPEN) return;

    const joined = joinUint8Arrays(capture.chunks);
    capture.chunks = [];
    capture.chunkBytes = 0;

    if (capture.flushTimer) {
      window.clearTimeout(capture.flushTimer);
      capture.flushTimer = null;
    }

    socket.send(JSON.stringify({ type: 'audio_chunk', speaker, data: bytesToBase64(joined) }));
  }

  function queueSpeakerAudio(speaker: SpeakerKey, chunk: Uint8Array, socket: WebSocket) {
    const capture = capturesRef.current[speaker];
    if (!capture) return;

    capture.chunks.push(chunk);
    capture.chunkBytes += chunk.byteLength;

    if (capture.chunkBytes >= 6400) {
      flushSpeakerAudio(speaker, socket);
      return;
    }

    if (capture.flushTimer === null) {
      capture.flushTimer = window.setTimeout(() => flushSpeakerAudio(speaker, socket), 180);
    }
  }

  async function startSpeakerCapture(speaker: SpeakerKey, deviceId: string, socket: WebSocket) {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        deviceId: { exact: deviceId },
      },
    });
    const audioContext = new AudioContext({ sampleRate: 16000 });
    await audioContext.audioWorklet.addModule('/audio-recorder-worklet.js');

    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    const workletNode = new AudioWorkletNode(audioContext, 'pcm-recorder-processor');
    const sinkNode = audioContext.createGain();
    sinkNode.gain.value = 0;

    workletNode.port.onmessage = (event) => {
      queueSpeakerAudio(speaker, new Uint8Array(event.data as ArrayBuffer), socket);
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
      flushTimer: null,
    };
  }

  async function stopAllCaptures() {
    const captures = capturesRef.current;
    await Promise.all(
      speakers.map(async (speaker) => {
        const capture = captures[speaker];
        if (!capture) return;
        if (capture.flushTimer) window.clearTimeout(capture.flushTimer);
        capture.workletNode.disconnect();
        capture.sourceNode.disconnect();
        capture.sinkNode.disconnect();
        capture.mediaStream.getTracks().forEach((t) => t.stop());
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
      setSpeakerTranscripts({ ourUser: [], counterpart: [] });
      setCoachTranscript([]);
      seqRef.current = 0;

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
          fields?: Partial<ContactFields>;
        };

        if (payload.transcriberModel) setTranscriberModel(payload.transcriberModel);
        if (payload.coachModel) setCoachModel(payload.coachModel);

        if (payload.type === 'connected' || payload.type === 'ready') {
          setStatusMessage(payload.message ?? 'Connected.');
          return;
        }

        if (payload.type === 'field_update' && payload.fields) {
          const updatedKeys = Object.keys(payload.fields) as (keyof ContactFields)[];
          setContactFields((prev) => ({ ...prev, ...payload.fields }));
          setAiUpdatedFields(new Set(updatedKeys));
          setAiActions((prev) => [
            ...prev,
            { id: crypto.randomUUID(), fields: payload.fields!, ts: Date.now() },
          ]);
          setTimeout(() => setAiUpdatedFields(new Set()), 2000);
          return;
        }

        if (payload.type === 'speaker_transcript' && payload.speaker && payload.text) {
          setSpeakerTranscripts((current) => ({
            ...current,
            [payload.speaker!]: upsertTranscript(
              current[payload.speaker!],
              payload.text!,
              Boolean(payload.finished)
            ),
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
        setConnectionStatus((current) => (current === 'error' ? 'error' : 'stopped'));
      };

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error('WebSocket connection failed.'));
      });

      socket.send(JSON.stringify({ type: 'context', ...context }));

      await Promise.all([
        startSpeakerCapture('ourUser', ourUserDevice, socket),
        startSpeakerCapture('counterpart', counterpartDevice, socket),
      ]);

      setConnectionStatus('live');
      setStatusMessage('Two speaker feeds are live. Route each participant into its assigned input.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start the live coach.';
      setErrorMessage(message);
      setStatusMessage('Unable to start the two-channel coach.');
      await stopSession('error');
    }
  }

  async function loadAudioDevices() {
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionStream.getTracks().forEach((t) => t.stop());

    const audioInputs = (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Input ${i + 1}` }));

    setDevices(audioInputs);
    setDeviceSelections((current) => ({
      ourUser: current.ourUser || audioInputs[0]?.deviceId || '',
      counterpart: current.counterpart || audioInputs[1]?.deviceId || audioInputs[0]?.deviceId || '',
    }));
  }

  // ADK health check
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const base = import.meta.env.VITE_ADK_HTTP_URL || 'http://localhost:8001';
      try {
        const res = await fetch(`${base}/health`);
        if (!res.ok) throw new Error();
        const payload = (await res.json()) as { transcriberModel?: string; coachModel?: string };
        if (cancelled) return;
        setAdkHealth('ok');
        if (payload.transcriberModel) setTranscriberModel(payload.transcriberModel);
        if (payload.coachModel) setCoachModel(payload.coachModel);
      } catch {
        if (!cancelled) setAdkHealth('offline');
      }
    }
    void check();
    return () => { cancelled = true; };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { void stopSession('stopped'); };
  }, []);

  function updateField(field: keyof ContactFields, value: string) {
    setContactFields((prev) => ({ ...prev, [field]: value }));
  }

  return {
    // State
    context,
    setContext,
    devices,
    deviceSelections,
    setDeviceSelections,
    connectionStatus,
    statusMessage,
    errorMessage,
    speakerTranscripts,
    coachTranscript,
    adkHealth,
    transcriberModel,
    coachModel,
    speakerLabels,
    isLive: connectionStatus === 'live',
    contactFields,
    aiUpdatedFields,
    aiActions,

    // Actions
    startSession,
    stopSession,
    loadAudioDevices,
    updateField,
  };
}
