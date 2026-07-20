"use client";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Keyboard,
  ScanLine,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button, Input, PageHeader } from "@/components/ui/primitives";
import type { CheckInResult } from "./types";
import { ticketLabel } from "./ticket-labels";
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};
declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats?: string[];
    }) => BarcodeDetectorLike;
  }
}
export function TicketCheckIn({ publicationId }: { publicationId: string }) {
  const [token, setToken] = useState("");
  const [working, setWorking] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [result, setResult] = useState<CheckInResult>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | undefined>(undefined);
  const stop = () => {
    if (scanTimer.current) window.clearInterval(scanTimer.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera(false);
  };
  useEffect(() => () => stop(), []);
  const checkIn = async (value = token) => {
    const trimmed = value.trim();
    if (!trimmed || working) return;
    setWorking(true);
    setResult(undefined);
    try {
      const data = await api.post<{
        result: string;
        ticket?: CheckInResult["ticket"];
      }>(`/tickets/publications/${publicationId}/check-in`, {
        token: trimmed,
        accessPoint: "Backoffice web",
        idempotencyKey: crypto.randomUUID(),
      });
      setResult({
        ticket: data.ticket,
        status: data.result,
        valid: data.result === "valid",
        alreadyUsed: data.result === "already_checked_in",
      });
      setToken("");
    } catch (cause) {
      setResult({
        status: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "No se pudo validar la entrada.",
      });
    } finally {
      setWorking(false);
    }
  };
  const confirm = async () => {
    if (!result?.ticket?._id || !result.valid || working) return;
    setWorking(true);
    try {
      const data = await api.post<{
        result: string;
        ticket?: CheckInResult["ticket"];
      }>(`/tickets/publications/${publicationId}/check-in/confirm`, {
        ticketId: result.ticket._id,
        accessPoint: "Backoffice web",
        idempotencyKey: crypto.randomUUID(),
      });
      setResult({
        ticket: data.ticket ?? result.ticket,
        status: data.result,
        valid: false,
        alreadyUsed: data.result === "already_checked_in",
        message:
          data.result === "accepted"
            ? "Ingreso registrado correctamente."
            : undefined,
      });
    } catch (cause) {
      setResult({
        ...result,
        valid: false,
        message:
          cause instanceof Error
            ? cause.message
            : "No se pudo confirmar el ingreso.",
      });
    } finally {
      setWorking(false);
    }
  };
  const start = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
      setCameraError(
        "Este navegador no permite escanear QR. Podés ingresar el código manualmente.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setCamera(true);
      window.setTimeout(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });
        scanTimer.current = window.setInterval(() => {
          if (!videoRef.current || working) return;
          void detector
            .detect(videoRef.current)
            .then((codes) => {
              const value = codes[0]?.rawValue;
              if (value) {
                stop();
                void checkIn(value);
              }
            })
            .catch(() => undefined);
        }, 700);
      }, 0);
    } catch {
      setCameraError(
        "No se pudo acceder a la cámara. Revisá los permisos o ingresá el código manualmente.",
      );
    }
  };
  return (
    <section className="space-y-6">
      <PageHeader
        title="Control de ingreso"
        description="Validá cada QR contra el servidor antes de permitir el acceso."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border bg-white p-6">
          <h2 className="font-semibold">Escanear QR</h2>
          <p className="mt-1 text-sm text-zinc-500">
            La cámara es opcional; el ingreso manual siempre está disponible.
          </p>
          {camera ? (
            <div className="mt-4 overflow-hidden rounded-2xl bg-zinc-950">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full"
              />
              <Button variant="secondary" className="m-3" onClick={stop}>
                Detener cámara
              </Button>
            </div>
          ) : (
            <Button className="mt-4" onClick={() => void start()}>
              <Camera className="mr-2 h-4" />
              Abrir cámara
            </Button>
          )}
          {cameraError ? (
            <p className="mt-3 text-sm text-amber-800">{cameraError}</p>
          ) : null}
        </article>
        <article className="rounded-2xl border bg-white p-6">
          <h2 className="font-semibold">Código manual</h2>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void checkIn();
            }}
          >
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="QR, código de entrada u orden"
              autoComplete="off"
            />
            <Button disabled={working || !token.trim()}>
              <Keyboard className="mr-2 h-4" />
              Validar
            </Button>
          </form>
          <p className="mt-3 text-xs text-zinc-500">
            No se confirma ningún ingreso desde el navegador: el resultado
            proviene de la validación protegida.
          </p>
        </article>
      </div>
      {result ? (
        <article
          className={`rounded-2xl border p-6 ${result.valid ? "border-emerald-200 bg-emerald-50" : result.alreadyUsed ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}
        >
          <div className="flex gap-3">
            {result.valid ? (
              <CheckCircle2 className="h-7 text-emerald-700" />
            ) : (
              <XCircle className="h-7 text-red-700" />
            )}
            <div>
              <h2 className="text-xl font-semibold">
                {result.valid
                  ? "Entrada válida"
                  : result.alreadyUsed
                    ? "Entrada ya utilizada"
                    : "Entrada inválida"}
              </h2>
              <p className="mt-1 text-sm">
                {result.message ||
                  result.ticket?.attendeeName ||
                  result.ticket?.ticketCode ||
                  "Verificá el código e intentá nuevamente."}
              </p>
              {result.ticket ? (
                <p className="mt-2 text-sm">
                  Estado: <b>{ticketLabel(result.ticket.status)}</b>
                </p>
              ) : null}
              {result.valid ? (
                <Button
                  className="mt-4"
                  disabled={working}
                  onClick={() => void confirm()}
                >
                  <CheckCircle2 className="mr-2 h-4" />
                  Confirmar ingreso
                </Button>
              ) : null}
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
