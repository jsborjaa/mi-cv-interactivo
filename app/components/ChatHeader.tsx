"use client";
import { UI_TEXT } from "@/app/lib/ui-strings";

interface ChatHeaderProps {
  isVoiceActive: boolean;
  onStopVoice: () => void;
}

export function ChatHeader({ isVoiceActive, onStopVoice }: ChatHeaderProps) {
  return (
    <header className="w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm py-3 px-4 sm:px-6 flex items-center gap-3 shadow-sm">
      {/* Avatar with online dot */}
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
          JS
        </div>
        <span
          aria-label={UI_TEXT.header.onlineBadge}
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-950"
        />
      </div>

      {/* Name + role */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm leading-tight truncate">
          {UI_TEXT.header.name}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block truncate">
          {UI_TEXT.header.role}
        </p>
      </div>

      {/* LinkedIn link */}
      <a
        href={UI_TEXT.header.linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={UI_TEXT.header.linkedinLabel}
        className="flex-shrink-0 text-zinc-400 hover:text-blue-500 transition-colors p-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>

      {/* Stop voice button */}
      {isVoiceActive && (
        <button
          onClick={onStopVoice}
          className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800 transition-colors font-medium"
        >
          {UI_TEXT.header.stopVoice}
        </button>
      )}
    </header>
  );
}
