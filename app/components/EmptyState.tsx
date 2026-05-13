"use client";
import { UI_TEXT } from "@/app/lib/ui-strings";
import type { VoiceState } from "@/app/hooks/useVoiceSession";

interface EmptyStateProps {
  hasMic: boolean;
  voiceState: VoiceState;
  isVoiceActive: boolean;
  onStartSession: () => void;
  onChipClick: (text: string) => void;
}

const heroMicClass: Record<string, string> = {
  idle:
    "bg-gradient-to-br from-blue-500 to-indigo-600 text-white ring-4 ring-blue-200 dark:ring-blue-900 shadow-xl hover:scale-105 active:scale-95",
  error:
    "bg-red-100 dark:bg-red-900 text-red-500 hover:bg-red-200 dark:hover:bg-red-800 ring-4 ring-red-200 dark:ring-red-900",
  connecting:
    "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed ring-4 ring-zinc-200 dark:ring-zinc-700",
};

export function EmptyState({
  hasMic,
  voiceState,
  isVoiceActive,
  onStartSession,
  onChipClick,
}: EmptyStateProps) {
  if (isVoiceActive) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-4 text-zinc-500 dark:text-zinc-400">
        <span className="text-5xl" role="img" aria-label="micrófono">🎙️</span>
        <p className="text-base font-medium leading-relaxed">
          {UI_TEXT.emptyState.voiceActive}
          <br />
          <span className="text-sm">{UI_TEXT.emptyState.voiceActiveHint}</span>
        </p>
      </div>
    );
  }

  const micClass = heroMicClass[voiceState] ?? heroMicClass.idle;
  const micLabel =
    voiceState === "error"
      ? UI_TEXT.emptyState.voiceRetry
      : UI_TEXT.emptyState.voiceCta;

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-6 px-4 py-8">
      {/* Avatar */}
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl shadow-xl ring-4 ring-blue-100 dark:ring-blue-900/40">
        JS
      </div>

      {/* Greeting */}
      <div className="space-y-1.5 max-w-xs">
        <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          {UI_TEXT.emptyState.greeting}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {UI_TEXT.emptyState.subtitle}
        </p>
      </div>

      {/* Voice CTA */}
      {hasMic && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={voiceState === "idle" || voiceState === "error" ? onStartSession : undefined}
            disabled={voiceState === "connecting"}
            aria-label={micLabel}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${micClass}`}
          >
            {voiceState === "connecting" ? (
              <svg className="w-6 h-6 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A7 7 0 0 0 19 10z" />
              </svg>
            )}
          </button>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{micLabel}</p>
        </div>
      )}

      {/* Divider */}
      {hasMic && (
        <div className="flex items-center gap-3 w-full max-w-xs">
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
          <span className="text-xs text-zinc-400">{UI_TEXT.emptyState.divider}</span>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
        </div>
      )}

      {/* Suggestion chips */}
      <div className="flex overflow-x-auto sm:flex-wrap sm:justify-center gap-2 w-full max-w-sm sm:max-w-none pb-1 sm:pb-0 no-scrollbar">
        {UI_TEXT.emptyState.chips.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onChipClick(suggestion)}
            className="flex-shrink-0 text-xs px-3 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors whitespace-nowrap"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
