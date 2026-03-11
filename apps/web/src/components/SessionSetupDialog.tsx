import { useEffect, useRef } from 'react';
import { Button } from '@/ui/components/Button';
import { Badge } from '@/ui/components/Badge';
import { FeatherMic, FeatherRefreshCw, FeatherPlay } from '@subframe/core';
import type {
  DeviceOption,
  DeviceSelections,
  SpeakerKey,
  LiveCoachContext,
} from '@/hooks/useLiveCoach';
import { speakers } from '@/hooks/useLiveCoach';

type SessionSetupDialogProps = {
  open: boolean;
  onClose: () => void;
  devices: DeviceOption[];
  deviceSelections: DeviceSelections;
  onDeviceChange: (speaker: SpeakerKey, deviceId: string) => void;
  context: LiveCoachContext;
  onContextChange: (patch: Partial<LiveCoachContext>) => void;
  adkHealth: 'loading' | 'ok' | 'offline';
  onRefreshDevices: () => void;
  onStart: () => void;
  isConnecting: boolean;
};

export default function SessionSetupDialog({
  open,
  onClose,
  devices,
  deviceSelections,
  onDeviceChange,
  context,
  onContextChange,
  adkHealth,
  onRefreshDevices,
  onStart,
  isConnecting,
}: SessionSetupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const speakerLabels: Record<SpeakerKey, string> = {
    ourUser: context.ourUser || 'Nuestro usuario',
    counterpart: context.counterpart || 'Contraparte',
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-full max-w-lg rounded-lg border border-solid border-neutral-border bg-default-background p-0 shadow-lg backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-5 px-6 py-6">
        <div className="flex items-center justify-between">
          <span className="text-heading-2 font-heading-2 text-default-font">
            Configurar llamada
          </span>
          <Badge
            variant={adkHealth === 'ok' ? 'success' : adkHealth === 'loading' ? 'neutral' : 'error'}
          >
            {adkHealth === 'ok' ? 'ADK online' : adkHealth === 'loading' ? 'Verificando...' : 'ADK offline'}
          </Badge>
        </div>

        <div className="flex h-px w-full bg-neutral-200" />

        <label className="flex flex-col gap-1.5">
          <span className="text-caption-bold font-caption-bold text-subtext-color">
            Etiqueta nuestro usuario
          </span>
          <input
            className="rounded-md border border-solid border-neutral-border bg-default-background px-3 py-2 text-body font-body text-default-font outline-none focus:border-brand-primary"
            value={context.ourUser}
            onChange={(e) => onContextChange({ ourUser: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption-bold font-caption-bold text-subtext-color">
            Etiqueta contraparte
          </span>
          <input
            className="rounded-md border border-solid border-neutral-border bg-default-background px-3 py-2 text-body font-body text-default-font outline-none focus:border-brand-primary"
            value={context.counterpart}
            onChange={(e) => onContextChange({ counterpart: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption-bold font-caption-bold text-subtext-color">
            Objetivo de la llamada
          </span>
          <input
            className="rounded-md border border-solid border-neutral-border bg-default-background px-3 py-2 text-body font-body text-default-font outline-none focus:border-brand-primary"
            value={context.goal}
            onChange={(e) => onContextChange({ goal: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-caption-bold font-caption-bold text-subtext-color">
            Contexto adicional
          </span>
          <textarea
            className="min-h-[80px] rounded-md border border-solid border-neutral-border bg-default-background px-3 py-2 text-body font-body text-default-font outline-none focus:border-brand-primary"
            value={context.context}
            onChange={(e) => onContextChange({ context: e.target.value })}
          />
        </label>

        <div className="flex h-px w-full bg-neutral-200" />

        {speakers.map((speaker) => (
          <label key={speaker} className="flex flex-col gap-1.5">
            <span className="text-caption-bold font-caption-bold text-subtext-color">
              Micrófono — {speakerLabels[speaker]}
            </span>
            <select
              className="rounded-md border border-solid border-neutral-border bg-default-background px-3 py-2 text-body font-body text-default-font outline-none focus:border-brand-primary"
              value={deviceSelections[speaker]}
              onChange={(e) => onDeviceChange(speaker, e.target.value)}
            >
              {devices.length === 0 ? (
                <option value="">Haz clic en refrescar para cargar</option>
              ) : null}
              {devices.map((d) => (
                <option key={`${speaker}-${d.deviceId}`} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="neutral-secondary"
            icon={<FeatherRefreshCw />}
            onClick={onRefreshDevices}
          >
            Refrescar dispositivos
          </Button>
          <Button
            variant="brand-primary"
            icon={<FeatherPlay />}
            disabled={isConnecting || adkHealth === 'offline'}
            onClick={onStart}
          >
            {isConnecting ? 'Conectando...' : 'Iniciar sesión'}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
