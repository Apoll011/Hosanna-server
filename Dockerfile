# --- Build stage -------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage -------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Applies pending migrations then boots the API. Safe to run on every
# container start: `migrate deploy` is a no-op if the schema is current.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
