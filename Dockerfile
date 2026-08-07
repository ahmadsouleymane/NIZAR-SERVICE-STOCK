# Nizar Stock — conteneur de production (Render / Railway / Fly.io)
# node:20-slim (glibc) : better-sqlite3 s'installe sans compilation.
FROM node:20-slim

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Dependances (reproductibles via le lockfile)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Code source
COPY . .

# La base de donnees et les uploads vivent sur le disque persistant (/data),
# configure par DB_PATH et UPLOAD_DIR (voir render.yaml).
ENV DB_PATH=/data/nizar.db
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads

EXPOSE 3000

CMD ["node", "server.js"]
