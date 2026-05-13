export const UI_TEXT = {
  header: {
    name: "Joshep Stevens Borja",
    role: "IT Project Manager · Digital Twin AI",
    onlineBadge: "En línea",
    stopVoice: "Finalizar voz",
    linkedinUrl: "https://www.linkedin.com/in/joshep-stevens/",
    linkedinLabel: "LinkedIn",
  },
  emptyState: {
    greeting: "¡Hola! Soy el gemelo digital de Joshep.",
    subtitle: "Pregúntame sobre su experiencia, habilidades o proyectos.",
    voiceCta: "Hablar con el asistente",
    voiceRetry: "Reintentar voz",
    divider: "o escribe tu pregunta",
    voiceActive: "Sesión de voz iniciada.",
    voiceActiveHint: "Habla cuando quieras o escribe abajo.",
    chips: [
      "¿Qué experiencia tiene en gestión de proyectos?",
      "¿Tiene certificación PMP?",
      "¿Qué tecnologías domina?",
      "¿Tiene experiencia con IA?",
      "¿En qué proyectos ha trabajado?",
    ],
  },
  input: {
    placeholderVoice: "Habla o escribe aquí...",
    placeholderText: "Pregunta sobre su experiencia o proyectos...",
    sendLabel: "Enviar",
    micStart: "Iniciar sesión de voz",
    micStop: "Detener sesión de voz",
  },
  voice: {
    labels: {
      connecting: "Conectando...",
      listening: "Escuchando",
      thinking: "Procesando...",
      speaking: "Respondiendo",
      error: "Error de voz",
    },
  },
  messages: {
    typing: "Escribiendo...",
    thinking: "Procesando...",
    speaking: "Hablando...",
    textError:
      "Ha ocurrido un error al conectar. Por favor, intenta de nuevo.",
    textErrorVoiceCta: "cambiar al modo de voz",
    textErrorVoiceHint: "— suele ser más fluido y tiene menor latencia.",
  },
} as const;
