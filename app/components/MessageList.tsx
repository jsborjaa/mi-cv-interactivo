"use client";
import React from "react";
import ReactMarkdown from "react-markdown";
import { UI_TEXT } from "@/app/lib/ui-strings";
import type { VoiceState } from "@/app/hooks/useVoiceSession";
import type { UIMessage } from "ai";

// ---------------------------------------------------------------------------
// Markdown renderer (memoised)
// ---------------------------------------------------------------------------
const MarkdownMessage = React.memo(({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      p:      ({ ...props }) => <p className="mb-1 leading-relaxed" {...props} />,
      ul:     ({ ...props }) => <ul className="list-disc ml-5 mb-1" {...props} />,
      ol:     ({ ...props }) => <ol className="list-decimal ml-5 mb-1" {...props} />,
      li:     ({ ...props }) => <li className="mb-0.5" {...props} />,
      h1:     ({ ...props }) => <h1 className="text-2xl font-bold mb-2 mt-2" {...props} />,
      h2:     ({ ...props }) => <h2 className="text-xl font-bold mb-1 mt-2" {...props} />,
      h3:     ({ ...props }) => <h3 className="text-lg font-bold mb-1 mt-1" {...props} />,
      strong: ({ ...props }) => <strong className="font-bold" {...props} />,
      em:     ({ ...props }) => <em className="italic" {...props} />,
      a:      ({ ...props }) => (
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
// Typing indicator (3 animated dots)
// ---------------------------------------------------------------------------
function TypingDots() {
  return (
    <span className="inline-flex items-end gap-1" aria-label="escribiendo">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface UnifiedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: "text" | "voice";
  seq: number;
}

interface MessageListProps {
  messages: UnifiedMessage[];
  isTextLoading: boolean;
  textStatus: string;
  textErrorDismissed: boolean;
  voiceState: VoiceState;
  voiceError: string | null;
  isAssistantStreaming: boolean;
  hasMic: boolean;
  onDismissTextError: () => void;
  onStartVoice: () => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}

// Helper to extract plain text from a UIMessage (kept here for seq assignment in page.tsx)
export function getTextFromMessage(m: UIMessage): string {
  const textPart = m.parts.find((p) => p.type === "text");
  return textPart && "text" in textPart ? (textPart.text as string) : "";
}

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------
export function MessageList({
  messages,
  isTextLoading,
  textStatus,
  textErrorDismissed,
  voiceState,
  voiceError,
  isAssistantStreaming,
  hasMic,
  onDismissTextError,
  onStartVoice,
  bottomRef,
}: MessageListProps) {
  return (
    <>
      {messages.map((m) => (
        <div
          key={m.id}
          className={`mb-4 flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          style={{ animation: "slideIn 0.18s ease-out" }}
        >
          {/* Assistant avatar spacer */}
          {m.role === "assistant" && (
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mb-0.5">
              JS
            </div>
          )}

          <div
            className={`rounded-2xl px-4 py-3 max-w-[78%] sm:max-w-[70%] text-sm shadow-sm ${
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
            {/* Voice source badge */}
            {m.source === "voice" && (
              <span
                className={`block text-[10px] mt-1 ${m.role === "user" ? "text-blue-200" : "text-zinc-400"}`}
                aria-label="mensaje de voz"
              >
                🎙 voz
              </span>
            )}
          </div>
        </div>
      ))}

      {/* Text chat: typing indicator */}
      {isTextLoading && (
        <div className="flex items-end gap-2 justify-start mb-4">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mb-0.5">
            JS
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-zinc-400 text-sm">
            <TypingDots />
          </div>
        </div>
      )}

      {/* Text chat: error */}
      {textStatus === "error" && !textErrorDismissed && (
        <div className="flex justify-start mb-4">
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-red-600 dark:text-red-400 text-sm space-y-1">
            <p>{UI_TEXT.messages.textError}</p>
            {hasMic && (
              <p className="text-red-500 dark:text-red-400">
                También puedes{" "}
                <button
                  type="button"
                  onClick={() => { onDismissTextError(); onStartVoice(); }}
                  className="underline font-medium hover:text-red-700 dark:hover:text-red-300 transition-colors"
                >
                  {UI_TEXT.messages.textErrorVoiceCta}
                </button>
                {" "}{UI_TEXT.messages.textErrorVoiceHint}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Voice: connecting pill — centered, minimal */}
      {voiceState === "connecting" && (
        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            <svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Conectando...</span>
          </div>
        </div>
      )}

      {/* Voice: listening pill — centered, shown after each assistant turn */}
      {voiceState === "listening" && (
        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
            <span className="inline-flex items-end gap-0.5 h-3" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-0.5 rounded-full bg-emerald-500"
                  style={{
                    height: `${40 + ((i * 13) % 60)}%`,
                    animation: `equalizer 0.8s ease-in-out infinite alternate`,
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </span>
            <span>Escuchando</span>
          </div>
        </div>
      )}

      {/* Voice: thinking / speaking — only while assistant hasn't started responding */}
      {(voiceState === "thinking" || (voiceState === "speaking" && !isAssistantStreaming)) && (
        <div className="flex items-end gap-2 justify-start mb-4">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mb-0.5">
            JS
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-zinc-400 text-sm">
            {voiceState === "thinking" ? (
              <span className="inline-flex items-center gap-2">
                <svg className="w-3 h-3 animate-spin text-amber-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>{UI_TEXT.messages.thinking}</span>
              </span>
            ) : (
              <TypingDots />
            )}
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
    </>
  );
}
