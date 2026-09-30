from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query

from ..database import db_connection
from ..dependencies import get_current_user
from ..services.usage_service import usage_summary_for_range

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("/summary")
def get_usage_summary(
    period: Literal["all", "day", "week", "month", "custom"] = Query(default="all"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    del user
    with db_connection() as conn:
        return usage_summary_for_range(
            conn,
            period=period,
            start_date=start_date,
            end_date=end_date,
        )
