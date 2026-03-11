import { useMemo } from 'react';
import type { SpeakerKey, TranscriptMap } from './useLiveCoach';

export type InterleavedEntry = {
  id: string;
  seq: number;
  text: string;
  finished: boolean;
  speaker: SpeakerKey;
  speakerLabel: string;
};

export function useInterleavedTranscripts(
  transcripts: TranscriptMap,
  labels: Record<SpeakerKey, string>
): InterleavedEntry[] {
  return useMemo(() => {
    const entries: InterleavedEntry[] = [];

    for (const speaker of ['ourUser', 'counterpart'] as SpeakerKey[]) {
      for (const entry of transcripts[speaker]) {
        entries.push({
          ...entry,
          speaker,
          speakerLabel: labels[speaker],
        });
      }
    }

    return entries.sort((a, b) => a.seq - b.seq);
  }, [transcripts, labels]);
}
