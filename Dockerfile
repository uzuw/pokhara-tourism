# --- API (Express + SQLite) ------------------------------------------------
# The UI is a separate image: ./frontend/Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --omit=dev: the runtime image never carries jest/playwright/autocannon
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public

# SQLite file lives on a volume so it survives redeploys.
RUN mkdir -p /data && chown -R app:app /data
USER app

ENV PORT=4000 \
    HOST=0.0.0.0 \
    TRUST_PROXY=loopback \
    TOURISM_DB_FILE=/data/tourism.db \
    BODY_LIMIT=64kb

EXPOSE 4000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
