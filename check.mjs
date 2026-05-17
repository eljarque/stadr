// Netlify Function — verifica si un documento se ajusta al template STADR
// y, de paso, lo estructura para poder cargarlo en el editor.
//
// POST { text }  →  { conformance:{...}, record:{...} }
//
// Variables de entorno: ANTHROPIC_API_KEY (oblig.), ANTHROPIC_MODEL (opc.),
// APP_ACCESS_TOKEN (opc.).

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const SYS = `Eres un auditor de Socio-Technical Architecture Decision Records (STADR).

El template STADR canónico tiene estas secciones:
1. Contexto · 2. Dimensión sociotécnica · 3. Problema · 4. Actores
(Decide/Propone/Afectados/Consultados) · 5. Alternativas evaluadas
(cada una con Ventajas, Inconvenientes y por qué se descartó/mantiene) ·
6. Decisión (alternativa elegida + rationale) · 7. Revisión
(fecha de decisión, revisar en, autor/a, sesión de origen, reemplaza a,
reemplazada por).

Trade-offs aceptados, Señales de alarma y Plan de contingencia son secciones
OPCIONALES: su ausencia NO penaliza la conformidad (no las marques como
"missing", márcalas "ok" si no aplican o si su contenido está integrado en
la Decisión).

Recibirás el texto de un documento. Haz dos cosas:

A) Evalúa su conformidad con el template.
B) Estructura su contenido en el esquema de datos del editor.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown ni fences) con la forma:
{
 "conformance": {
   "score": number,                       // 0-100
   "verdict": "conforme"|"parcial"|"incompleto",
   "verdictLabel": string,
   "summary": string,                     // 1-2 frases
   "sections": [ { "name": string, "status": "ok"|"weak"|"missing", "note": string } ]
 },
 "record": {
   "number": string,
   "title": string,
   "status": "Propuesta"|"Aceptada"|"Reemplazada"|"Deprecada",
   "context": string,
   "dims": { "teamBoundaries":bool,"cognitiveLoad":bool,"interactionMode":bool,"dependencies":bool,"techArchitecture":bool,"governance":bool,"other":string },
   "dimNotes": { "teamBoundaries":string,"cognitiveLoad":string,"interactionMode":string,"dependencies":string,"techArchitecture":string,"governance":string },
   "problem": string,
   "actors": { "decide":string,"propone":string,"afectados":string,"consultados":string },
   "alternatives": [ { "name":string,"description":string,"advantages":string,"disadvantages":string,"whyDiscarded":string } ],
   "decision": { "option": "A"|"B"|"C"|"D"|"E"|"F"|"", "rationale":string },
   "tradeoffs": [string],
   "alarms": [string],
   "contingency": string,
   "meta": { "decisionDate":string,"reviewDate":string,"author":string,"sessionOrigin":string,"replaces":string,"replacedBy":string }
 }
}

Notas de mapeo:
- "Autonomía" / "ownership end-to-end" → dims.governance.
- "Colaboración crónica" o cualquier modo de interacción → dims.interactionMode.
- "arquitectura por capas" / impacto técnico en equipos → dims.techArchitecture.
- El matiz entre paréntesis de cada dimensión va en dimNotes (la misma clave).
- decision.option es la letra de la alternativa elegida por su orden (1ª = "A").
- Si una sección obligatoria falta o está vacía, status "missing"; si está
  presente pero pobre/ambigua, "weak"; si cumple, "ok".
- Responde en español. Sé conciso.`;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const gate = process.env.APP_ACCESS_TOKEN;
  if (gate && req.headers.get("x-app-token") !== gate) {
    return json({ error: "No autorizado" }, 401);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return json({ error: "Falta ANTHROPIC_API_KEY en Netlify." }, 500);

  let text;
  try {
    ({ text } = await req.json());
  } catch {
    return json({ error: "Cuerpo inválido" }, 400);
  }
  if (!text || String(text).trim().length < 40)
    return json({ error: "El documento no contiene texto suficiente." }, 400);

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: SYS,
        messages: [
          { role: "user", content: "Documento a auditar:\n\n" + text },
        ],
      }),
    });
  } catch (e) {
    return json({ error: "No se pudo contactar con el modelo: " + e.message }, 502);
  }

  if (!r.ok) {
    const d = await r.text().catch(() => "");
    return json({ error: `El modelo respondió ${r.status}: ${d.slice(0, 300)}` }, 502);
  }

  const data = await r.json();
  let out = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  out = out.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = out.indexOf("{"),
    e = out.lastIndexOf("}");
  if (s < 0 || e < 0)
    return json({ error: "El modelo no devolvió JSON válido." }, 502);

  try {
    return json(JSON.parse(out.slice(s, e + 1)));
  } catch {
    return json({ error: "No se pudo parsear la respuesta del modelo." }, 502);
  }
};
