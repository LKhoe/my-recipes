# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files, then strip the version field so version bumps don't bust the npm ci cache
COPY package.json package-lock.json ./
RUN sed -i '3s/"version": "[^"]*"/"version": "0.0.0"/' package.json package-lock.json

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source files (overwrites package.json with the real version)
COPY . .

# This project has no static assets yet — ensure the directory exists so the runner stage's
# COPY --from=builder /app/public doesn't fail if one is never added
RUN mkdir -p public

# Generate drizzle migrations before build (no-op if already committed, but keeps the image
# self-sufficient if a migration was added without running db:generate locally)
RUN npm run db:generate

# Build args for NEXT_PUBLIC_ vars (must be available at build time)
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Build the application (output: "standalone" is set in next.config.ts)
RUN npm run build

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# postgresql-client (matching the postgres:16 service's major version) for the backup export
# route (SPEC §4.9), which spawns pg_dump directly.
RUN apk add --no-cache postgresql16-client

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Runtime deps needed for the migration/seed scripts (pg + drizzle-orm), not bundled by
# Next's standalone output since those scripts run outside the Next.js server process.
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./
RUN npm install --no-save pg drizzle-orm

# Copy only the necessary files for standalone mode
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy database migration files and migration/seed scripts (plain .mjs — no tsx/drizzle-kit needed)
COPY --from=builder --chown=nextjs:nodejs /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Uploads directory (SPEC §4.8) — mounted as a volume in docker-compose, created here so the
# nextjs user owns it even before the volume is attached
RUN mkdir uploads && chown nextjs:nodejs uploads

# Copy and set up entrypoint script
COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Set entrypoint and command
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
