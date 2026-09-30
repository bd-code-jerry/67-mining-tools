from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import FRONTEND_DIR
from .database import db_connection, init_database
from .routers.auth import router as auth_router
from .routers.balances import router as balances_router
from .routers.usage import router as usage_router
from .services.seed_service import seed_defaults

app = FastAPI(title="RSG API Key Balances", version="1.2.0")


@app.on_event("startup")
def startup() -> None:
    init_database()
    with db_connection() as conn:
        seed_defaults(conn)


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(balances_router)
app.include_router(usage_router)
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")
