###############################################
# FRONTEND BUILD STAGE
###############################################
FROM node:18 AS frontend
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./
RUN npm run build


###############################################
# BACKEND BUILD STAGE
###############################################
FROM python:3.11-slim AS backend
WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/


###############################################
# FINAL RUNTIME IMAGE
###############################################
FROM python:3.11-slim AS final
WORKDIR /app

# Install FFmpeg for audio conversion
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Copy Python packages from backend stage
COPY --from=backend /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend /usr/local/bin /usr/local/bin

# Copy backend code
COPY --from=backend /app/backend ./backend

# Copy frontend build output
COPY --from=frontend /app/dist ./static

EXPOSE 8000

# Run from backend directory
WORKDIR /app/backend
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]