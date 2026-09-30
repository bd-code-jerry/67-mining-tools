from fastapi import HTTPException, Request, status

from .config import SESSION_COOKIE_NAME
from .database import db_connection
from .security import hash_session_token, unix_now


def get_current_user(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")

    token_hash = hash_session_token(token)
    now = unix_now()

    with db_connection() as conn:
        row = conn.execute(
            """
            SELECT users.id, users.username, users.created_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (token_hash, now),
        ).fetchone()

        if not row:
            conn.execute(
                "DELETE FROM sessions WHERE token_hash = ? OR expires_at <= ?",
                (token_hash, now),
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session has expired. Please sign in again.",
            )

    return dict(row)
