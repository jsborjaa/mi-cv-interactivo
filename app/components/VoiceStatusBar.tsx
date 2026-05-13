"use client";
import { UI_TEXT } from "@/app/lib/ui-strings";
import type { VoiceState } from "@/app/hooks/useVoiceSession";

interface VoiceStatusBarProps {
  voiceState: VoiceState;
}

const BAR_COLOR: Record<string, string> = {
  connecting: "bg-zinc-400 dark:bg-zinc-600 text-white",
  listening:  "bg-emerald-500 text-white",
  thinking:   "bg-amber-500 text-white",
  speaking:   "bg-blue-500 text-white",
  error:      "bg-red-500 text-white",
};

export function VoiceStatusBar({ voiceState }: VoiceStatusBarProps) {
  if (voiceState === "idle") return null;

  const label = UI_TEXT.voice.labels[voiceState as keyof typeof UI_TEXT.voice.labels] ?? voiceState;

  return (
    <div
      className={`py-1.5 px-4 text-center text-xs font-medium flex items-center justify-center gap-2 transition-colors duration-300 ${BAR_COLOR[voiceState] ?? ""}`}
    >
      {/* Equalizer bars during listening/speaking */}
      {(voiceState === "listening" || voiceState === "speaking") && (
        <span className="inline-flex items-end gap-0.5 h-3" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-0.5 bg-white rounded-full"
              style={{
                height: `${40 + ((i * 13) % 60)}%`,
                animation: `equalizer 0.8s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </span>
      )}

      {/* Pulse ring during thinking */}
      {voiceState === "thinking" && (
        <span
          className="w-2 h-2 rounded-full bg-white animate-ping"
          aria-hidden
        />
      )}

      <span>{label}</span>
    </div>
  );
}
