# STADR — WebApp (catálogo compartido + LLM)

Herramienta para documentar, almacenar y **verificar** Socio-Technical
Architecture Decision Records, con catálogo compartido en base de datos y
generación/auditoría asistida por LLM.

```
stadr-app/
├── index.html                  ← la aplicación (UI + lógica)
├── netlify/functions/
│   ├── generate.mjs            ← genera STADR desde transcripción (streaming)
│   ├── check.mjs               ← verifica conformidad + estructura un doc subido
│   └── store.mjs               ← catálogo compartido (Netlify Blobs)
├── netlify.toml                ← rutas /api/* y build
├── package.json                ← dependencia @netlify/blobs
├── .env.example                ← plantilla de variables
└── .gitignore
```

## Qué hace

- **Documentar a mano**: editor con la estructura del template. Numeración
  de secciones dinámica: las secciones opcionales (Trade-offs, Señales de
  alarma, Plan de contingencia) se omiten si están vacías, igual que en el
  ejemplo real STADR-001 (que va de 1.Contexto a 7.Revisión).
- **Dimensión sociotécnica con matices**: cada dimensión marcada admite una
  anotación breve ("Colaboración crónica", "no hay ownership end-to-end"),
  tal como aparece en STADR-001.
- **Generar desde transcripción**: pega la sesión, el LLM produce un borrador
  en estado `Propuesta` para tu revisión humana.
- **Subir y verificar archivo**: sube un STADR existente (`.md`, `.txt`,
  `.pdf`, `.docx`). El texto se extrae en el navegador y el LLM emite un
  informe de conformidad con el template (qué secciones están presentes,
  incompletas o ausentes) y estructura el contenido para cargarlo al editor
  y almacenarlo en el catálogo.
- **Catálogo compartido**: todos los STADR viven en Netlify Blobs (la base
  de datos integrada de Netlify), accesibles desde cualquier dispositivo y
  por todo el equipo.

## Conectar el LLM (la API key)

La clave **no se incrusta en el código** — eso la expondría a cualquiera con
acceso a la URL o al repositorio, que podría gastar tu crédito sin límite.
La forma correcta y, en la práctica, igual de directa, es ponerla **una vez**
como variable de entorno en Netlify. Las funciones la leen en el servidor; el
navegador nunca la ve.

## Despliegue (Git + Netlify, recomendado)

1. Sube esta carpeta a un repositorio (GitHub/GitLab/Bitbucket).
2. Netlify → **Add new site → Import an existing project** → elige el repo.
3. Build settings: ya vienen en `netlify.toml` (build `npm install`,
   publish `.`). No toques nada.
4. **Site configuration → Environment variables** → añade:

   | Variable | Obligatoria | Valor |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Sí | Tu clave de la API de Anthropic |
   | `ANTHROPIC_MODEL` | No | por defecto `claude-sonnet-4-20250514` |
   | `APP_ACCESS_TOKEN` | No (recom.) | Frase secreta que protege la app |

5. **Deploy site**. Netlify Blobs se activa solo, sin configuración extra.

> Tras crear o cambiar variables, **Trigger deploy** de nuevo para que las
> funciones las recojan.

El *drag & drop* de Netlify Drop NO sirve (no incluye funciones ni Blobs).
Usa Git o la CLI.

### Alternativa: Netlify CLI

```bash
npm install -g netlify-cli
cd stadr-app
netlify deploy --build --prod
# define las variables en el panel y vuelve a desplegar
```

## Probar en local

```bash
npm install -g netlify-cli
cd stadr-app
cp .env.example .env      # rellena ANTHROPIC_API_KEY
netlify dev               # http://localhost:8888
```
`netlify dev` levanta la app, las funciones y un Blobs local con las
redirecciones de `netlify.toml`.

## Proteger la app (producción)

Sin `APP_ACCESS_TOKEN`, cualquiera con la URL puede gastar tu crédito y ver
o editar el catálogo. Define esa variable con una frase larga; la primera
operación pedirá la clave y la recordará en ese navegador.

## Flujo de uso

1. Sesión de arquitectura → transcripción → *Generar desde transcripción*.
   O bien: documento STADR existente → *Subir y verificar archivo*.
2. Revisión humana (~15 min): hechos, alternativas, trade-offs.
3. Estado → `Aceptada`. Queda en el catálogo compartido y, si quieres,
   *Descargar .md* al repositorio Git de arquitectura.

## Solución de problemas

- **"Falta ANTHROPIC_API_KEY"**: define la variable en Netlify y redespliega.
- **No carga el catálogo / error de almacén**: solo funciona desplegado o
  con `netlify dev` (Blobs no existe abriendo el HTML directamente).
- **401 / pide la clave repetidamente**: el valor introducido no coincide
  con `APP_ACCESS_TOKEN`. Para abrir el acceso, borra la variable y
  redespliega.
- **No extrae texto del PDF/DOCX**: PDFs escaneados (imágenes) no tienen
  texto seleccionable; convéncelo a `.md`/`.txt` o usa OCR antes.
- **Generación cortada**: el streaming mitiga el timeout; si persiste,
  acorta la transcripción al tramo de la decisión.

## Cambiar de proveedor de LLM

Edita `generate.mjs` y `check.mjs`: URL, cabeceras de auth y parseo. El
contrato con el frontend no cambia mientras se devuelva texto (SSE en
generate, JSON en check).
