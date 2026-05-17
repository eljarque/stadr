// Netlify Function (v2, ESM) — proxy al LLM para el generador de STADR.
//
// Por qué existe:
//  - La ANTHROPIC_API_KEY NUNCA debe estar en el navegador. Vive aquí como
//    variable de entorno de Netlify.
//  - Se reenvía el stream SSE de Anthropic tal cual al cliente. Al ir
//    fluyendo bytes desde el primer momento, esquivamos el límite de
//    ejecución de las funciones síncronas (el timeout que ya sufriste).
//
// Variables de entorno (Netlify → Site settings → Environment variables):
//  - ANTHROPIC_API_KEY   (obligatoria)
//  - ANTHROPIC_MODEL     (opcional, por defecto claude-sonnet-4-20250514)
//  - APP_ACCESS_TOKEN    (opcional) si se define, el cliente debe enviar
//                        la cabecera x-app-token con ese valor. Protege el
//                        endpoint para que terceros no gasten tu crédito.

const SYS_PROMPT = `Eres un arquitecto sociotécnico experto en Team Topologies, Domain-Driven Design y Architecture Modernization. Generas un Socio-Technical Architecture Decision Record (STADR) a partir de la transcripción de una sesión de arquitectura.

Un STADR documenta decisiones donde se cruzan estructura de equipos, cognitive load, modos de interacción, dependencias organizativas y arquitectura técnica. Su valor está en capturar el razonamiento sociotécnico, no solo el resultado.

REGLAS:
1. Lee la transcripción completa antes de escribir.
2. Identifica la decisión principal. Si hay varias independientes, elige la más relevante (una sola por STADR).
3. Separa hechos de inferencias. Antepón "[Inferido]" a cualquier afirmación no verbalizada explícitamente en la sesión.
4. NO inventes alternativas que no se hayan mencionado. Si solo se discutieron dos, devuelve dos.
5. Preserva el rationale real, incluidos desacuerdos y tensiones.
6. Estado: siempre "Propuesta" salvo que la transcripción confirme aprobación en sesión.
7. Actores: extrae nombres/equipos; si no están claros usa "[No identificado]".
8. Sé conciso. Sin lenguaje de relleno. Responde en español.

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto adicional, sin fences) con esta forma exacta:
{
 "title": string,
 "status": "Propuesta" | "Aceptada",
 "context": string,
 "dims": { "teamBoundaries":bool,"cognitiveLoad":bool,"interactionMode":bool,"dependencies":bool,"techArchitecture":bool,"governance":bool,"other":string },
 "problem": string,
 "actors": { "decide":string,"propone":string,"afectados":string,"consultados":string },
 "alternatives": [ { "name":string,"description":string,"advantages":string,"disadvantages":string,"whyDiscarded":string } ],
 "decision": { "option": "A"|"B"|"C"|"D"|"E"|"F"|"", "rationale":string },
 "meta": { "decisionDate":string,"reviewDate":string,"author":string,"sessionOrigin":string }
}
"decision.option" es la letra de la alternativa elegida según su orden en el array "alternatives" (la 1ª = "A").`;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // Control de acceso opcional
  const gate = process.env.APP_ACCESS_TOKEN;
  if (gate && req.headers.get("x-app-token") !== gate) {
    return json({ error: "No autorizado" }, 401);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(
      { error: "Falta ANTHROPIC_API_KEY en las variables de entorno de Netlify." },
      500
    );
  }

  let transcript;
  try {
    ({ transcript } = await req.json());
  } catch {
    return json({ error: "Cuerpo de la petición inválido." }, 400);
  }
  if (!transcript || String(transcript).trim().length < 40) {
    return json({ error: "Transcripción demasiado corta." }, 400);
  }

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 4000,
        stream: true,
        system: SYS_PROMPT,
        messages: [
          {
            role: "user",
            content:
              "Transcripción de la sesión de arquitectura:\n\n" + transcript,
          },
        ],
      }),
    });
  } catch (e) {
    return json({ error: "No se pudo contactar con el modelo: " + e.message }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return json(
      { error: `El modelo respondió ${upstream.status}: ${detail.slice(0, 300)}` },
      502
    );
  }

  // Reenvío directo del stream SSE al cliente.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
};
