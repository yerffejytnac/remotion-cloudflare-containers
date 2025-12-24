FROM oven/bun:1-debian

LABEL org.opencontainers.image.title="Remotion Renderer"
LABEL org.opencontainers.image.description="Cloudflare Container for rendering Remotion videos"

# Set production environment
ENV NODE_ENV=production

# Install curl (for healthcheck) and Chromium dependencies for Remotion
# Combining into single layer and sorting alphabetically for maintainability
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libgbm-dev \
  libnss3 \
  libpango-1.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon-dev \
  libxrandr2 \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get clean

WORKDIR /app

# Copy dependency files first for better layer caching
# Changes to source code won't invalidate the npm install layer
COPY --chown=bun:bun package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy configuration files
COPY --chown=bun:bun tsconfig.json remotion.config.ts ./

# Copy source and public assets
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun public ./public

# Download browser and bundle Remotion in single layer
RUN bunx remotion browser ensure \
  && bunx remotion bundle

# Expose the port the server listens on
EXPOSE 8080

# Health check to verify container is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

# Run as non-root user for security (bun image includes 'bun' user)
USER bun

CMD ["bun", "run", "src/server.ts"]