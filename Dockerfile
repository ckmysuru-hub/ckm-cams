# ==========================================
# Stage 1: Build the React Frontend
# ==========================================
FROM node:20-bullseye-slim AS frontend-builder

WORKDIR /app/frontend

# Install dependencies first for caching
COPY frontend/package.json frontend/yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install

# Copy source and build
COPY frontend/ ./
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}
RUN yarn build

# ==========================================
# Stage 2: Setup the FastAPI Backend
# ==========================================
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# System deps for reportlab + pillow + bcrypt builds
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Install Python deps
COPY backend/requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ ./

# Copy the compiled React build from Stage 1 into the backend directory
COPY --from=frontend-builder /app/frontend/build ./frontend_build

# Expose the API/Web port
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8001/api/health || exit 1

# Run the unified server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--no-access-log"]
