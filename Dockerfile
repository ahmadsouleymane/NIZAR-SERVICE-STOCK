# Nizar Stock — conteneur de production (Render plan gratuit / Railway / Fly.io)
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

# Sur le plan gratuit, PAS de disque persistant : la base et les uploads vivent
# dans le conteneur (éphémère). La base est restaurée depuis GitHub au démarrage
# puis sauvegardée en continu (voir services/cloud_backup.js et render.yaml).
ENV DB_PATH=/app/data/nizar.db
ENV UPLOAD_DIR=/app/public/uploads
RUN mkdir -p /app/data /app/public/uploads

EXPOSE 3000

CMD ["node", "server.js"]
