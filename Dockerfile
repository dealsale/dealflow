# ── Panel (React) ────────────────────────────────────────────
FROM node:22-bookworm-slim AS app-build
WORKDIR /build/app
COPY app/package*.json ./
RUN npm ci
COPY app/ .
RUN npm run build

# ── API (Express + SQLite) ───────────────────────────────────
FROM node:22-bookworm-slim AS server-build
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build

# ── Imagen final: un solo contenedor sirve API + panel ───────
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /srv
# ffmpeg: convierte las notas de voz grabadas a ogg/opus (formato de WhatsApp)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /build/server/dist ./dist
COPY --from=app-build /build/app/dist ./app-dist
COPY landing.html ./landing.html
ENV APP_DIST=/srv/app-dist DATA_DIR=/srv/data PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
