import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface LogPayload {
  sessionId: string;
  type: "text" | "voice";
  messages: ConversationMessage[];
  startedAt: string; // ISO timestamp
  durationSeconds?: number;
}

function detectLanguage(messages: ConversationMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "unknown";
  return /[áéíóúñü¿¡]/i.test(firstUserMsg.content) ? "es" : "en";
}

export async function POST(req: NextRequest) {
  let body: LogPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sessionId, type, messages, startedAt, durationSeconds } = body;

  if (!sessionId || !type || !Array.isArray(messages) || !startedAt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate sessionId is a UUID (prevent arbitrary string injection)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
  }

  if (!["text", "voice"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  // Guard against oversized payloads
  if (messages.length > 200) {
    return NextResponse.json({ error: "Too many messages" }, { status: 400 });
  }

  for (const msg of messages) {
    if (typeof msg.content === "string" && msg.content.length > 10000) {
      return NextResponse.json({ error: "Message content too long" }, { status: 400 });
    }
  }

  const language = detectLanguage(messages);
  const turnCount = messages.filter((m) => m.role === "user").length;

  const { error } = await supabase.from("conversations").upsert(
    {
      session_id: sessionId,
      type,
      started_at: startedAt,
      updated_at: new Date().toISOString(),
      turn_count: turnCount,
      language,
      messages,
      ...(durationSeconds !== undefined ? { duration_s: durationSeconds } : {}),
    },
    { onConflict: "session_id" }
  );

  if (error) {
    console.error("[log-conversation] Supabase error:", error.message);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }

  return new NextResponse(null, { status: 200 });
}
