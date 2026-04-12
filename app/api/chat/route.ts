import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
    }

    // Leer cv.md desde /public vía fetch
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const cvRes = await fetch(`${baseUrl}/cv.md`);
    if (!cvRes.ok) {
      return NextResponse.json({ error: "cv.md not found" }, { status: 500 });
    }
    const cvContent = await cvRes.text();

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    const google = createGoogleGenerativeAI({ apiKey, model: "gemini-1.5-flash" });

    const systemPrompt = `Actúa como mi gemelo digital. Responde solo basándote en la información proporcionada en el documento adjunto. Sé conciso y profesional.\n\n${cvContent}`;

    const result = await streamText({
      model: google,
      system: systemPrompt,
      messages,
    });

    return result;
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
