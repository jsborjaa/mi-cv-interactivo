import { GoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
    }

    // Leer el archivo cv.md como system prompt
    const cvPath = path.join(process.cwd(), "cv.md");
    let cvContent = "";
    try {
      cvContent = await fs.readFile(cvPath, "utf8");
    } catch (e) {
      return NextResponse.json({ error: "cv.md not found" }, { status: 500 });
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 });
    }

    const google = new GoogleGenerativeAI({ apiKey, model: "gemini-1.5-flash" });

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
