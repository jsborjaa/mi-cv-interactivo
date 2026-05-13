"use client";
import React, { useRef, useEffect, useState, useCallback, FormEvent } from "react";
import { useChat } from "@ai-sdk/react";

import { useVoiceSession } from "@/app/hooks/useVoiceSession";
import { ChatHeader } from "@/app/components/ChatHeader";
import { VoiceStatusBar } from "@/app/components/VoiceStatusBar";
import { EmptyState } from "@/app/components/EmptyState";
import { MessageList, getTextFromMessage, type UnifiedMessage } from "@/app/components/MessageList";
import { ChatInput } from "@/app/components/ChatInput";

export default function ChatPage() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [hasMic, setHasMic] = useState(false);
  const [textErrorDismissed, setTextErrorDismissed] = useState(false);

  const { messages, sendMessage, status: textStatus } = useChat();
  const isTextLoading = textStatus === "submitted" || textStatus === "streaming";

  // Shared sequence counter for chronological ordering across text + voice messages
  const seqCounterRef = useRef(0);
  const textMsgSeqsRef = useRef<Map<string, number>>(new Map());
  const textMessagesRef = useRef<Array<{ role: string; content: string; seq: number }>>([]);

  // Session tracking for conversation logging
  const textSessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<string | null>(null);
  const voiceStartTimeRef = useRef<number>(0);

  // ── Voice session ──────────────────────────────────────────────────────────
  const { voiceState, voiceMessages, voiceMessagesRef, voiceError, startSession, stopSession, sendVoiceText, wsRef } =
    useVoiceSession({
      seqCounterRef,
      onTurnComplete: (msgs) => {
        if (!textSessionIdRef.current) return;
        const sorted = buildSortedMessages(msgs);
        logConversation({ sessionId: textSessionIdRef.current, type: "voice", sorted, startedAt: sessionStartRef.current });
      },
    });

  const isVoiceActive = voiceState !== "idle" && voiceState !== "error";

  // ── Helpers ────────────────────────────────────────────────────────────────
  function buildSortedMessages(voiceMsgs: typeof voiceMessages) {
    return [
      ...textMessagesRef.current,
      ...voiceMsgs.map((m) => ({ role: m.role, content: m.text, seq: m.seq })),
    ]
      .sort((a, b) => a.seq - b.seq)
      .map(({ role, content }) => ({ role, content }));
  }

  function logConversation({
    sessionId,
    type,
    sorted,
    startedAt,
    durationSeconds,
  }: {
    sessionId: string;
    type: "text" | "voice";
    sorted: Array<{ role: string; content: string }>;
    startedAt: string | null;
    durationSeconds?: number;
  }) {
    if (sorted.length === 0) return;
    fetch("/api/log-conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        type,
        messages: sorted,
        startedAt: startedAt ?? new Date().toISOString(),
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      }),
    }).catch(() => undefined);
  }

  // ── Auto-dismiss text error when voice becomes active ─────────────────────
  useEffect(() => {
    if (isVoiceActive) setTextErrorDismissed(true);
  }, [isVoiceActive]);

  // ── Detect mic support after hydration ────────────────────────────────────
  useEffect(() => {
    setHasMic(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  // ── Fresh session ID on every page load ───────────────────────────────────
  useEffect(() => {
    textSessionIdRef.current = crypto.randomUUID();
    sessionStartRef.current = new Date().toISOString();
  }, []);

  // ── Log after each completed text response ────────────────────────────────
  useEffect(() => {
    if (textStatus === "ready" && messages.length >= 2) {
      const sessionId = textSessionIdRef.current;
      if (!sessionId) return;
      textMessagesRef.current = messages.map((m) => ({
        role: m.role,
        content: getTextFromMessage(m),
        seq: textMsgSeqsRef.current.get(m.id) ?? 0,
      }));
      const sorted = buildSortedMessages(voiceMessagesRef.current);
      logConversation({
        sessionId,
        type: voiceMessagesRef.current.length > 0 ? "voice" : "text",
        sorted,
        startedAt: sessionStartRef.current,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textStatus, messages]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, voiceMessages]);

  // ── Log + cleanup on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (textSessionIdRef.current) {
        const sorted = buildSortedMessages(voiceMessagesRef.current);
        const durationSeconds = voiceStartTimeRef.current
          ? Math.round((Date.now() - voiceStartTimeRef.current) / 1000)
          : undefined;
        logConversation({
          sessionId: textSessionIdRef.current,
          type: voiceMessagesRef.current.length > 0 ? "voice" : "text",
          sorted,
          startedAt: sessionStartRef.current,
          durationSeconds,
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Text + voice unified submit ────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput("");
      if (isVoiceActive && wsRef.current?.readyState === WebSocket.OPEN) {
        sendVoiceText(text);
      } else if (!isTextLoading) {
        setTextErrorDismissed(false);
        await sendMessage({ text });
      }
    },
    [input, isVoiceActive, isTextLoading, sendMessage, sendVoiceText, wsRef]
  );

  // ── Mic button handler ─────────────────────────────────────────────────────
  const handleMicClick = useCallback(() => {
    if (voiceState === "idle" || voiceState === "error") {
      voiceStartTimeRef.current = Date.now();
      startSession();
    } else if (voiceState === "listening") {
      stopSession();
    }
  }, [voiceState, startSession, stopSession]);

  // ── Handle stop voice from header ─────────────────────────────────────────
  const handleStopVoice = useCallback(() => {
    const sorted = buildSortedMessages(voiceMessagesRef.current);
    const durationSeconds = voiceStartTimeRef.current
      ? Math.round((Date.now() - voiceStartTimeRef.current) / 1000)
      : undefined;
    if (textSessionIdRef.current) {
      logConversation({
        sessionId: textSessionIdRef.current,
        type: voiceMessagesRef.current.length > 0 ? "voice" : "text",
        sorted,
        startedAt: sessionStartRef.current,
        durationSeconds,
      });
    }
    stopSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopSession]);

  // ── Build unified chronological message list ───────────────────────────────
  const allMsgs: UnifiedMessage[] = [
    ...messages.map((m) => {
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
      <ChatHeader isVoiceActive={isVoiceActive} onStopVoice={handleStopVoice} />

      <VoiceStatusBar voiceState={voiceState} />

      <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-6 max-w-2xl w-full mx-auto">
        {allMsgs.length === 0 ? (
          <EmptyState
            hasMic={hasMic}
            voiceState={voiceState}
            isVoiceActive={isVoiceActive}
            onStartSession={() => { voiceStartTimeRef.current = Date.now(); startSession(); }}
            onChipClick={setInput}
          />
        ) : (
          <MessageList
            messages={allMsgs}
            isTextLoading={isTextLoading}
            textStatus={textStatus}
            textErrorDismissed={textErrorDismissed}
            voiceState={voiceState}
            voiceError={voiceError}
            hasMic={hasMic}
            onDismissTextError={() => setTextErrorDismissed(true)}
            onStartVoice={() => { voiceStartTimeRef.current = Date.now(); startSession(); }}
            bottomRef={bottomRef}
          />
        )}
      </main>

      <ChatInput
        input={input}
        isVoiceActive={isVoiceActive}
        isTextLoading={isTextLoading}
        hasMic={hasMic}
        voiceState={voiceState}
        onChange={setInput}
        onSubmit={handleSubmit}
        onMicClick={handleMicClick}
      />
    </div>
  );
}
