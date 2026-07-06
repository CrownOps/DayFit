from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, calendar, habits, push, snippets, tasks, token_usage, users
from app.core.config import settings
from app.services.notification_scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="DayFit API", lifespan=lifespan)

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
app.include_router(calendar.router)
app.include_router(habits.router)
app.include_router(push.router)
app.include_router(snippets.router)
app.include_router(tasks.router)
app.include_router(token_usage.router)
app.include_router(users.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
