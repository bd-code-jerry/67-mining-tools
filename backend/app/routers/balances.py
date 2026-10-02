from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ..database import db_connection
from ..dependencies import get_current_user
from ..services.balance_service import (
    create_add_balance_entry,
    create_history_entry,
    delete_history_entry,
    get_history_entry,
    overview,
    update_history_entry,
)

router = APIRouter(prefix="/api/balances", tags=["balances"])


class ProviderValue(BaseModel):
    total: float | None = Field(default=None, ge=0)
    used: float | None = Field(default=None, ge=0)
    left: float | None = Field(default=None, ge=0)


class HistoryBody(BaseModel):
    entry_date: date | None = None
    values: dict[str, ProviderValue] = Field(default_factory=dict)


class CreateHistoryBody(HistoryBody):
    expected_latest_entry_id: int | None


class AddBalanceBody(BaseModel):
    entry_date: date | None = None
    additions: dict[str, float] = Field(default_factory=dict)


@router.get("/overview")
def get_overview(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=5, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    del user
    with db_connection() as conn:
        return overview(conn, page=page, page_size=page_size)


@router.get("/history/{entry_id}")
def get_entry(entry_id: int, user: dict = Depends(get_current_user)):
    del user
    with db_connection() as conn:
        return get_history_entry(conn, entry_id)


@router.post("/history")
def create_entry(body: CreateHistoryBody, user: dict = Depends(get_current_user)):
    payload: dict[str, Any] = body.model_dump(mode="json")
    with db_connection() as conn:
        entry = create_history_entry(conn, user["id"], payload)
    return {"entry": entry}


@router.post("/add-balance")
def add_balance(body: AddBalanceBody, user: dict = Depends(get_current_user)):
    payload: dict[str, Any] = body.model_dump(mode="json")
    with db_connection() as conn:
        entry = create_add_balance_entry(conn, user["id"], payload)
    return {"entry": entry}


@router.put("/history/{entry_id}")
def update_entry(
    entry_id: int,
    body: HistoryBody,
    user: dict = Depends(get_current_user),
):
    payload: dict[str, Any] = body.model_dump(mode="json")
    with db_connection() as conn:
        entry = update_history_entry(conn, entry_id, user["id"], payload)
    return {"entry": entry}


@router.delete("/history/{entry_id}")
def delete_entry(entry_id: int, user: dict = Depends(get_current_user)):
    del user
    with db_connection() as conn:
        delete_history_entry(conn, entry_id)
    return {"ok": True}
