"use client";
import { useRef, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface VoiceMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  seq: number;
}

interface UseVoiceSessionOptions {
  onTurnComplete?: (messages: VoiceMsg[]) => void;
  seqCounterRef: React.MutableRefObject<number>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useVoiceSession({ onTurnComplete, seqCounterRef }: UseVoiceSessionOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceMessages, setVoiceMessages] = useState<VoiceMsg[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Audio / WS pipeline refs
  const wsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const setupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transcription accumulators
  const pendingOutTextRef = useRef("");
  const pendingInTextRef = useRef("");
  const pendingUserMsgIdRef = useRef<string | null>(null);

  // Stable reference to the latest voice messages for use inside WS callbacks
  const voiceMessagesRef = useRef<VoiceMsg[]>([]);

  // ── Gapless audio playback ─────────────────────────────────────────────────
  const scheduleAudio = useCallback((pcm16: Int16Array) => {
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = playCtxRef.current.currentTime;
    }
    const ctx = playCtxRef.current;
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const when = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    src.start(when);
    nextPlayTimeRef.current = when + buffer.duration;
  }, []);

  // ── Stop mic capture ───────────────────────────────────────────────────────
  const stopCapture = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    workletNodeRef.current?.disconnect();
    captureCtxRef.current?.close().catch(() => undefined);
    streamRef.current = null;
    workletNodeRef.current = null;
    captureCtxRef.current = null;
  }, []);

  // ── WebSocket message handler ──────────────────────────────────────────────
  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      let raw: string;
      if (typeof event.data === "string") {
        raw = event.data;
      } else if (event.data instanceof ArrayBuffer) {
        raw = new TextDecoder().decode(event.data);
      } else {
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data.error) {
        setVoiceState("error");
        setVoiceError("Error del modelo. Intenta de nuevo.");
        return;
      }

      if (data.setupComplete !== undefined) {
        if (setupTimeoutRef.current) clearTimeout(setupTimeoutRef.current);
        setVoiceState("listening");
        return;
      }

      const sc = data.serverContent as Record<string, unknown> | undefined;
      if (!sc) return;

      // Audio chunks
      const modelTurn = sc.modelTurn as Record<string, unknown> | undefined;
      const parts = (modelTurn?.parts as Array<Record<string, unknown>>) ?? [];
      for (const part of parts) {
        const inline = part.inlineData as Record<string, unknown> | undefined;
        if (inline?.data && typeof inline.data === "string") {
          setVoiceState("speaking");
          const binary = atob(inline.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
          scheduleAudio(new Int16Array(bytes.buffer));
        }
      }

      // Output transcription (assistant)
      const outT = sc.outputTranscription as Record<string, unknown> | undefined;
      if (outT?.text && typeof outT.text === "string") {
        pendingOutTextRef.current += outT.text;
      }

      // Input transcription (user speech) — show bubble immediately
      const inT = sc.inputTranscription as Record<string, unknown> | undefined;
      if (inT?.text && typeof inT.text === "string") {
        pendingInTextRef.current += inT.text;
        const fullUserText = pendingInTextRef.current.trim();
        if (fullUserText) {
          if (!pendingUserMsgIdRef.current) {
            const msgId = crypto.randomUUID();
            pendingUserMsgIdRef.current = msgId;
            const userMsg: VoiceMsg = {
              id: msgId,
              role: "user",
              text: fullUserText,
              seq: seqCounterRef.current++,
            };
            voiceMessagesRef.current = [...voiceMessagesRef.current, userMsg];
          } else {
            voiceMessagesRef.current = voiceMessagesRef.current.map((m) =>
              m.id === pendingUserMsgIdRef.current ? { ...m, text: fullUserText } : m
            );
          }
          setVoiceMessages([...voiceMessagesRef.current]);
        }
        setVoiceState("thinking");
      }

      // Commit assistant message on turn end
      if (sc.turnComplete === true) {
        const assistantText = pendingOutTextRef.current.trim();
        pendingInTextRef.current = "";
        pendingOutTextRef.current = "";
        pendingUserMsgIdRef.current = null;

        const next = [...voiceMessagesRef.current];
        if (assistantText) {
          next.push({
            id: crypto.randomUUID(),
            role: "assistant",
            text: assistantText,
            seq: seqCounterRef.current++,
          });
        }
        voiceMessagesRef.current = next;
        setVoiceMessages(next);
        onTurnComplete?.(next);
        setVoiceState("listening");
      }
    },
    [scheduleAudio, seqCounterRef, onTurnComplete]
  );

  // ── Stop full session ──────────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    if (setupTimeoutRef.current) clearTimeout(setupTimeoutRef.current);
    wsRef.current?.close();
    wsRef.current = null;
    stopCapture();
    playCtxRef.current?.close().catch(() => undefined);
    playCtxRef.current = null;
    nextPlayTimeRef.current = 0;
    pendingInTextRef.current = "";
    pendingOutTextRef.current = "";
    setVoiceState("idle");
    setVoiceError(null);
  }, [stopCapture]);

  // ── Start session ──────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setVoiceState("connecting");
    setVoiceError(null);
    pendingInTextRef.current = "";
    pendingOutTextRef.current = "";

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        throw new Error(
          "Permiso de micrófono denegado. Actívalo en la configuración del navegador."
        );
      }
      streamRef.current = stream;

      const res = await fetch("/api/voice-session", { method: "POST" });
      if (!res.ok) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(`Error al conectar con el servicio de voz (${res.status})`);
      }
      const { apiKey, model, systemPrompt } = (await res.json()) as {
        apiKey: string;
        model: string;
        systemPrompt: string;
      };
      // All live/bidi models confirmed working on v1alpha.
      // v1beta does NOT support bidiGenerateContent for these models.
      const apiVersion = "v1alpha";
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      const setupTimeout = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
        setVoiceState("error");
        setVoiceError(
          "Tiempo de espera agotado. El modelo no respondió al setup. Revisa la consola."
        );
      }, 12000);
      setupTimeoutRef.current = setupTimeout;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: { parts: [{ text: systemPrompt }] },
            },
          })
        );
      };

      ws.onmessage = handleWsMessage;
      ws.onerror = () => {
        setVoiceState("error");
        setVoiceError("Error de conexión. Intenta de nuevo.");
      };
      ws.onclose = (e) => {
        setVoiceState((prev) => {
          if (prev === "idle" || prev === "error") return prev;
          const reason = e.reason ? ` — ${e.reason}` : "";
          setVoiceError(
            `Sesión de voz cerrada (código ${e.code}${reason}). Intenta de nuevo.`
          );
          return "error";
        });
        stopCapture();
      };

      // Set up AudioWorklet to capture and forward mic audio
      const captureCtx = new AudioContext({ sampleRate: 16000 });
      captureCtxRef.current = captureCtx;
      const actualRate = captureCtx.sampleRate;

      await captureCtx.audioWorklet.addModule("/audio-processor.worklet.js");
      const micSource = captureCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(captureCtx, "pcm-capture");
      workletNodeRef.current = worklet;

      worklet.port.onmessage = ({ data }) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm = new Int16Array(data.pcm as ArrayBuffer);
        const bytes = new Uint8Array(pcm.buffer);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        ws.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                data: btoa(bin),
                mimeType: `audio/pcm;rate=${(data.sampleRate as number) ?? actualRate}`,
              },
            },
          })
        );
      };

      // Silent gain prevents mic feedback while allowing worklet to receive audio
      const silentGain = captureCtx.createGain();
      silentGain.gain.value = 0;
      micSource.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(captureCtx.destination);
    } catch (err) {
      setVoiceState("error");
      setVoiceError(
        err instanceof Error ? err.message : "Error al iniciar el micrófono."
      );
    }
  }, [handleWsMessage, stopCapture]);

  // ── Send text through open WS ──────────────────────────────────────────────
  const sendVoiceText = useCallback(
    (text: string) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ realtimeInput: { text } }));
      const userMsg: VoiceMsg = {
        id: crypto.randomUUID(),
        role: "user",
        text,
        seq: seqCounterRef.current++,
      };
      voiceMessagesRef.current = [...voiceMessagesRef.current, userMsg];
      setVoiceMessages([...voiceMessagesRef.current]);
    },
    [seqCounterRef]
  );

  return {
    voiceState,
    voiceMessages,
    voiceMessagesRef,
    voiceError,
    startSession,
    stopSession,
    sendVoiceText,
    wsRef,
  };
}
