import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from googleapiclient.errors import HttpError

from app.api import (
    auth,
    books,
    calendar,
    habits,
    integrations,
    push,
    snippets,
    tasks,
    team,
    token_usage,
    users,
)
from app.core.config import settings
from app.services.notification_scheduler import start_scheduler, stop_scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="DayFit API", lifespan=lifespan)


@app.exception_handler(HttpError)
async def google_http_error_handler(request: Request, exc: HttpError):
    """Translate errors from the Google API client into clean HTTP responses.

    An unhandled ``HttpError`` bubbles up to Starlette's ServerErrorMiddleware,
    which returns a bare 500 that never passes back through CORSMiddleware — so
    the browser sees a misleading "No Access-Control-Allow-Origin" CORS error
    instead of the real failure. Handling it here means the response flows back
    out through the CORS middleware and carries the proper headers.
    """
    status = getattr(exc.resp, "status", None) or 502
    # A 4xx from Google means the request we sent was bad (e.g. an empty time
    # range); surface it as a 400. Anything else is an upstream failure (502).
    code = 400 if 400 <= status < 500 else 502
    logger.warning("Google API error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=code, content={"detail": f"Google Calendar 오류: {exc.reason}"})

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Also accept any localhost/127.0.0.1 port so local dev frontends work
    # regardless of the (auto-assigned) port they run on.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(books.router)
app.include_router(calendar.router)
app.include_router(habits.router)
app.include_router(integrations.router)
app.include_router(push.router)
app.include_router(snippets.router)
app.include_router(tasks.router)
app.include_router(team.router)
app.include_router(token_usage.router)
app.include_router(users.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
