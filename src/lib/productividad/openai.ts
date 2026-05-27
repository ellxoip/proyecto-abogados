export type AiCaseInput = {
  caseCode: string;
  category: string;
  stage: string;
  isDelicate: boolean;
  isPaid: boolean;
  createdAt: Date;
  lastUpdateAt: Date | null;
  totalTimeEntries: number;
  totalMinutesLogged: number;
  commentsCount: number;
  daysSinceLastEntry: number;
  daysSinceLastUpdate: number;
  slaMaxDays: number | null;
  slaElapsedDays: number;
};

export type AiRecommendation = {
  description: string;
  action: string;
  priority: "Urgente" | "Alta" | "Media" | "Baja";
  reason: string;
};

export type AiAnalysisResult = {
  healthScore: number;
  riskLevel: "BAJO" | "MEDIO" | "ALTO" | "CRITICO";
  estimatedDays: number | null;
  minDays: number | null;
  maxDays: number | null;
  stagnant: boolean;
  explanation: string;
  recommendations: AiRecommendation[];
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export async function analyzeCaseWithAI(input: AiCaseInput): Promise<AiAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY no configurado");

  const prompt = `Eres un sistema experto en gestión legal. Analiza este expediente y responde SOLO en JSON válido.

DATOS DEL EXPEDIENTE:
- Código: ${input.caseCode}
- Categoría: ${input.category}
- Estado: ${input.stage}
- Caso delicado: ${input.isDelicate ? "Sí" : "No"}
- Pago al día: ${input.isPaid ? "Sí" : "No"}
- Creado hace: ${Math.floor((Date.now() - input.createdAt.getTime()) / 86400000)} días
- Días sin registrar horas: ${input.daysSinceLastEntry}
- Días sin actualizaciones: ${input.daysSinceLastUpdate}
- Total horas registradas: ${(input.totalMinutesLogged / 60).toFixed(1)}h en ${input.totalTimeEntries} entradas
- Comentarios del equipo: ${input.commentsCount}
- SLA máximo: ${input.slaMaxDays ? input.slaMaxDays + " días" : "No definido"}
- Días de SLA transcurridos: ${input.slaElapsedDays}

Responde ÚNICAMENTE con este JSON:
{
  "healthScore": <número 0-100>,
  "riskLevel": <"BAJO"|"MEDIO"|"ALTO"|"CRITICO">,
  "estimatedDays": <número o null>,
  "minDays": <número o null>,
  "maxDays": <número o null>,
  "stagnant": <true|false>,
  "explanation": "<explicación en español simple, 2-3 oraciones, sin jerga técnica>",
  "recommendations": [
    {
      "description": "<problema específico>",
      "action": "<acción concreta a tomar>",
      "priority": <"Urgente"|"Alta"|"Media"|"Baja">,
      "reason": "<por qué es importante>"
    }
  ]
}

Reglas:
- healthScore 80-100 = BAJO riesgo, 50-79 = MEDIO, 20-49 = ALTO, 0-19 = CRITICO
- Solo genera recommendations si healthScore < 70
- Máximo 3 recomendaciones
- La explanation debe ser comprensible para un abogado, no para un técnico
- stagnant = true si no hay actividad reciente (>7 días sin horas Y >14 días sin actualizaciones)`;

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 800,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI devolvió respuesta vacía");

  return JSON.parse(content) as AiAnalysisResult;
}
