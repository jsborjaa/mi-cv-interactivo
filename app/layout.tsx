import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Joshep Stevens Borja — CV Interactivo",
  description:
    "Asistente digital de Joshep Stevens Borja Acosta, IT Project Manager certificado PMP con experiencia en arquitectura empresarial, Agile e inteligencia artificial.",
  openGraph: {
    title: "Joshep Stevens Borja — CV Interactivo con IA",
    description:
      "Habla directamente con el perfil profesional de Joshep: PMP, Machine Learning (Stanford), arquitectura empresarial y gestión de equipos técnicos.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
