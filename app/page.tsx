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

  // ── Voice state ────────────────────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceMessages, setVoiceMessages] = useState<VoiceMsg[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [hasMic, setHasMic] = useState(false);

  // ── Voice refs (audio pipeline + WS) ──────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const pendingOutTextRef = useRef(""); // assistant transcription accumulator
  const pendingInTextRef = useRef("");  // user transcription accumulator

  const isVoiceActive = voiceState !== "idle" && voiceState !== "error";

  // Detect mic support after hydration
  useEffect(() => {
    setHasMic(
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

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
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      // Session ready → start listening
      if (data.setupComplete) {
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

      // Input transcription (user speech)
      const inT = sc.inputTranscription as Record<string, unknown> | undefined;
      if (inT?.text && typeof inT.text === "string") {
        pendingInTextRef.current += inT.text;
        setVoiceState("thinking");
      }

      // Commit both messages when the model's turn ends
      if (sc.turnComplete === true) {
        const userText = pendingInTextRef.current.trim();
        const assistantText = pendingOutTextRef.current.trim();
        pendingInTextRef.current = "";
        pendingOutTextRef.current = "";

        setVoiceMessages((prev) => {
          const next = [...prev];
          if (userText)
            next.push({ id: crypto.randomUUID(), role: "user", text: userText });
          if (assistantText)
            next.push({
              id: crypto.randomUUID(),
              role: "assistant",
              text: assistantText,
            });
          return next;
        });
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

  // ── Stop full voice session ────────────────────────────────────────────────
  const stopSession = useCallback(() => {
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

  // ── Start voice session ────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setVoiceState("connecting");
    setVoiceError(null);
    setVoiceMessages([]);
    pendingInTextRef.current = "";
    pendingOutTextRef.current = "";

    try {
      // 1. Get API key + model + system prompt from our backend
      const res = await fetch("/api/voice-session", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(`Error al conectar con el servicio de voz (${res.status})`);
      }
      const { apiKey, model, systemPrompt } = (await res.json()) as {
        apiKey: string;
        model: string;
        systemPrompt: string;
      };

      // 2. Open WebSocket directly to Gemini Live using API key auth.
      //    The WebSocket lives entirely in the browser — Vercel is not involved.
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // 3. Send setup message with system prompt, voice config, transcription
        ws.send(
          JSON.stringify({
            setup: {
              model,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: "Kore" },
                  },
                },
              },
              systemInstruction: { parts: [{ text: systemPrompt }] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              realtimeInputConfig: {
                automaticActivityDetection: { disabled: false },
              },
            },
          })
        );
      };

      ws.onmessage = handleWsMessage;
      ws.onerror = () => {
        setVoiceState("error");
        setVoiceError("Error de conexión con el servicio de voz.");
      };
      ws.onclose = () => {
        setVoiceState((prev) => (prev !== "error" ? "idle" : prev));
        stopCapture();
      };

      // 4. Capture microphone audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Create AudioContext at 16 kHz (browser will resample from hardware rate)
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
        setVoiceMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "user", text },
        ]);
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
      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700";

  const showVoiceMode = isVoiceActive || voiceMessages.length > 0;

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

        {showVoiceMode ? (
          /* ── Voice mode ── */
          voiceMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-2 text-zinc-500 dark:text-zinc-400">
              <span className="text-4xl">🎙️</span>
              <p className="text-base font-medium">
                Sesión de voz iniciada.
                <br />
                Habla cuando quieras o escribe abajo.
              </p>
            </div>
          ) : (
            voiceMessages.map((m) => (
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
                    <MarkdownMessage content={m.text} />
                  ) : (
                    <span>{m.text}</span>
                  )}
                </div>
              </div>
            ))
          )
        ) : (
          /* ── Text mode ── */
          <>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-2">
                <span className="text-4xl">👋</span>
                <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">
                  ¡Hola! Soy el asistente digital de Joshep.
                  <br />
                  Pregúntame sobre su experiencia, habilidades o proyectos.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
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
            )}
            {messages.map((m, i) => (
              <div
                key={i}
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
                    <MarkdownMessage content={getTextFromMessage(m)} />
                  ) : (
                    <span>{getTextFromMessage(m)}</span>
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
              className={`rounded-full p-2.5 transition-all flex-shrink-0 ${micBtnClass}`}
            >
              {voiceState === "connecting" ? (
                /* Spinner */
                <svg
                  className="w-4 h-4 animate-spin"
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
                  className="w-4 h-4"
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
