import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, convertToModelMessages, UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
    }

    // Leer cv.md desde /public vía fetch (compatible con Edge Runtime)
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

    // createGoogleGenerativeAI retorna un proveedor; el modelo se obtiene llamándolo
    const google = createGoogleGenerativeAI({ apiKey });

    const systemPrompt = `Actúa como el gemelo digital de Joshep Stevens Borja Acosta. Responde SOLO basándote en la información del CV adjunto. Si te preguntan algo que no está en el CV, indícalo educadamente. Sé conciso y profesional.\n\n${cvContent}`;

    const result = await streamText({
      model: google("gemini-2.0-flash"),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
    });

    // toUIMessageStreamResponse es el formato correcto para el nuevo AI SDK
    return result.toUIMessageStreamResponse();
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
