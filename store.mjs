// Netlify Function — catálogo STADR compartido sobre Netlify Blobs.
//
// Netlify Blobs es el almacén integrado de Netlify: cero configuración,
// persistente, compartido por todos los usuarios del sitio. No requiere
// crear ninguna base de datos externa.
//
// Acciones (POST { action, ... }):
//   list                       → { items:[{id,number,title,status,updatedAt}] }
//   get    { id }              → { record }
//   put    { record }          → { record }   (crea o actualiza)
//   delete { id }              → { ok:true }
//
// Variables de entorno:
//   APP_ACCESS_TOKEN (opcional) → si está, exige cabecera x-app-token.

import { getStore } from "@netlify/blobs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const INDEX_KEY = "__index__";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const gate = process.env.APP_ACCESS_TOKEN;
  if (gate && req.headers.get("x-app-token") !== gate) {
    return json({ error: "No autorizado" }, 401);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido" }, 400);
  }

  const store = getStore({ name: "stadr", consistency: "strong" });
  const action = body.action;

  try {
    if (action === "list") {
      const idx = (await store.get(INDEX_KEY, { type: "json" })) || [];
      idx.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return json({ items: idx });
    }

    if (action === "get") {
      if (!body.id) return json({ error: "Falta id" }, 400);
      const rec = await store.get("rec:" + body.id, { type: "json" });
      if (!rec) return json({ error: "No encontrado" }, 404);
      return json({ record: rec });
    }

    if (action === "put") {
      const rec = body.record;
      if (!rec || !rec.id) return json({ error: "Registro inválido" }, 400);
      rec.updatedAt = Date.now();
      await store.setJSON("rec:" + rec.id, rec);

      const idx = (await store.get(INDEX_KEY, { type: "json" })) || [];
      const meta = {
        id: rec.id,
        number: rec.number || "XXX",
        title: rec.title || "(sin título)",
        status: rec.status || "Propuesta",
        updatedAt: rec.updatedAt,
      };
      const i = idx.findIndex((x) => x.id === rec.id);
      if (i >= 0) idx[i] = meta;
      else idx.unshift(meta);
      await store.setJSON(INDEX_KEY, idx);
      return json({ record: rec });
    }

    if (action === "delete") {
      if (!body.id) return json({ error: "Falta id" }, 400);
      await store.delete("rec:" + body.id);
      const idx = (await store.get(INDEX_KEY, { type: "json" })) || [];
      await store.setJSON(
        INDEX_KEY,
        idx.filter((x) => x.id !== body.id)
      );
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida: " + action }, 400);
  } catch (e) {
    return json({ error: "Error en el almacén: " + e.message }, 500);
  }
};
