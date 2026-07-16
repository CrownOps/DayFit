# DayFit frontend — Next.js 16 (App Router).
#
# Build context is the REPO ROOT (Railway locates this file via
# RAILWAY_DOCKERFILE_PATH=frontend/Dockerfile), so COPY paths are prefixed
# with `frontend/`.
FROM node:22-slim

WORKDIR /app

# Install deps first for layer caching. Drop npm's download cache in the same
# layer — it's hundreds of MB that otherwise ships in the image (and blew past
# the prod VM's small disk during unpack).
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force

# App source.
COPY frontend/ .

# NEXT_PUBLIC_* are inlined at build time. Railway exposes service variables as
# build args; promote them to env so `next build` picks them up.
ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

RUN npm run build

# `next start` binds 0.0.0.0 and honors $PORT (Railway injects it).
ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npm run start"]
