from __future__ import annotations

from datetime import date
from math import ceil, isclose, isfinite
from typing import Any

from fastapi import HTTPException, status

from ..database import utc_now_iso

EPSILON = 1e-7


def _providers(conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, provider_key, display_name, unit, sort_order FROM providers ORDER BY sort_order"
    ).fetchall()
    return [dict(row) for row in rows]


def _entry_to_dict(conn, entry_row) -> dict[str, Any]:
    values = conn.execute(
        """
        SELECT
            p.provider_key,
            p.display_name,
            p.unit,
            p.sort_order,
            hv.total_balance,
            hv.used_balance,
            hv.left_balance
        FROM history_values hv
        JOIN providers p ON p.id = hv.provider_id
        WHERE hv.entry_id = ?
        ORDER BY p.sort_order
        """,
        (entry_row["id"],),
    ).fetchall()

    return {
        "id": entry_row["id"],
        "entry_date": entry_row["entry_date"],
        "created_at": entry_row["created_at"],
        "updated_at": entry_row["updated_at"],
        "values": [dict(row) for row in values],
    }


def get_history_entry(conn, entry_id: int) -> dict[str, Any]:
    row = conn.execute(
        "SELECT id, entry_date, created_at, updated_at FROM history_entries WHERE id = ?",
        (entry_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="History entry not found.")
    return _entry_to_dict(conn, row)


def history_count(conn) -> int:
    row = conn.execute("SELECT COUNT(*) AS c FROM history_entries").fetchone()
    return int(row["c"] if row else 0)


def list_history(conn, *, page: int = 1, page_size: int = 5) -> list[dict[str, Any]]:
    safe_page = max(1, int(page))
    safe_page_size = max(1, min(int(page_size), 100))
    offset = (safe_page - 1) * safe_page_size

    rows = conn.execute(
        """
        SELECT id, entry_date, created_at, updated_at
        FROM history_entries
        ORDER BY entry_date DESC, id DESC
        LIMIT ? OFFSET ?
        """,
        (safe_page_size, offset),
    ).fetchall()
    return [_entry_to_dict(conn, row) for row in rows]


def latest_entry(conn) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT id, entry_date, created_at, updated_at
        FROM history_entries
        ORDER BY entry_date DESC, id DESC
        LIMIT 1
        """
    ).fetchone()
    return _entry_to_dict(conn, row) if row else None


def usage_summary(conn) -> dict[str, Any]:
    by_unit_rows = conn.execute(
        """
        SELECT p.unit, COALESCE(SUM(hv.used_balance), 0) AS total_used
        FROM providers p
        LEFT JOIN history_values hv ON hv.provider_id = p.id
        GROUP BY p.unit
        """
    ).fetchall()

    by_provider_rows = conn.execute(
        """
        SELECT p.provider_key, p.display_name, p.unit,
               COALESCE(SUM(hv.used_balance), 0) AS total_used
        FROM providers p
        LEFT JOIN history_values hv ON hv.provider_id = p.id
        GROUP BY p.id
        ORDER BY p.sort_order
        """
    ).fetchall()

    return {
        "by_unit": {row["unit"]: row["total_used"] for row in by_unit_rows},
        "by_provider": [dict(row) for row in by_provider_rows],
    }


def overview(conn, *, page: int = 1, page_size: int = 5) -> dict[str, Any]:
    total_items = history_count(conn)
    safe_page_size = max(1, min(int(page_size), 100))
    total_pages = max(1, ceil(total_items / safe_page_size)) if total_items else 1
    safe_page = max(1, min(int(page), total_pages))

    return {
        "providers": _providers(conn),
        "latest": latest_entry(conn),
        "summary": usage_summary(conn),
        "history": list_history(conn, page=safe_page, page_size=safe_page_size),
        "pagination": {
            "page": safe_page,
            "page_size": safe_page_size,
            "total_items": total_items,
            "total_pages": total_pages,
        },
    }


def _as_number(value, field_name: str) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (OverflowError, TypeError, ValueError):
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} must be a number.",
        )
    if not isfinite(number):
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} must be a finite number.",
        )
    if number < -EPSILON:
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} cannot be negative.",
        )
    return max(0.0, number)


def _calculate_value(
    *,
    provider_name: str,
    total,
    used,
    left,
    default_total: float,
) -> tuple[float, float, float]:
    total_n = _as_number(total, f"{provider_name} total")
    used_n = _as_number(used, f"{provider_name} used")
    left_n = _as_number(left, f"{provider_name} left")

    if total_n is None:
        if used_n is not None and left_n is not None:
            total_n = used_n + left_n
        else:
            total_n = float(default_total)

    if not isfinite(total_n):
        raise HTTPException(
            status_code=422,
            detail=f"{provider_name}: Total must be a finite number.",
        )

    if used_n is None and left_n is None:
        # Saving a new snapshot without typing values keeps the last balance and
        # records zero new usage for this entry.
        used_n = 0.0
        left_n = total_n
    elif used_n is None:
        used_n = total_n - left_n
    elif left_n is None:
        left_n = total_n - used_n
    elif not isclose(used_n + left_n, total_n, abs_tol=1e-8):
        raise HTTPException(
            status_code=422,
            detail=(
                f"{provider_name}: Used + Left must equal Total. "
                "Edit either Used or Left so the values match."
            ),
        )

    if used_n < -EPSILON or left_n < -EPSILON:
        raise HTTPException(
            status_code=422,
            detail=f"{provider_name}: Used or Left cannot be greater than Total.",
        )

    if not all(isfinite(value) for value in (total_n, used_n, left_n)):
        raise HTTPException(
            status_code=422,
            detail=f"{provider_name}: Balances must be finite numbers.",
        )

    # Keep substantially more precision than the UI needs. The frontend also
    # allows values beyond two decimal places.
    return (
        round(total_n, 12),
        round(max(0.0, used_n), 12),
        round(max(0.0, left_n), 12),
    )


def create_history_entry(conn, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    conn.execute("BEGIN IMMEDIATE")
    providers = _providers(conn)
    latest = latest_entry(conn)
    expected_latest_entry_id = payload.get("expected_latest_entry_id")
    latest_entry_id = latest["id"] if latest else None
    if expected_latest_entry_id != latest_entry_id:
        raise HTTPException(
            status_code=409,
            detail="Balances changed since this form was opened. Refresh and try again.",
        )
    latest_map = {
        value["provider_key"]: value for value in (latest["values"] if latest else [])
    }
    incoming = payload.get("values") or {}
    entry_date = str(payload.get("entry_date") or date.today().isoformat())
    now = utc_now_iso()

    cursor = conn.execute(
        """
        INSERT INTO history_entries(entry_date, created_at, updated_at, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?)
        """,
        (entry_date, now, now, user_id, user_id),
    )
    entry_id = cursor.lastrowid

    for provider in providers:
        key = provider["provider_key"]
        supplied = incoming.get(key) or {}
        previous_left = float(latest_map.get(key, {}).get("left_balance", 0.0))
        default_total = previous_left
        total, used, left = _calculate_value(
            provider_name=provider["display_name"],
            total=supplied.get("total"),
            used=supplied.get("used"),
            left=supplied.get("left"),
            default_total=default_total,
        )
        conn.execute(
            """
            INSERT INTO history_values(entry_id, provider_id, total_balance, used_balance, left_balance)
            VALUES (?, ?, ?, ?, ?)
            """,
            (entry_id, provider["id"], total, used, left),
        )

    row = conn.execute(
        "SELECT id, entry_date, created_at, updated_at FROM history_entries WHERE id = ?",
        (entry_id,),
    ).fetchone()
    return _entry_to_dict(conn, row)


def create_add_balance_entry(
    conn, user_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    """Add funds/credits to the latest remaining balances and save a new snapshot.

    The server performs the addition against the latest saved entry so another
    teammate cannot accidentally overwrite a newer balance with a stale page.
    Added balance is not counted as usage: used=0 and left=new total.
    """

    # Lock before reading the latest snapshot. SQLite serializes writers, so a
    # second top-up waits here and then adds to the first one's committed value.
    conn.execute("BEGIN IMMEDIATE")
    providers = _providers(conn)
    latest = latest_entry(conn)
    latest_map = {
        value["provider_key"]: value for value in (latest["values"] if latest else [])
    }
    additions = payload.get("additions") or {}
    entry_date = str(payload.get("entry_date") or date.today().isoformat())

    normalized_additions: dict[str, float] = {}
    any_positive = False
    for provider in providers:
        key = provider["provider_key"]
        amount = _as_number(additions.get(key), f"{provider['display_name']} added balance")
        amount = 0.0 if amount is None else amount
        normalized_additions[key] = amount
        if amount > EPSILON:
            any_positive = True

    if not any_positive:
        raise HTTPException(
            status_code=422,
            detail="Enter an amount greater than 0 for at least one API key.",
        )

    now = utc_now_iso()
    cursor = conn.execute(
        """
        INSERT INTO history_entries(entry_date, created_at, updated_at, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?)
        """,
        (entry_date, now, now, user_id, user_id),
    )
    entry_id = cursor.lastrowid

    for provider in providers:
        key = provider["provider_key"]
        previous_left = float(latest_map.get(key, {}).get("left_balance", 0.0))
        new_total = round(previous_left + normalized_additions[key], 12)
        if not isfinite(new_total):
            raise HTTPException(
                status_code=422,
                detail=f"{provider['display_name']}: Added balance exceeds the supported range.",
            )
        conn.execute(
            """
            INSERT INTO history_values(entry_id, provider_id, total_balance, used_balance, left_balance)
            VALUES (?, ?, ?, ?, ?)
            """,
            (entry_id, provider["id"], new_total, 0.0, new_total),
        )

    row = conn.execute(
        "SELECT id, entry_date, created_at, updated_at FROM history_entries WHERE id = ?",
        (entry_id,),
    ).fetchone()
    return _entry_to_dict(conn, row)


def update_history_entry(
    conn, entry_id: int, user_id: int, payload: dict[str, Any]
) -> dict[str, Any]:
    existing = get_history_entry(conn, entry_id)
    providers = _providers(conn)
    existing_map = {value["provider_key"]: value for value in existing["values"]}
    incoming = payload.get("values") or {}
    entry_date = str(payload.get("entry_date") or existing["entry_date"])
    now = utc_now_iso()

    conn.execute(
        """
        UPDATE history_entries
        SET entry_date = ?, updated_at = ?, updated_by = ?
        WHERE id = ?
        """,
        (entry_date, now, user_id, entry_id),
    )

    for provider in providers:
        key = provider["provider_key"]
        old = existing_map[key]
        supplied = incoming.get(key)
        if supplied is None:
            continue
        total, used, left = _calculate_value(
            provider_name=provider["display_name"],
            total=supplied.get("total"),
            used=supplied.get("used"),
            left=supplied.get("left"),
            default_total=float(old["total_balance"]),
        )
        conn.execute(
            """
            UPDATE history_values
            SET total_balance = ?, used_balance = ?, left_balance = ?
            WHERE entry_id = ? AND provider_id = ?
            """,
            (total, used, left, entry_id, provider["id"]),
        )

    return get_history_entry(conn, entry_id)


def delete_history_entry(conn, entry_id: int) -> None:
    # Use the normal lookup so the API returns a clear 404 for a missing row.
    get_history_entry(conn, entry_id)
    conn.execute("DELETE FROM history_entries WHERE id = ?", (entry_id,))
