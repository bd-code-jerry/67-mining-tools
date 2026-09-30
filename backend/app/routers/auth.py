from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..config import (
    COOKIE_SECURE,
    REGISTRATION_CODE,
    SESSION_COOKIE_NAME,
    SESSION_DAYS,
)
from ..database import db_connection
from ..dependencies import get_current_user
from ..security import (
    create_session_token,
    hash_password,
    hash_session_token,
    unix_now,
    utc_now_iso,
    validate_password,
    validate_username,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterBody(BaseModel):
    username: str
    password: str
    registration_code: str | None = None


class LoginBody(BaseModel):
    username: str
    password: str


def _create_session_response(user_id: int, username: str) -> JSONResponse:
    token = create_session_token()
    token_hash = hash_session_token(token)
    now = unix_now()
    expires_at = now + SESSION_DAYS * 24 * 60 * 60

    with db_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        conn.execute(
            """
            INSERT INTO sessions(token_hash, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token_hash, user_id, utc_now_iso(), expires_at),
        )

    response = JSONResponse({"user": {"id": user_id, "username": username}})
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return response


@router.post("/register")
def register(body: RegisterBody):
    try:
        username = validate_username(body.username)
        validate_password(body.password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if REGISTRATION_CODE and (body.registration_code or "") != REGISTRATION_CODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The team registration code is incorrect.",
        )

    with db_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="That username is already in use.")

        cursor = conn.execute(
            "INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(body.password), utc_now_iso()),
        )
        user_id = cursor.lastrowid

    return _create_session_response(user_id, username)


@router.post("/login")
def login(body: LoginBody):
    username = body.username.strip()
    with db_connection() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()

    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    return _create_session_response(row["id"], row["username"])


@router.post("/logout")
def logout(request: Request):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        with db_connection() as conn:
            conn.execute(
                "DELETE FROM sessions WHERE token_hash = ?", (hash_session_token(token),)
            )

    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return response


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {"user": user, "registration_code_required": bool(REGISTRATION_CODE)}


@router.get("/registration-config")
def registration_config():
    return {"registration_code_required": bool(REGISTRATION_CODE)}
