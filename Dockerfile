FROM node:22-bookworm-slim AS builder

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
FROM node:22-bookworm-slim

# Runtime aligned with HyperFrames' production Docker render stack, while
# keeping the Cairo libs required by the non-HyperFrames routes in this service.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    chromium \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgif7 \
    librsvg2-2 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libxshmfence1 \
    libgtk-3-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    fonts-noto-core \
    fonts-noto-extra \
    fonts-noto-ui-core \
    fonts-freefont-ttf \
    fonts-dejavu-core \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && fc-cache -fv

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CONTAINER=true

RUN npx --yes @puppeteer/browsers install chrome-headless-shell@stable --path /root/.cache/puppeteer
RUN SHELL_PATH=$(find /root/.cache/puppeteer/chrome-headless-shell -name "chrome-headless-shell" -type f | head -1) \
    && ln -s "$SHELL_PATH" /usr/local/bin/chrome-headless-shell

ENV PRODUCER_HEADLESS_SHELL_PATH=/usr/local/bin/chrome-headless-shell

# Copy built JS from builder
COPY --from=builder /app/dist/ ./dist/

# Copy template JSON definitions
COPY src/templates/builtin/ ./dist/templates/builtin/

# Copy fonts
COPY fonts/ ./fonts/

# Copy static frontend files (designer UI)
COPY public/ ./public/

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
