# ── Panel (React) ────────────────────────────────────────────
FROM node:22-bookworm-slim AS app-build
WORKDIR /build/app
COPY app/package*.json ./
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY app/ .
RUN npm run build

# ── API (Express + SQLite) ───────────────────────────────────
FROM node:22-bookworm-slim AS server-build
WORKDIR /build/server
# Herramientas para compilar módulos nativos (better-sqlite3) si la descarga de su binario
# precompilado falla o se demora: sin ellas, un timeout de red tumbaba el despliegue.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY server/ .
RUN npm run build && npm prune --omit=dev

# ── Imagen final: un solo contenedor sirve API + panel ───────
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /srv
# ffmpeg: convierte las notas de voz grabadas a ogg/opus (formato de WhatsApp)
# poppler-utils (pdftoppm): convierte el PDF de la guía en imagen para enviarla por WhatsApp
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg poppler-utils && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
# Las dependencias ya instaladas (y compiladas) en la etapa anterior, sin las de desarrollo: misma
# imagen base, así que los módulos nativos sirven tal cual y no se vuelven a descargar ni compilar.
COPY --from=server-build /build/server/node_modules ./node_modules
COPY --from=server-build /build/server/dist ./dist
# Capturas que Academy precarga en su primer arranque (tsc no copia binarios).
COPY --from=server-build /build/server/assets ./assets
COPY --from=app-build /build/app/dist ./app-dist
COPY landing.html ./landing.html
COPY dropshipping.html ./dropshipping.html
ENV APP_DIST=/srv/app-dist DATA_DIR=/srv/data PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
