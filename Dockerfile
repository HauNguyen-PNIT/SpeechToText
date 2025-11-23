###############################################
# FRONTEND BUILD STAGE
###############################################
FROM node:18 AS frontend
WORKDIR /app

# Copy deps first for cache
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

# Copy source
COPY frontend/ ./

# Build Vite to /app/dist
RUN npm run build


###############################################
# BACKEND BUILD STAGE
###############################################
FROM python:3.11-slim AS backend
WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .


###############################################
# FINAL RUNTIME IMAGE
###############################################
FROM python:3.11-slim AS final
WORKDIR /app

# Copy backend
COPY --from=backend /app/backend ./backend

# Copy frontend build output
COPY --from=frontend /app/dist ./static

EXPOSE 8000

CMD ["python", "backend/server.py"]
