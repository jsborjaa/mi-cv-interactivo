"use client";
import React, { useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";

const MarkdownMessage = React.memo(({ content }: { content: string }) => (
  <ReactMarkdown className="prose dark:prose-invert max-w-none">{content}</ReactMarkdown>
));

export default function ChatPage() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({ api: "/api/chat" });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-50 dark:bg-black font-sans">
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl w-full mx-auto">
        {messages.map((m, i) => (
          <div key={i} className={`mb-4 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`rounded-lg px-4 py-2 max-w-[80%] text-base shadow ${m.role === "user" ? "bg-blue-500 text-white" : "bg-white dark:bg-zinc-900 text-black dark:text-zinc-100"}`}>
              {m.role === "assistant" ? (
                <MarkdownMessage content={m.content} />
              ) : (
                <span>{m.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>
      <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto px-4 pb-6">
        <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 rounded-full shadow px-4 py-2">
          <input
            className="flex-1 bg-transparent outline-none text-base py-2 px-2 dark:text-zinc-100"
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Escribe tu mensaje..."
            disabled={isLoading}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-full transition-colors disabled:opacity-50"
          >
            {isLoading ? "..." : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
