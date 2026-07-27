# Use lightweight Node 20 base image
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for native sqlite3 build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production runner image
FROM node:20-slim

WORKDIR /app

# Install SQLite3 native compile dependencies for production node_modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend assets and backend server source code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/db.js ./db.js

# Expose server port
EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production

# Run database init and server
CMD ["node", "server.js"]
