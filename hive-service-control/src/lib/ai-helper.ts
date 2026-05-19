"use server";

import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Genera un texto de ayuda utilizando una API de IA.
 * @returns {Promise<string>} Texto generado por la IA.
 */
export async function generateHelpText(): Promise<string> {
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY no configurada. Saltando generación de IA.");
    return "Funcionalidad de IA no disponible. Configure OPENAI_API_KEY en el archivo .env.";
  }

  try {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un asistente legal experto. Genera textos profesionales y concisos."
        },
        {
          role: "user",
          content: "Por favor, genera un texto de ayuda para un abogado que necesita redactar un informe sobre el progreso de un caso legal."
        }
      ],
      max_tokens: 150,
    }, {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error al generar texto de ayuda:", error);
    return "No se pudo generar el texto de ayuda. Por favor, intente nuevamente más tarde.";
  }
}