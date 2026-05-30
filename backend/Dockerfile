FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# No CMD — Railway injects $PORT via startCommand in railway.toml
# Local: docker run -e PORT=8000 ... uvicorn main:app --host 0.0.0.0 --port $PORT
