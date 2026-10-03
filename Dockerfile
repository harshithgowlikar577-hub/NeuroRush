FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy dependency files
COPY backend/package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application backend and public assets
COPY backend/ ./

# Expose server port
EXPOSE 5000

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Start server
CMD ["node", "server.js"]
