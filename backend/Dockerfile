# DayFit backend — FastAPI on Python 3.12 (pinned: bcrypt/psycopg/cryptography
# wheels are not available on 3.13/3.14).
#
# Build context is the REPO ROOT (Railway uploads the git root and locates this
# file via RAILWAY_DOCKERFILE_PATH=backend/Dockerfile), so all COPY paths are
# prefixed with `backend/`.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for layer caching.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App source (alembic/, app/, scripts/, alembic.ini).
COPY backend/ .

# Railway/most PaaS inject $PORT; default to 8000 for local `docker run`.
ENV PORT=8000
EXPOSE 8000

# Run migrations then start the API. Single replica → APScheduler runs once.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
