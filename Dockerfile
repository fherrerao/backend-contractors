# ---- build ----
  FROM node:22-slim AS build

  WORKDIR /app
  
  RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
  
  COPY package.json package-lock.json ./
  COPY prisma ./prisma
  COPY prisma.config.ts ./
  
  # prisma.config.ts exige DATABASE_URL; solo hace falta un valor dummy en generate
  ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
  
  RUN npm ci
  
  COPY nest-cli.json tsconfig.json tsconfig.build.json* ./
  COPY src ./src
  
  RUN npx prisma generate && npm run build
  
  # ---- runtime ----
  FROM node:22-slim AS runtime
  
  WORKDIR /app
  
  ENV NODE_ENV=production
  ENV PORT=8080
  
  RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --create-home app
  
  COPY package.json package-lock.json ./
  COPY prisma ./prisma
  COPY prisma.config.ts ./
  
  # prisma (devDependency) hace falta para `migrate deploy`
  RUN npm ci --omit=dev \
    && npm install prisma@7.10.0 --no-save \
    && chown -R app:app /app
  
  COPY --from=build --chown=app:app /app/dist ./dist
  
  USER app
  
  EXPOSE 8080
  
  CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]