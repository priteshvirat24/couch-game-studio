# Couch Game Studio server: production image
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache git
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "server/index.js"]
