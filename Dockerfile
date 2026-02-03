FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache postgresql postgresql-contrib su-exec
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
COPY SKILL.md ./SKILL.md
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Setup PostgreSQL data directory
RUN mkdir -p /var/lib/postgresql/data /var/log /run/postgresql && \
    chown -R postgres:postgres /var/lib/postgresql /var/log /run/postgresql

EXPOSE 3001
CMD ["./start.sh"]
