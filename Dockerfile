FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

ARG NEXT_PUBLIC_LATTICE_API
ENV NEXT_PUBLIC_LATTICE_API=$NEXT_PUBLIC_LATTICE_API

ARG NEXT_PUBLIC_APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

ENV NEXT_TELEMETRY_DISABLED=1

RUN --mount=type=cache,id=lattice-web-next,target=/app/.next/cache npm run build

# ---

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 127.0.0.1, not localhost: the server listens on 0.0.0.0 (IPv4 only), and
# busybox wget resolves localhost to ::1 first, so the check was refused and
# the container reported unhealthy forever.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
