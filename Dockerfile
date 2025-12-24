# Use Remotion-recommended base image for proper Chrome Headless Shell support
FROM node:22-bookworm-slim

LABEL org.opencontainers.image.title="Remotion Renderer"
LABEL org.opencontainers.image.description="Cloudflare Container for rendering Remotion videos"

# Set production environment
ENV NODE_ENV=production

# Install bun, curl (for healthcheck), and Chromium dependencies for Remotion
# Reference: https://www.remotion.dev/docs/miscellaneous/linux-dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  unzip \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm-dev \
  libglib2.0-0 \
  libnss3 \
  libpango-1.0-0 \
  libx11-6 \
  libxcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxkbcommon-dev \
  libxrandr2 \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get clean

# Install bun globally
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy dependency files first for better layer caching
COPY package.json bun.lock ./

# Install dependencies with bun
RUN bun install --frozen-lockfile --production

# Copy configuration files
COPY tsconfig.json remotion.config.ts ./

# Copy source and public assets
COPY src ./src
COPY public ./public

# Download browser and bundle Remotion
RUN npx remotion browser ensure \
  && npx remotion bundle

# Expose the port the server listens on
EXPOSE 8080

# Health check to verify container is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

CMD ["bun", "run", "src/server.ts"]
