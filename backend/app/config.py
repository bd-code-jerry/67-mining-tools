import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = PROJECT_ROOT / "frontend"


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_file(PROJECT_ROOT / ".env")

APP_HOST = os.getenv("RSG_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("RSG_PORT", "8765"))
REGISTRATION_CODE = os.getenv("RSG_REGISTRATION_CODE", "").strip()
SESSION_DAYS = max(1, int(os.getenv("RSG_SESSION_DAYS", "14")))
COOKIE_SECURE = os.getenv("RSG_COOKIE_SECURE", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
SESSION_COOKIE_NAME = "rsg_session"

_db_value = os.getenv("RSG_DATABASE_PATH", "data/rsg_dashboard.db")
_db_path = Path(_db_value)
if not _db_path.is_absolute():
    _db_path = PROJECT_ROOT / _db_path
DATABASE_PATH = _db_path.resolve()
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
