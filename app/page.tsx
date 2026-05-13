"use client";
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  FormEvent,
} from "react";
import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

interface VoiceMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  seq: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getTextFromMessage(m: UIMessage): string {
  const textPart = m.parts.find((p) => p.type === "text");
  return textPart && "text" in textPart ? (textPart.text as string) : "";
}

const MarkdownMessage = React.memo(({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      p: ({ ...props }) => <p className="mb-1 leading-relaxed" {...props} />,
      ul: ({ ...props }) => <ul className="list-disc ml-5 mb-1" {...props} />,
      ol: ({ ...props }) => <ol className="list-decimal ml-5 mb-1" {...props} />,
      li: ({ ...props }) => <li className="mb-0.5" {...props} />,
      h1: ({ ...props }) => <h1 className="text-2xl font-bold mb-2 mt-2" {...props} />,
      h2: ({ ...props }) => <h2 className="text-xl font-bold mb-1 mt-2" {...props} />,
      h3: ({ ...props }) => <h3 className="text-lg font-bold mb-1 mt-1" {...props} />,
      strong: ({ ...props }) => <strong className="font-bold" {...props} />,
      em: ({ ...props }) => <em className="italic" {...props} />,
      a: ({ ...props }) => (
        <a
          className="text-blue-500 underline hover:text-blue-700"
          target="_blank"
          rel="noopener noreferrer"
          {...props}
        />
      ),
    }}
  >
    {content}
  </ReactMarkdown>
));
MarkdownMessage.displayName = "MarkdownMessage";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function ChatPage() {
  // ── Text chat ──────────────────────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const { messages, sendMessage, status: textStatus } = useChat();
  const isTextLoading = textStatus === "submitted" || textStatus === "streaming";

  // ── Voice state ──────────────────────────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceMessages, setVoiceMessages] = useState<VoiceMsg[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [hasMic, setHasMic] = useState(false);
  const isVoiceActive = voiceState !== "idle" && voiceState !== "error";

  // ── Voice refs (audio pipeline + WS) ──────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const setupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOutTextRef = useRef(""); // assistant transcription accumulator
  const pendingInTextRef = useRef("");  // user transcription accumulator
  const pendingUserMsgIdRef = useRef<string | null>(null); // ID of the user bubble shown while assistant processes

  // ── Conversation logging refs ──────────────────────────────────────────────
  const textSessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<string | null>(null);
  const voiceStartTimeRef = useRef<number>(0);
  const voiceMessagesRef = useRef<VoiceMsg[]>([]);
  // voiceMessagesRef is updated ONLY from the WS handler.
  // Never from the render body — causes stale overwrites during batched re-renders.
  const textMessagesRef = useRef<Array<{ role: string; content: string; seq: number }>>([]);
  const seqCounterRef = useRef(0);
  const textMsgSeqsRef = useRef<Map<string, number>>(new Map());
  // Detect mic support after hydration
  useEffect(() => {
    setHasMic(
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  // Generate a fresh session ID on every page load (each visit = independent session)
  useEffect(() => {
    textSessionIdRef.current = crypto.randomUUID();
    sessionStartRef.current = new Date().toISOString();
  }, []);

  // Log unified session after each text response
  useEffect(() => {
    if (textStatus === "ready" && messages.length >= 2) {
      const sessionId = textSessionIdRef.current;
      if (!sessionId) return;
      // Seq numbers are assigned eagerly in the render body (allMsgs map); just read them here.
      textMessagesRef.current = messages.map((m) => ({
        role: m.role,
        content: getTextFromMessage(m),
        seq: textMsgSeqsRef.current.get(m.id) ?? 0,
      }));
      const sorted = [
        ...textMessagesRef.current,
        ...voiceMessagesRef.current.map((m) => ({ role: m.role, content: m.text, seq: m.seq })),
      ].sort((a, b) => a.seq - b.seq).map(({ role, content }) => ({ role, content }));
      fetch("/api/log-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          type: voiceMessagesRef.current.length > 0 ? "voice" : "text",
          messages: sorted,
          startedAt: sessionStartRef.current ?? new Date().toISOString(),
        }),
      }).catch(() => undefined);
    }
  }, [textStatus, messages]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, voiceMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      captureCtxRef.current?.close().catch(() => undefined);
      playCtxRef.current?.close().catch(() => undefined);
    };
  }, []);

  // ── Audio playback (gapless scheduling via Web Audio API) ─────────────────
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

  // ── WebSocket message handler ──────────────────────────────────────────────
  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      // Gemini Native Audio sends ALL messages as binary ArrayBuffer frames (JSON encoded as UTF-8)
      // We must decode them before parsing
      let raw: string;
      if (typeof event.data === "string") {
        raw = event.data;
      } else if (event.data instanceof ArrayBuffer) {
        raw = new TextDecoder().decode(event.data);
      } else {
        // Shouldn't happen after setting binaryType="arraybuffer", but guard anyway
        console.warn("[voice] Unknown WS frame type:", typeof event.data);
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        // Not JSON — ignore
        return;
      }

      // Server-side error in the message body (not a WS close)
      if (data.error) {
        console.error("[voice] Server error:", data.error);
        setVoiceState("error");
        setVoiceError(`Error del modelo: ${JSON.stringify(data.error)}`);
        return;
      }

      // Session ready → start listening
      if (data.setupComplete !== undefined) {
        if (setupTimeoutRef.current) clearTimeout(setupTimeoutRef.current);
        setVoiceState("listening");
        return;
      }

      const sc = data.serverContent as Record<string, unknown> | undefined;
      if (!sc) return;

      // Audio chunks from the model
      const modelTurn = sc.modelTurn as Record<string, unknown> | undefined;
      const parts =
        (modelTurn?.parts as Array<Record<string, unknown>>) ?? [];
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
      const outT = sc.outputTranscription as
        | Record<string, unknown>
        | undefined;
      if (outT?.text && typeof outT.text === "string") {
        pendingOutTextRef.current += outT.text;
      }

      // Input transcription (user speech) — show immediately so user sees their message
      // before the assistant starts responding
      const inT = sc.inputTranscription as Record<string, unknown> | undefined;
      if (inT?.text && typeof inT.text === "string") {
        pendingInTextRef.current += inT.text;
        const fullUserText = pendingInTextRef.current.trim();
        if (fullUserText) {
          if (!pendingUserMsgIdRef.current) {
            // First chunk: create and show the user bubble now
            const msgId = crypto.randomUUID();
            pendingUserMsgIdRef.current = msgId;
            const userMsg: VoiceMsg = { id: msgId, role: "user", text: fullUserText, seq: seqCounterRef.current++ };
            voiceMessagesRef.current = [...voiceMessagesRef.current, userMsg];
          } else {
            // Subsequent chunks: update the existing bubble in place
            voiceMessagesRef.current = voiceMessagesRef.current.map((m) =>
              m.id === pendingUserMsgIdRef.current ? { ...m, text: fullUserText } : m
            );
          }
          setVoiceMessages([...voiceMessagesRef.current]);
        }
        setVoiceState("thinking");
      }

      // Commit assistant message when the model's turn ends
      if (sc.turnComplete === true) {
        const assistantText = pendingOutTextRef.current.trim();
        pendingInTextRef.current = "";
        pendingOutTextRef.current = "";
        pendingUserMsgIdRef.current = null;

        const next = [...voiceMessagesRef.current];
        if (assistantText)
          next.push({ id: crypto.randomUUID(), role: "assistant", text: assistantText, seq: seqCounterRef.current++ });
        voiceMessagesRef.current = next;
        setVoiceMessages(next);
        // Log on every voice turn — upserts under unified session ID
        if (textSessionIdRef.current) {
          const sorted = [
            ...textMessagesRef.current,
            ...next.map((m) => ({ role: m.role, content: m.text, seq: m.seq })),
          ].sort((a, b) => a.seq - b.seq).map(({ role, content }) => ({ role, content }));
          fetch("/api/log-conversation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: textSessionIdRef.current,
              type: textMessagesRef.current.length > 0 ? "text" : "voice",
              messages: sorted,
              startedAt: sessionStartRef.current || new Date().toISOString(),
            }),
          }).catch(() => undefined);
        }
        setVoiceState("listening");
      }
    },
    [scheduleAudio]
  );

  // ── Stop mic capture ───────────────────────────────────────────────────────
  const stopCapture = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    workletNodeRef.current?.disconnect();
    captureCtxRef.current?.close().catch(() => undefined);
    streamRef.current = null;
    workletNodeRef.current = null;
    captureCtxRef.current = null;
  }, []);

  // Safety-net: final log on stop in case the last turn didn't complete before user stopped
  const logVoiceConversation = useCallback(() => {
    if (!textSessionIdRef.current) return;
    const sorted = [
      ...textMessagesRef.current,
      ...voiceMessagesRef.current.map((m) => ({ role: m.role, content: m.text, seq: m.seq })),
    ].sort((a, b) => a.seq - b.seq).map(({ role, content }) => ({ role, content }));
    if (sorted.length === 0) return;
    const durationSeconds = voiceStartTimeRef.current
      ? Math.round((Date.now() - voiceStartTimeRef.current) / 1000)
      : undefined;
    fetch("/api/log-conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: textSessionIdRef.current,
        type: voiceMessagesRef.current.length > 0 ? (textMessagesRef.current.length > 0 ? "text" : "voice") : "text",
        messages: sorted,
        startedAt: sessionStartRef.current || new Date().toISOString(),
        durationSeconds,
      }),
    }).catch(() => undefined);
  }, []);

  // ── Stop full voice session ────────────────────────────────────────────────
  const stopSession = useCallback(() => {
    logVoiceConversation();
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
  }, [stopCapture, logVoiceConversation]);

  // ── Start voice session ────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setVoiceState("connecting");
    setVoiceError(null);
    // Do NOT reset voiceMessages — accumulate across sessions in same page visit
    pendingInTextRef.current = "";
    pendingOutTextRef.current = "";
    voiceStartTimeRef.current = Date.now();

    try {
      // 1. Ask for mic permission FIRST so the dialog doesn't race with WS setup.
      //    If the user denies, we fail here with a clear message.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        throw new Error("Permiso de micrófono denegado. Actívalo en la configuración del navegador.");
      }
      streamRef.current = stream;

      // 2. Get API key + model + system prompt from our backend
      const res = await fetch("/api/voice-session", { method: "POST" });
      if (!res.ok) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(`Error al conectar con el servicio de voz (${res.status})`);
      }
      const { apiKey, model, availableLiveModels, systemPrompt } = (await res.json()) as {
        apiKey: string;
        model: string;
        availableLiveModels?: string[];
        systemPrompt: string;
      };
      console.log("[voice] Using model:", model);
      console.log("[voice] All available Live API models:", availableLiveModels);

      // Try v1alpha first (required for gemini-2.0-flash-live-001 and older models),
      // v1beta for newer preview models. We'll detect which one based on the model name.
      const apiVersion = model.includes("2.0") ? "v1alpha" : "v1beta";
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer"; // receive binary frames as ArrayBuffer, not Blob
      wsRef.current = ws;

      // Connection timeout: if setupComplete doesn't arrive in 12s, abort
      const setupTimeout = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
        setVoiceState("error");
        setVoiceError("Tiempo de espera agotado. El modelo no respondio al setup. Revisa la consola del navegador.");
      }, 12000);

      ws.onopen = () => {
        console.log("[voice] WS open, sending setup for model:", model);
        ws.send(
          JSON.stringify({
            setup: {
              model,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: "Aoede" },
                  },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: { parts: [{ text: systemPrompt }] },
            },
          })
        );
      };

      // Clear the setup timeout as soon as setupComplete arrives (handled in handleWsMessage)
      // We store it so handleWsMessage can clear it
      setupTimeoutRef.current = setupTimeout;

      ws.onmessage = handleWsMessage;
      ws.onerror = (e) => {
        console.error("[voice] WebSocket error:", e);
        setVoiceState("error");
        setVoiceError("Error de conexión WebSocket. Revisa la consola del navegador.");
      };
      ws.onclose = (e) => {
        console.warn("[voice] WebSocket closed:", e.code, e.reason);
        // Show the close code so we can diagnose which Gemini error it was
        setVoiceState((prev) => {
          if (prev === "idle" || prev === "error") return prev;
          // Show the close code so we can diagnose which Gemini error it was
          const reason = e.reason ? ` — ${e.reason}` : "";
          setVoiceError(`Sesión de voz cerrada (código ${e.code}${reason}). Intenta de nuevo.`);
          return "error";
        });
        stopCapture();
      };

      // 4. Set up AudioWorklet to capture and forward mic audio
      const captureCtx = new AudioContext({ sampleRate: 16000 });
      captureCtxRef.current = captureCtx;
      const actualRate = captureCtx.sampleRate;

      await captureCtx.audioWorklet.addModule("/audio-processor.worklet.js");

      const micSource = captureCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(captureCtx, "pcm-capture");
      workletNodeRef.current = worklet;

      // Forward PCM chunks to Gemini WebSocket
      worklet.port.onmessage = ({ data }) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm = new Int16Array(data.pcm as ArrayBuffer);
        const bytes = new Uint8Array(pcm.buffer);
        let bin = "";
        for (let i = 0; i < bytes.length; i++)
          bin += String.fromCharCode(bytes[i]);
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

      // Connect through a silent gain so the worklet receives audio
      // but doesn't play the mic back to the speakers
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

  // ── Text submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput("");

      if (isVoiceActive && wsRef.current?.readyState === WebSocket.OPEN) {
        // In voice mode: send text via the open WebSocket
        wsRef.current.send(JSON.stringify({ realtimeInput: { text } }));
        const userMsg = { id: crypto.randomUUID(), role: "user" as const, text, seq: seqCounterRef.current++ };
        // Keep ref in sync so turnComplete doesn't overwrite this message
        voiceMessagesRef.current = [...voiceMessagesRef.current, userMsg];
        setVoiceMessages(voiceMessagesRef.current);
      } else if (!isTextLoading) {
        await sendMessage({ text });
      }
    },
    [input, isVoiceActive, isTextLoading, sendMessage]
  );

  // ── Voice UI helpers ───────────────────────────────────────────────────────
  const voiceLabel: Record<string, string> = {
    connecting: "Conectando...",
    listening: "Escuchando",
    thinking: "Procesando...",
    speaking: "Respondiendo",
    error: "Error de voz",
  };

  const voiceBarColor: Record<string, string> = {
    connecting: "bg-zinc-400 dark:bg-zinc-600 text-white",
    listening: "bg-emerald-500 text-white",
    thinking: "bg-amber-500 text-white",
    speaking: "bg-blue-500 text-white",
    error: "bg-red-500 text-white",
  };

  const micBtnClass =
    voiceState === "listening"
      ? "bg-red-500 hover:bg-red-600 text-white ring-2 ring-red-300 dark:ring-red-700"
      : voiceState === "connecting" || voiceState === "thinking" || voiceState === "speaking"
      ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
      : voiceState === "error"
      ? "bg-red-100 dark:bg-red-900 text-red-500 hover:bg-red-200 dark:hover:bg-red-800"
      : "bg-blue-500 hover:bg-blue-600 text-white shadow-md";

  const heroMicClass =
    voiceState === "listening"
      ? "bg-red-500 text-white ring-4 ring-red-300 dark:ring-red-700"
      : voiceState === "connecting"
      ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
      : voiceState === "thinking" || voiceState === "speaking"
      ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed opacity-60"
      : voiceState === "error"
      ? "bg-red-100 dark:bg-red-900 text-red-500 hover:bg-red-200 dark:hover:bg-red-800"
      : "bg-gradient-to-br from-blue-500 to-indigo-600 text-white ring-4 ring-blue-200 dark:ring-blue-900 animate-pulse";

  // Unified chronological message list — text and voice interleaved by seq number
  const allMsgs: Array<{ id: string; role: "user" | "assistant"; content: string; source: "text" | "voice"; seq: number }> = [
    ...messages.map((m) => {
      // Assign seq eagerly on first render — don't wait for textStatus==="ready"
      if (!textMsgSeqsRef.current.has(m.id)) {
        textMsgSeqsRef.current.set(m.id, seqCounterRef.current++);
      }
      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: getTextFromMessage(m),
        source: "text" as const,
        seq: textMsgSeqsRef.current.get(m.id)!,
      };
    }),
    ...voiceMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.text,
      source: "voice" as const,
      seq: m.seq,
    })),
  ].sort((a, b) => a.seq - b.seq);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-50 dark:bg-black font-sans">

      {/* Header */}
      <header className="w-full border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-4 px-6 flex items-center gap-3 shadow-sm">
        <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
          JS
        </div>
        <div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
            Joshep Stevens Borja
          </p>
          <p className="text-xs text-zinc-500">IT Project Manager · Gemelo Digital IA</p>
        </div>
        {isVoiceActive && (
          <button
            onClick={stopSession}
            className="ml-auto text-xs px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
          >
            Finalizar voz
          </button>
        )}
      </header>

      {/* Voice status bar */}
      {voiceState !== "idle" && (
        <div
          className={`py-1.5 px-4 text-center text-xs font-medium flex items-center justify-center gap-2 transition-colors ${voiceBarColor[voiceState] ?? ""}`}
        >
          {voiceState === "listening" && (
            <span className="inline-flex items-end gap-0.5 h-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 bg-white rounded-full animate-bounce"
                  style={{ height: "60%", animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          )}
          <span>{voiceLabel[voiceState]}</span>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl w-full mx-auto">

        {allMsgs.length === 0 ? (
          /* ── Empty state ── */
          isVoiceActive ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-2 text-zinc-500 dark:text-zinc-400">
              <span className="text-4xl">🎙️</span>
              <p className="text-base font-medium">
                Sesión de voz iniciada.
                <br />
                Habla cuando quieras o escribe abajo.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center gap-6 px-4">

              {/* Greeting */}
              <div className="space-y-1">
                <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
                  ¡Hola! Soy el asistente digital de Joshep.
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Pregúntame sobre su experiencia, habilidades o proyectos.
                </p>
              </div>

              {/* Hero mic CTA — only shown when voiceState is idle or error */}
              {hasMic && (
                <div className="flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={startSession}
                    title="Iniciar conversación de voz"
                    className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all ${heroMicClass}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                      <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A7 7 0 0 0 19 10z" />
                    </svg>
                  </button>
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {voiceState === "error" ? "Reintentar voz" : "Hablar conmigo de Joshep"}
                  </p>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3 w-full max-w-xs">
                <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                <span className="text-xs text-zinc-400">o escribe tu pregunta</span>
                <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "¿Qué experiencia tiene en gestión de proyectos?",
                  "¿Tiene certificación PMP?",
                  "¿Qué tecnologías domina?",
                  "¿Tiene experiencia con IA?",
                  "¿En qué proyectos ha trabajado?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

            </div>
          )
        ) : (
          /* ── Unified chronological message list ── */
          <>
            {allMsgs.map((m) => (
              <div
                key={m.id}
                className={`mb-4 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-2xl px-4 py-3 max-w-[80%] text-sm shadow-sm ${
                    m.role === "user"
                      ? "bg-blue-500 text-white rounded-br-sm"
                      : "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-bl-sm"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <MarkdownMessage content={m.content} />
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>
              </div>
            ))}
            {isTextLoading && (
              <div className="flex justify-start mb-4">
                <div className="bg-white dark:bg-zinc-900 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-zinc-400 text-sm">
                  <span className="animate-pulse">Escribiendo...</span>
                </div>
              </div>
            )}
            {textStatus === "error" && (
              <div className="flex justify-start mb-4">
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-red-600 dark:text-red-400 text-sm">
                  Ha ocurrido un error al conectar. Por favor, intenta de nuevo.
                </div>
              </div>
            )}
          </>
        )}

        {/* Voice thinking / speaking indicator */}
        {(voiceState === "thinking" || voiceState === "speaking") && (
          <div className="flex justify-start mb-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-zinc-400 text-sm">
              <span className="animate-pulse">
                {voiceState === "thinking" ? "Procesando..." : "Hablando..."}
              </span>
            </div>
          </div>
        )}

        {/* Voice error bubble */}
        {voiceError && (
          <div className="flex justify-start mb-4">
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-red-600 dark:text-red-400 text-sm">
              {voiceError}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input area */}
      <div className="w-full max-w-2xl mx-auto px-4 pb-6">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 bg-white dark:bg-zinc-900 rounded-full shadow-md px-4 py-2 border border-zinc-200 dark:border-zinc-700"
        >
          <input
            className="flex-1 bg-transparent outline-none text-sm py-2 px-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isVoiceActive
                ? "Habla o escribe aquí..."
                : "Pregunta sobre mi experiencia o proyectos..."
            }
            disabled={isTextLoading && !isVoiceActive}
            autoFocus
          />

          {/* Microphone button (only shown when browser supports getUserMedia) */}
          {hasMic && (
            <button
              type="button"
              onClick={
                voiceState === "idle" || voiceState === "error"
                  ? startSession
                  : voiceState === "listening"
                  ? stopSession
                  : undefined
              }
              disabled={
                voiceState === "connecting" ||
                voiceState === "thinking" ||
                voiceState === "speaking"
              }
              title={isVoiceActive ? "Detener sesión de voz" : "Iniciar sesión de voz"}
              className={`rounded-full p-3 transition-all flex-shrink-0 ${micBtnClass}`}
            >
              {voiceState === "connecting" ? (
                /* Spinner */
                <svg
                  className="w-5 h-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              ) : (
                /* Microphone icon */
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                  <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A7 7 0 0 0 19 10z" />
                </svg>
              )}
            </button>
          )}

          {/* Send button */}
          <button
            type="submit"
            disabled={!input.trim() || (isTextLoading && !isVoiceActive)}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-full text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            {isTextLoading && !isVoiceActive ? "..." : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
