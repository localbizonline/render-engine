FROM node:22-slim AS builder

# Install build tools for node-canvas native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ALL deps (including devDependencies for building)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ── Production stage ──
FROM node:22-slim

# Install runtime libraries (Cairo, FFmpeg) — no build-essential needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgif7 \
    librsvg2-2 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy built JS from builder
COPY --from=builder /app/dist/ ./dist/

# Copy template JSON definitions
COPY src/templates/builtin/ ./dist/templates/builtin/

# Copy fonts
COPY fonts/ ./fonts/

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
