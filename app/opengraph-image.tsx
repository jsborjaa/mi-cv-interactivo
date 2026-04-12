import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Joshep Stevens Borja — CV Interactivo con IA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            background: "#3b82f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            fontWeight: "bold",
            color: "white",
            marginBottom: 32,
          }}
        >
          JS
        </div>

        {/* Name */}
        <div style={{ fontSize: 64, fontWeight: "bold", color: "white", lineHeight: 1.1, marginBottom: 16 }}>
          Joshep Stevens Borja
        </div>

        {/* Title */}
        <div style={{ fontSize: 32, color: "#93c5fd", marginBottom: 40 }}>
          IT Project Manager · PMP · ML Stanford
        </div>

        {/* Tag line */}
        <div
          style={{
            fontSize: 22,
            color: "#cbd5e1",
            background: "rgba(59,130,246,0.15)",
            border: "1px solid rgba(59,130,246,0.4)",
            borderRadius: 12,
            padding: "12px 24px",
          }}
        >
          💬 Pregúntame sobre mi experiencia — CV Interactivo con IA
        </div>
      </div>
    ),
    size
  );
}
