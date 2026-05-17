# STADR — WebApp desplegable en Netlify

Herramienta para documentar y almacenar **Socio-Technical Architecture Decision
Records**, con generación de borradores por LLM a partir de transcripciones de
sesión.

```
stadr-app/
├── index.html                      ← la aplicación (UI + lógica + persistencia)
├── netlify/
│   └── functions/
│       └── generate.mjs            ← proxy serverless al LLM (Anthropic)
├── netlify.toml                    ← rutas y configuración de Netlify
├── package.json                    ← versión de Node para las funciones
└── README.md
```

## Cómo funciona

- **Frontend**: una sola página estática. Los STADR se guardan en el
  `localStorage` del navegador (un solo usuario, sin base de datos).
- **LLM**: el navegador NO llama a Anthropic directamente. Llama a
  `/api/generate`, una Netlify Function que guarda la API key como variable
  de entorno y reenvía la respuesta en *streaming*. El streaming es lo que
  evita el límite de tiempo de las funciones síncronas.

## Despliegue (opción recomendada: Git + Netlify)

1. Sube esta carpeta a un repositorio (GitHub/GitLab/Bitbucket).
2. En Netlify: **Add new site → Import an existing project** y elige el repo.
3. Build settings: deja **Build command** vacío y **Publish directory** en `.`
   (ya viene definido en `netlify.toml`).
4. **Site configuration → Environment variables**, añade:

   | Variable | Obligatoria | Valor |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Sí | Tu clave de la API de Anthropic |
   | `ANTHROPIC_MODEL` | No | p. ej. `claude-sonnet-4-20250514` (por defecto) |
   | `APP_ACCESS_TOKEN` | No | Una frase secreta para proteger el endpoint |

5. **Deploy site**. Listo: `https://tu-sitio.netlify.app`.

> Tras cambiar variables de entorno, vuelve a desplegar (**Trigger deploy**)
> para que las funciones las recojan.

### Alternativa rápida (sin Git): Netlify CLI

```bash
npm install -g netlify-cli
cd stadr-app
netlify deploy --prod
# luego define las variables en el panel de Netlify y vuelve a desplegar
```

El *drag & drop* de Netlify Drop NO sirve aquí: no incluye las funciones
serverless. Usa Git o la CLI.

## Conectar el LLM

El "LLM conectado" es la `ANTHROPIC_API_KEY` que pones como variable de
entorno. Para cambiar de modelo, ajusta `ANTHROPIC_MODEL`.

¿Otro proveedor (OpenAI, Azure, modelo propio)? Solo hay que editar
`netlify/functions/generate.mjs`: cambiar la URL, las cabeceras de
autenticación y el parseo del stream. El contrato con el frontend no cambia
mientras la función siga devolviendo eventos SSE con el texto del modelo.

## Proteger el endpoint (recomendado en producción)

Sin protección, cualquiera con la URL puede gastar tu crédito de API.
Define `APP_ACCESS_TOKEN` con una frase secreta. La primera vez que generes
un borrador, la app pedirá esa clave y la recordará en este navegador.

## Probar en local

```bash
npm install -g netlify-cli
cd stadr-app
ANTHROPIC_API_KEY=sk-ant-... netlify dev
# abre http://localhost:8888
```
`netlify dev` levanta el sitio y las funciones juntos, con las redirecciones
de `netlify.toml`.

## Solución de problemas

- **"Falta ANTHROPIC_API_KEY"**: define la variable en Netlify y vuelve a
  desplegar.
- **401 / pide clave una y otra vez**: el valor de `APP_ACCESS_TOKEN` no
  coincide con el que introduces. Para quitar la protección, borra la
  variable y redespliega.
- **Se corta a mitad de generación**: aumenta el timeout de la función
  (Netlify → Functions; según el plan), o reduce el tamaño de la
  transcripción. El streaming ya mitiga la mayoría de estos casos.
- **El modelo devuelve algo que no es JSON**: reintenta; si persiste,
  acorta la transcripción y deja solo el tramo donde se discute la decisión.
- **Datos perdidos al cambiar de navegador/equipo**: es esperado, la
  persistencia es local. Usa "Descargar .md" para versionar cada STADR en
  Git, que es el destino recomendado en la guía STADR.

## Flujo de uso

1. Sesión de arquitectura → transcripción.
2. *Generar desde transcripción* → el LLM produce un borrador en estado
   **Propuesta**.
3. Revisión humana (~15 min): ¿hechos correctos?, ¿alternativas bien
   representadas?, ¿trade-offs honestos?
4. Cambia el estado a **Aceptada** y *Descargar .md* al repositorio.
