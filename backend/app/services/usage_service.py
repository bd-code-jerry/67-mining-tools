from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal

from fastapi import HTTPException, status

UsagePeriod = Literal["all", "day", "week", "month", "custom"]


def _latest_history_date(conn) -> date:
    """Use the latest saved balance date as the anchor for preset ranges.

    This keeps the 1 Day / 1 Week / 1 Month buttons useful even when the most
    recent saved balance was entered yesterday or backdated.
    """
    row = conn.execute("SELECT MAX(entry_date) AS latest_date FROM history_entries").fetchone()
    raw = row["latest_date"] if row else None
    if not raw:
        return date.today()
    return date.fromisoformat(raw)


def _history_bounds(conn) -> tuple[str | None, str | None]:
    row = conn.execute(
        "SELECT MIN(entry_date) AS first_date, MAX(entry_date) AS last_date FROM history_entries"
    ).fetchone()
    if not row:
        return None, None
    return row["first_date"], row["last_date"]


def _resolve_range(
    conn,
    *,
    period: UsagePeriod,
    start_date: date | None = None,
    end_date: date | None = None,
) -> tuple[str | None, str | None]:
    if period == "all":
        return _history_bounds(conn)

    if period == "custom":
        if start_date is None or end_date is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Custom range requires both start_date and end_date.",
            )
        if start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Start date cannot be after end date.",
            )
        return start_date.isoformat(), end_date.isoformat()

    anchor = end_date or _latest_history_date(conn)
    if period == "day":
        start = anchor
    elif period == "week":
        start = anchor - timedelta(days=6)
    elif period == "month":
        start = anchor - timedelta(days=29)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported usage period.",
        )

    return start.isoformat(), anchor.isoformat()


def usage_summary_for_range(
    conn,
    *,
    period: UsagePeriod = "all",
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict[str, Any]:
    """Return total used balance per provider for an inclusive date range."""

    resolved_start, resolved_end = _resolve_range(
        conn,
        period=period,
        start_date=start_date,
        end_date=end_date,
    )

    if period == "all":
        provider_rows = conn.execute(
            """
            SELECT
                p.provider_key,
                p.display_name,
                p.unit,
                p.sort_order,
                COALESCE(SUM(hv.used_balance), 0) AS total_used
            FROM providers p
            LEFT JOIN history_values hv ON hv.provider_id = p.id
            GROUP BY p.id
            ORDER BY p.sort_order
            """
        ).fetchall()

        count_row = conn.execute("SELECT COUNT(*) AS c FROM history_entries").fetchone()
    else:
        provider_rows = conn.execute(
            """
            SELECT
                p.provider_key,
                p.display_name,
                p.unit,
                p.sort_order,
                COALESCE(
                    SUM(
                        CASE
                            WHEN he.entry_date >= ? AND he.entry_date <= ?
                            THEN hv.used_balance
                            ELSE 0
                        END
                    ),
                    0
                ) AS total_used
            FROM providers p
            LEFT JOIN history_values hv ON hv.provider_id = p.id
            LEFT JOIN history_entries he ON he.id = hv.entry_id
            GROUP BY p.id
            ORDER BY p.sort_order
            """,
            (resolved_start, resolved_end),
        ).fetchall()

        count_row = conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM history_entries
            WHERE entry_date >= ? AND entry_date <= ?
            """,
            (resolved_start, resolved_end),
        ).fetchone()

    by_provider = [dict(row) for row in provider_rows]
    by_unit: dict[str, float] = {}
    for row in by_provider:
        unit = row["unit"]
        by_unit[unit] = by_unit.get(unit, 0.0) + float(row["total_used"] or 0.0)

    return {
        "period": period,
        "start_date": resolved_start,
        "end_date": resolved_end,
        "entry_count": int(count_row["c"] if count_row else 0),
        "by_unit": by_unit,
        "by_provider": by_provider,
    }
