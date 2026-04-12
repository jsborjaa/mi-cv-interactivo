"use client";
import React, { useRef, useEffect, useState, FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";

// Extrae el texto plano de un UIMessage (que usa "parts" en lugar de "content")
function getTextFromMessage(m: UIMessage): string {
  const textPart = m.parts.find((p) => p.type === "text");
  return textPart && "text" in textPart ? (textPart.text as string) : "";
}

// React.memo para evitar re-render innecesario durante streaming
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
        <a className="text-blue-500 underline hover:text-blue-700" target="_blank" rel="noopener noreferrer" {...props} />
      ),
    }}
  >
    {content}
  </ReactMarkdown>
));
MarkdownMessage.displayName = "MarkdownMessage";

export default function ChatPage() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-50 dark:bg-black font-sans">
      {/* Cabecera */}
      <header className="w-full border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-4 px-6 flex items-center gap-3 shadow-sm">
        <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">JS</div>
        <div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Joshep Stevens Borja</p>
          <p className="text-xs text-zinc-500">IT Project Manager · Gemelo Digital IA</p>
        </div>
      </header>

      {/* Mensajes */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-2">
            <span className="text-4xl">👋</span>
            <p className="text-base font-medium text-zinc-500 dark:text-zinc-400">¡Hola! Soy el asistente digital de Joshep.<br />Pregúntame sobre su experiencia, habilidades o proyectos.</p>
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
                  onClick={() => { setInput(suggestion); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`mb-4 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
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
        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-zinc-400 text-sm">
              <span className="animate-pulse">Escribiendo...</span>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="flex justify-start mb-4">
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-red-600 dark:text-red-400 text-sm">
              Ha ocurrido un error. Por favor, intenta de nuevo.
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <div className="w-full max-w-2xl mx-auto px-4 pb-6">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-white dark:bg-zinc-900 rounded-full shadow-md px-4 py-2 border border-zinc-200 dark:border-zinc-700">
          <input
            className="flex-1 bg-transparent outline-none text-sm py-2 px-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta sobre mi experiencia o proyectos..."
            disabled={isLoading}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-full text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? "..." : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
