FROM oven/bun:1-debian

RUN apt-get update && apt-get install -y \
  libnss3 \
  libdbus-1-3 \
  libatk1.0-0 \
  libgbm-dev \
  libasound2 \
  libxrandr2 \
  libxkbcommon-dev \
  libxfixes3 \
  libxcomposite1 \
  libxdamage1 \
  libatk-bridge2.0-0 \
  libpango-1.0-0 \
  libcairo2 \
  libcups2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock* tsconfig.json* remotion.config.* ./
COPY src ./src
COPY public ./public

RUN bun install --frozen-lockfile

RUN bunx remotion browser ensure
RUN bunx remotion bundle

CMD ["bun", "run", "src/server.ts"]

EXPOSE 8080
