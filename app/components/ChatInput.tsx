"use client";
import { FormEvent } from "react";
import { UI_TEXT } from "@/app/lib/ui-strings";
import type { VoiceState } from "@/app/hooks/useVoiceSession";

interface ChatInputProps {
  input: string;
  isVoiceActive: boolean;
  isTextLoading: boolean;
  hasMic: boolean;
  voiceState: VoiceState;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onMicClick: () => void;
}

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
    <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A7 7 0 0 0 19 10z" />
  </svg>
);

const SpinnerIcon = () => (
  <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405z" />
  </svg>
);

export function ChatInput({
  input,
  isVoiceActive,
  isTextLoading,
  hasMic,
  voiceState,
  onChange,
  onSubmit,
  onMicClick,
}: ChatInputProps) {
  const micIsDisabled =
    voiceState === "connecting" ||
    voiceState === "thinking" ||
    voiceState === "speaking";

  const micClass = (() => {
    if (voiceState === "listening")
      return "bg-red-500 hover:bg-red-600 text-white ring-2 ring-red-300 dark:ring-red-700";
    if (micIsDisabled)
      return "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed";
    if (voiceState === "error")
      return "bg-red-100 dark:bg-red-900 text-red-500 hover:bg-red-200 dark:hover:bg-red-800";
    return "bg-blue-500 hover:bg-blue-600 text-white";
  })();

  return (
    <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 pb-4 pb-safe">
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 bg-white dark:bg-zinc-900 rounded-full shadow-md px-4 py-2 border border-zinc-200 dark:border-zinc-700 focus-within:border-blue-400 dark:focus-within:border-blue-600 transition-colors"
      >
        <input
          id="chat-input"
          name="message"
          className="flex-1 bg-transparent outline-none text-sm py-2 px-1 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 min-w-0"
          type="text"
          value={input}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isVoiceActive
              ? UI_TEXT.input.placeholderVoice
              : UI_TEXT.input.placeholderText
          }
          disabled={isTextLoading && !isVoiceActive}
          autoFocus
          autoComplete="off"
        />

        {/* Mic button */}
        {hasMic && (
          <button
            type="button"
            onClick={micIsDisabled ? undefined : onMicClick}
            disabled={micIsDisabled}
            title={isVoiceActive ? UI_TEXT.input.micStop : UI_TEXT.input.micStart}
            aria-label={isVoiceActive ? UI_TEXT.input.micStop : UI_TEXT.input.micStart}
            className={`rounded-full p-2.5 transition-all flex-shrink-0 ${micClass}`}
          >
            {voiceState === "connecting" ? <SpinnerIcon /> : <MicIcon />}
          </button>
        )}

        {/* Send button */}
        <button
          type="submit"
          disabled={!input.trim() || (isTextLoading && !isVoiceActive)}
          aria-label={UI_TEXT.input.sendLabel}
          className="bg-blue-500 hover:bg-blue-600 text-white p-2.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
