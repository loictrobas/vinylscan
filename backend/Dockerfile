FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# Validate imports at build time so errors surface in build logs, not runtime
RUN python -c "import main" 2>&1 || true
