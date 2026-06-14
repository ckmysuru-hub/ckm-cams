FROM python:3.11-slim

# System deps for reportlab + pillow + bcrypt builds
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (better layer caching)
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

EXPOSE 8001

# Reload is convenient when the host folder is mounted as a volume. Access logs
# are disabled to keep routine polling/health traffic out of application logs.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--reload", "--no-access-log", "--log-level", "warning"]
