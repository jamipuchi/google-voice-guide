"use client";

import React, { useEffect, useRef, useState } from "react";
import { Avatar } from "@/ui/components/Avatar";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { DropdownMenu } from "@/ui/components/DropdownMenu";
import { IconButton } from "@/ui/components/IconButton";
import { IconWithBackground } from "@/ui/components/IconWithBackground";
import { TextArea } from "@/ui/components/TextArea";
import {
  FeatherAlertCircle,
  FeatherBriefcase,
  FeatherCalendar,
  FeatherCheckCircle,
  FeatherChevronDown,
  FeatherClipboard,
  FeatherCopy,
  FeatherEdit2,
  FeatherFileText,
  FeatherHash,
  FeatherInfo,
  FeatherMail,
  FeatherMapPin,
  FeatherMessageSquare,
  FeatherMoreHorizontal,
  FeatherPhone,
  FeatherPhoneCall,
  FeatherPhoneOff,
  FeatherSend,
  FeatherSettings,
  FeatherSparkles,
  FeatherTrash,
  FeatherUser,
  FeatherUsers,
  FeatherZap,
} from "@subframe/core";
import * as SubframeCore from "@subframe/core";

import { useLiveCoach } from "@/hooks/useLiveCoach";
import type { ContactFields } from "@/hooks/useLiveCoach";
import { useCallTimer } from "@/hooks/useCallTimer";
import { useInterleavedTranscripts } from "@/hooks/useInterleavedTranscripts";
import SessionSetupDialog from "@/components/SessionSetupDialog";
import EditableField from "@/components/EditableField";

export default function ContactDetailPage() {
  const [setupOpen, setSetupOpen] = useState(false);

  const coach = useLiveCoach();
  const timer = useCallTimer(coach.isLive);
  const interleaved = useInterleavedTranscripts(
    coach.speakerTranscripts,
    coach.speakerLabels
  );
  const fields = coach.contactFields;
  const aiFields = coach.aiUpdatedFields;
  const aiActions = coach.aiActions;

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [interleaved]);

  function handleStartSession() {
    setSetupOpen(false);
    void coach.startSession();
  }

  function f(key: keyof ContactFields) {
    return {
      value: fields[key],
      onChange: (v: string) => coach.updateField(key, v),
      animateChanges: aiFields.has(key),
    };
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-start bg-neutral-50">
      {/* Header */}
      <div className="sticky top-0 z-20 flex w-full items-center justify-between border-b border-solid border-neutral-border bg-default-background/95 px-6 py-4 backdrop-blur mobile:px-4 mobile:py-4">
        <span className="text-heading-3 font-heading-3 text-default-font">
          Coach en vivo
        </span>
        <div className="flex items-center gap-2">
          {coach.isLive ? (
            <Button
              variant="destructive-primary"
              icon={<FeatherPhoneOff />}
              onClick={() => void coach.stopSession("stopped")}
            >
              Detener
            </Button>
          ) : (
            <Button
              variant="brand-primary"
              icon={<FeatherPhoneCall />}
              disabled={coach.connectionStatus === "connecting"}
              onClick={() => setSetupOpen(true)}
            >
              {coach.connectionStatus === "connecting"
                ? "Conectando..."
                : "Iniciar llamada"}
            </Button>
          )}
          <SubframeCore.DropdownMenu.Root>
            <SubframeCore.DropdownMenu.Trigger asChild={true}>
              <Button
                variant="brand-tertiary"
                iconRight={<FeatherChevronDown />}
              >
                Acciones
              </Button>
            </SubframeCore.DropdownMenu.Trigger>
            <SubframeCore.DropdownMenu.Portal>
              <SubframeCore.DropdownMenu.Content
                side="bottom"
                align="end"
                sideOffset={4}
                asChild={true}
              >
                <DropdownMenu>
                  <DropdownMenu.DropdownItem
                    icon={<FeatherSettings />}
                    onClick={() => setSetupOpen(true)}
                  >
                    Configurar llamada
                  </DropdownMenu.DropdownItem>
                  <DropdownMenu.DropdownItem icon={<FeatherEdit2 />}>
                    Editar
                  </DropdownMenu.DropdownItem>
                  <DropdownMenu.DropdownItem icon={<FeatherCopy />}>
                    Duplicar
                  </DropdownMenu.DropdownItem>
                  <DropdownMenu.DropdownItem icon={<FeatherTrash />}>
                    Eliminar
                  </DropdownMenu.DropdownItem>
                </DropdownMenu>
              </SubframeCore.DropdownMenu.Content>
            </SubframeCore.DropdownMenu.Portal>
          </SubframeCore.DropdownMenu.Root>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex w-full flex-1 items-start gap-6 mobile:flex-col mobile:flex-nowrap mobile:gap-6">
        {coach.isLoadingFields && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-brand-primary border-t-transparent" />
              <span className="text-body-bold font-body-bold text-brand-700">Cargando contacto...</span>
            </div>
          </div>
        )}
        {/* Left column */}
        <div className="flex w-1/2 flex-col items-start gap-6 px-6 py-6 mobile:h-auto mobile:w-full mobile:flex-none mobile:px-4 mobile:py-4">
          {/* Contact info card */}
          <div className="flex w-full flex-col items-start gap-6 rounded-lg border border-solid border-neutral-border bg-default-background px-6 py-6 shadow-sm mobile:px-4 mobile:py-4">
            <div className="flex w-full items-center gap-2">
              <IconWithBackground
                variant="brand"
                size="small"
                icon={<FeatherUser />}
              />
              <span className="text-heading-3 font-heading-3 text-default-font">
                Información Básica
              </span>
            </div>
            <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-200" />
            <div className="flex w-full items-start gap-4 mobile:flex-col mobile:flex-nowrap mobile:gap-4">
              <Avatar
                size="x-large"
                image="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face"
              >
                {fields.name ? fields.name.slice(0, 2).toUpperCase() : '??'}
              </Avatar>
              <div className="flex grow shrink-0 basis-0 flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-heading-2 font-heading-2 text-default-font">
                    <EditableField
                      {...f("name")}
                      inputClassName="text-heading-2 font-heading-2"
                    />
                  </span>
                </div>
                <span className="text-caption font-caption text-subtext-color">
                  Contacto principal
                </span>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-start gap-6 mobile:flex-col mobile:flex-nowrap mobile:gap-4">
              <div className="flex min-w-[192px] grow shrink-0 basis-0 flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <FeatherPhone className="text-body font-body text-subtext-color" />
                  <span className="text-caption font-caption text-subtext-color">
                    Número de teléfono
                  </span>
                </div>
                <span className="text-body-bold font-body-bold text-default-font">
                  <EditableField
                    {...f("phone")}
                    inputClassName="text-body-bold font-body-bold"
                  />
                </span>
              </div>
              <div className="flex min-w-[192px] grow shrink-0 basis-0 flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <FeatherMail className="text-body font-body text-subtext-color" />
                  <span className="text-caption font-caption text-subtext-color">
                    Correo electrónico
                  </span>
                </div>
                <span className="text-body-bold font-body-bold text-default-font">
                  <EditableField
                    {...f("email")}
                    inputClassName="text-body-bold font-body-bold"
                  />
                </span>
              </div>
              <div className="flex min-w-[192px] grow shrink-0 basis-0 flex-col items-start gap-1">
                <div className="flex items-center gap-2">
                  <FeatherMapPin className="text-body font-body text-subtext-color" />
                  <span className="text-caption font-caption text-subtext-color">
                    Ubicación
                  </span>
                </div>
                <span className="text-body-bold font-body-bold text-default-font">
                  <EditableField
                    {...f("location")}
                    inputClassName="text-body-bold font-body-bold"
                  />
                </span>
              </div>
            </div>
            <div className="flex w-full flex-col items-start gap-2">
              <span className="text-caption-bold font-caption-bold text-subtext-color">
                Notas del agente
              </span>
              <TextArea className="h-auto w-full flex-none" label="" helpText="">
                <TextArea.Input
                  placeholder="Añadir notas sobre este contacto..."
                  value={fields.notes}
                  onChange={(e) => coach.updateField("notes", e.target.value)}
                />
              </TextArea>
            </div>
          </div>

          {/* Business context card */}
          <div className="flex w-full flex-col items-start gap-6 rounded-lg border border-solid border-neutral-border bg-default-background px-6 py-6 shadow-sm mobile:px-4 mobile:py-4">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <IconWithBackground
                  variant="success"
                  size="small"
                  icon={<FeatherBriefcase />}
                />
                <span className="text-heading-3 font-heading-3 text-default-font">
                  Contexto del Negocio
                </span>
              </div>
              <Badge variant="brand" icon={<FeatherCalendar />}>
                <EditableField
                  {...f("dealStage")}
                  inputClassName="text-caption font-caption"
                />
              </Badge>
            </div>
            <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-200" />
            <div className="flex w-full flex-wrap items-start gap-6 mobile:flex-col mobile:flex-nowrap mobile:gap-4">
              <div className="flex min-w-[192px] grow shrink-0 basis-0 flex-col items-start gap-4 rounded-md bg-neutral-50 px-4 py-4">
                <span className="text-caption-bold font-caption-bold text-subtext-color">
                  TIPO DE SERVICIO
                </span>
                <span className="text-heading-3 font-heading-3 text-default-font">
                  <EditableField
                    {...f("serviceType")}
                    inputClassName="text-heading-3 font-heading-3"
                  />
                </span>
              </div>
              <div className="flex min-w-[192px] grow shrink-0 basis-0 flex-col items-start gap-4 rounded-md bg-neutral-50 px-4 py-4">
                <span className="text-caption-bold font-caption-bold text-subtext-color">
                  PAQUETE
                </span>
                <EditableField
                  {...f("package")}
                  className="text-caption font-caption"
                  inputClassName="text-caption font-caption"
                />
              </div>
              <div className="flex min-w-[192px] grow shrink-0 basis-0 flex-col items-start gap-4 rounded-md bg-neutral-50 px-4 py-4">
                <span className="text-caption-bold font-caption-bold text-subtext-color">
                  PIPELINE
                </span>
                <span className="text-heading-3 font-heading-3 text-default-font">
                  <EditableField
                    {...f("pipeline")}
                    inputClassName="text-heading-3 font-heading-3"
                  />
                </span>
              </div>
            </div>
            <div className="flex w-full flex-col items-start gap-4">
              <span className="text-body-bold font-body-bold text-default-font">
                Detalles del negocio
              </span>
              <div className="flex w-full flex-col items-start gap-3">
                <div className="flex w-full items-center justify-between rounded-md border border-solid border-neutral-border bg-default-background px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FeatherHash className="text-body font-body text-subtext-color" />
                    <span className="text-body font-body text-subtext-color">
                      ID de registro
                    </span>
                  </div>
                  <span className="text-body-bold font-body-bold text-default-font">
                    <EditableField
                      {...f("registryId")}
                      inputClassName="text-body-bold font-body-bold text-right"
                    />
                  </span>
                </div>
                <div className="flex w-full items-center justify-between rounded-md border border-solid border-neutral-border bg-default-background px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FeatherUser className="text-body font-body text-subtext-color" />
                    <span className="text-body font-body text-subtext-color">
                      Propietario del negocio
                    </span>
                  </div>
                  <span className="text-body-bold font-body-bold text-default-font">
                    <EditableField
                      {...f("dealOwner")}
                      inputClassName="text-body-bold font-body-bold text-right"
                    />
                  </span>
                </div>
                <div className="flex w-full items-center justify-between rounded-md border border-solid border-neutral-border bg-default-background px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FeatherUsers className="text-body font-body text-subtext-color" />
                    <span className="text-body font-body text-subtext-color">
                      Nombre del contratante
                    </span>
                  </div>
                  <span className="text-body-bold font-body-bold text-default-font">
                    <EditableField
                      {...f("contractorName")}
                      inputClassName="text-body-bold font-body-bold text-right"
                    />
                  </span>
                </div>
              </div>
            </div>
            <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-200" />
            <div className="flex w-full items-center justify-between rounded-lg border-2 border-solid border-brand-200 bg-brand-50 px-6 py-5 mobile:flex-col mobile:flex-nowrap mobile:items-start mobile:justify-start mobile:gap-4">
              <div className="flex flex-col items-start gap-1">
                <span className="text-caption-bold font-caption-bold text-brand-700">
                  VALOR DEL NEGOCIO
                </span>
                <span className="text-caption font-caption text-brand-600">
                  Precio total del servicio
                </span>
              </div>
              <span className="text-heading-1 font-heading-1 text-brand-700">
                <EditableField
                  {...f("dealValue")}
                  inputClassName="text-heading-1 font-heading-1 text-brand-700 text-right"
                />
              </span>
            </div>
            <div className="flex w-full flex-wrap items-center justify-between mobile:flex-col mobile:flex-nowrap mobile:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <IconButton icon={<FeatherFileText />} />
                <IconButton icon={<FeatherMail />} />
                <IconButton icon={<FeatherPhone />} />
                <IconButton icon={<FeatherClipboard />} />
                <IconButton icon={<FeatherCalendar />} />
                <IconButton icon={<FeatherMoreHorizontal />} />
              </div>
              <div className="flex items-center gap-2 mobile:h-auto mobile:w-full mobile:flex-none">
                <Button
                  className="mobile:grow mobile:shrink-0 mobile:basis-0"
                  variant="neutral-secondary"
                >
                  Editar
                </Button>
                <Button
                  className="mobile:grow mobile:shrink-0 mobile:basis-0"
                  variant="brand-primary"
                  icon={<FeatherSend />}
                >
                  Enviar propuesta
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex w-1/2 flex-col items-start gap-6 border-l border-solid border-neutral-border bg-default-background px-6 py-6 mobile:h-auto mobile:w-full mobile:flex-none mobile:px-4 mobile:py-4 mobile:border-l-0 mobile:border-t">
          {/* Live call banner — conditional */}
          {coach.isLive && (
            <div className="flex w-full items-center justify-between rounded-lg border border-solid border-error-100 bg-error-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-3 w-3 flex-none items-start rounded-full bg-error-500 animate-pulse" />
                <span className="text-body-bold font-body-bold text-error-700">
                  Llamada en vivo
                </span>
              </div>
              <span className="text-monospace-body font-monospace-body text-error-700">
                {timer}
              </span>
            </div>
          )}

          {/* Status / error messages */}
          {coach.connectionStatus !== "idle" &&
            coach.connectionStatus !== "live" && (
              <div className="flex w-full items-center gap-2 rounded-lg border border-solid border-neutral-border bg-neutral-50 px-4 py-3">
                <FeatherInfo className="text-body font-body text-subtext-color" />
                <span className="text-caption font-caption text-subtext-color">
                  {coach.statusMessage}
                </span>
              </div>
            )}
          {coach.errorMessage && (
            <div className="flex w-full items-center gap-2 rounded-lg border border-solid border-error-100 bg-error-50 px-4 py-2">
              <FeatherAlertCircle className="text-body font-body text-error-700" />
              <span className="text-caption font-caption text-error-700">
                {coach.errorMessage}
              </span>
            </div>
          )}

          {/* AI Actions log */}
          {aiActions.length > 0 && (
            <div className="flex w-full flex-col items-start gap-3 rounded-lg border border-solid border-brand-200 bg-brand-50 px-4 py-4">
              <div className="flex w-full items-center gap-2">
                <IconWithBackground
                  variant="brand"
                  size="small"
                  icon={<FeatherZap />}
                />
                <span className="text-body-bold font-body-bold text-default-font">
                  Acciones del agente
                </span>
                <span className="ml-auto text-caption font-caption text-subtext-color">
                  {aiActions.length} actualización{aiActions.length !== 1 ? "es" : ""}
                </span>
              </div>
              <div className="flex h-px w-full bg-brand-200" />
              <div className="flex w-full flex-col gap-2">
                {aiActions.map((action) => (
                  <div
                    key={action.id}
                    className="flex w-full items-start gap-2 rounded-md bg-default-background px-3 py-2"
                  >
                    <FeatherZap className="mt-0.5 flex-none text-caption font-caption text-brand-600" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-caption-bold font-caption-bold text-brand-700">
                        update_contact_field
                      </span>
                      <span className="text-caption font-caption text-subtext-color">
                        {Object.entries(action.fields)
                          .map(([k, v]) => `${k}: "${v}"`)
                          .join(" · ")}
                      </span>
                    </div>
                    <span className="ml-auto text-caption font-caption text-subtext-color whitespace-nowrap">
                      {new Date(action.ts).toLocaleTimeString("es-ES", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations panel */}
          <div className="flex w-full flex-col items-start gap-4 rounded-lg border border-solid border-success-200 bg-success-50 px-6 py-6 shadow-sm">
            <div className="flex w-full items-center gap-2">
              <IconWithBackground
                variant="success"
                size="small"
                icon={<FeatherSparkles />}
              />
              <span className="text-heading-3 font-heading-3 text-default-font">
                Recomendaciones del asistente
              </span>
            </div>
            <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-success-200" />
            <div className="flex w-full flex-col items-start gap-3">
              {coach.coachTranscript.length === 0 ? (
                <div className="flex w-full items-start gap-3 rounded-lg bg-default-background px-4 py-3">
                  <IconWithBackground
                    variant="success"
                    size="small"
                    icon={<FeatherInfo />}
                  />
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-body-bold font-body-bold text-default-font">
                      Sin recomendaciones aún
                    </span>
                    <span className="text-caption font-caption text-subtext-color">
                      {coach.isLive
                        ? "El asistente generará sugerencias conforme avance la conversación."
                        : "Inicia una llamada para recibir coaching en tiempo real."}
                    </span>
                  </div>
                </div>
              ) : (
                coach.coachTranscript.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex w-full items-start gap-3 rounded-lg bg-default-background px-4 py-3"
                  >
                    <IconWithBackground
                      variant="success"
                      size="small"
                      icon={<FeatherCheckCircle />}
                    />
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-body font-body text-default-font">
                        {entry.text}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Transcription panel */}
          <div className="flex w-full flex-col items-start gap-4 rounded-lg border border-solid border-neutral-border bg-default-background px-6 py-6 shadow-sm">
            <div className="flex w-full items-center gap-2">
              <IconWithBackground
                variant="neutral"
                size="small"
                icon={<FeatherMessageSquare />}
              />
              <span className="text-heading-3 font-heading-3 text-default-font">
                Transcripción en tiempo real
              </span>
            </div>
            <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-200" />
            <div className="flex max-h-[384px] w-full flex-col items-start gap-4 overflow-auto">
              {interleaved.length === 0 ? (
                <div className="flex w-full flex-col items-start gap-2">
                  <div className="flex w-full items-start rounded-lg bg-neutral-50 px-4 py-3">
                    <span className="text-body font-body text-subtext-color">
                      {coach.isLive
                        ? "Esperando audio..."
                        : "La transcripción aparecerá aquí cuando inicie la llamada."}
                    </span>
                  </div>
                </div>
              ) : (
                interleaved.map((entry) => {
                  const isOurUser = entry.speaker === "ourUser";
                  return (
                    <div
                      key={entry.id}
                      className="flex w-full flex-col items-start gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar
                          variant={isOurUser ? "brand" : "neutral"}
                          size="x-small"
                          image=""
                        >
                          {entry.speakerLabel.charAt(0).toUpperCase()}
                        </Avatar>
                        <span
                          className={`text-caption-bold font-caption-bold ${
                            isOurUser
                              ? "text-brand-600"
                              : "text-default-font"
                          }`}
                        >
                          {entry.speakerLabel}
                        </span>
                        {!entry.finished && (
                          <Badge variant="neutral" icon={null}>
                            ...
                          </Badge>
                        )}
                      </div>
                      <div
                        className={`flex w-full items-start rounded-lg px-4 py-3 ${
                          isOurUser ? "bg-brand-50" : "bg-neutral-50"
                        }`}
                      >
                        <span className="text-body font-body text-default-font">
                          {entry.text}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Setup dialog */}
      <SessionSetupDialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        devices={coach.devices}
        deviceSelections={coach.deviceSelections}
        onDeviceChange={(speaker, deviceId) =>
          coach.setDeviceSelections((prev) => ({ ...prev, [speaker]: deviceId }))
        }
        context={coach.context}
        onContextChange={(patch) =>
          coach.setContext((prev) => ({ ...prev, ...patch }))
        }
        adkHealth={coach.adkHealth}
        onRefreshDevices={() => void coach.loadAudioDevices()}
        onStart={handleStartSession}
        isConnecting={coach.connectionStatus === "connecting"}
      />
    </div>
  );
}
