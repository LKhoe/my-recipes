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

# Fail the build if lib/db/schema.ts has changes without a committed migration. It never
# generates one into the image (an uncommitted migration shipping to production, or an interactive
# drizzle-kit prompt hanging the build): db:check works on a temp copy, with stdin closed.
RUN npm run db:check

# Build args for NEXT_PUBLIC_ vars (must be available at build time)
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Build the application (output: "standalone" is set in next.config.ts)
RUN npm run build

# Bundle the scripts that run inside the container (migrate, seed, create-invite) with their
# dependencies (pg, drizzle-orm) into single files: the runner needs no node_modules for them.
RUN npm run scripts:bundle

# npm installs sharp's prebuilt binaries for glibc and musl; this image is Alpine (musl), so the
# glibc ones (~18 MB) are dead weight, both in the standalone output and in the copy below.
RUN find node_modules/@img .next/standalone/node_modules/@img -maxdepth 1 -name '*-linux-*' ! -name '*musl*' -exec rm -rf {} +

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# postgresql-client for the backup export route (SPEC §4.9), which spawns pg_dump directly. Its
# major version must be >= the server's (local-infra's PG_VERSION, currently 17) or pg_dump
# refuses to run with "server version mismatch".
ARG PG_MAJOR=17
RUN apk add --no-cache postgresql${PG_MAJOR}-client

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only the necessary files for standalone mode
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# sharp's native pieces. Next's file tracing copies sharp's JS into the standalone node_modules
# but misses the dlopen'd libvips .so, and a libvips that doesn't match the locked sharp fails at
# load with "libvips-cpp.so.X: No such file". Copying @img from the builder keeps them in lockstep
# with the lockfile (never `npm install <pkg>` here: it re-resolves every dependency to latest).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img

# Database migration files and the bundled scripts (self-contained .mjs from `npm run scripts:bundle`,
# same paths the entrypoint and DEPLOY.md use: node scripts/migrate.mjs, seed.mjs, create-invite.mjs)
COPY --from=builder --chown=nextjs:nodejs /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/dist-scripts ./scripts

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
