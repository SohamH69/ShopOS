"""Expenses: CRUD, validation, filters (IST days) and the summary by category.

Derived from SPEC section 2 ("Expenses", "Time") and the expense rows of section 3.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from api_helpers import Api, at_ist, error, now_ist, parse_dt, rejected, today_ist
from conftest import ShopAccount

EXPENSE_KEYS = {"id", "category", "amount", "note", "spent_at", "created_by_name"}


def test_expense_create_edit_and_delete(api: Api, owner: ShopAccount) -> None:
    before = now_ist()
    created = api.post("/api/expenses", {"category": "electricity", "amount": 1450.5, "note": "MSEB bill"}, status=201)
    assert set(created) == EXPENSE_KEYS
    assert (created["category"], created["amount"], created["note"]) == ("electricity", 1450.5, "MSEB bill")
    assert created["created_by_name"] == owner.user["name"]
    assert before - timedelta(seconds=5) <= parse_dt(created["spent_at"]) <= now_ist() + timedelta(seconds=5)

    listed = api.get("/api/expenses")
    assert (listed["total"], [e["id"] for e in listed["items"]]) == (1, [created["id"]])

    spent = at_ist(today_ist() - timedelta(days=2), 18, 30)
    updated = api.patch(f"/api/expenses/{created['id']}", {"category": "repairs", "amount": 1500, "note": "Fan repair", "spent_at": spent.isoformat()})
    assert (updated["category"], updated["amount"], updated["note"]) == ("repairs", 1500, "Fan repair")
    assert parse_dt(updated["spent_at"]) == spent
    partial = api.patch(f"/api/expenses/{created['id']}", {"note": "Ceiling fan repair"})
    assert (partial["category"], partial["amount"], partial["note"]) == ("repairs", 1500, "Ceiling fan repair")

    assert api.delete(f"/api/expenses/{created['id']}") == {"ok": True}
    assert api.get("/api/expenses")["total"] == 0
    assert error(api.raw("PATCH", f"/api/expenses/{created['id']}", json={"amount": 1}), 404) == "Expense not found."
    assert error(api.raw("DELETE", f"/api/expenses/{created['id']}"), 404) == "Expense not found."


def test_expense_input_is_validated(api: Api) -> None:
    for body in (
        {"category": "rent", "amount": 0},
        {"category": "rent", "amount": -100},
    ):
        rejected(api.raw("POST", "/api/expenses", json=body), 400, 422)
    assert api.raw("POST", "/api/expenses", json={"category": "food", "amount": 10}).status_code == 422
    assert api.raw("POST", "/api/expenses", json={"amount": 10}).status_code == 422
    assert api.raw("POST", "/api/expenses", json={"category": "rent"}).status_code == 422
    expense = api.create_expense(category="rent", amount=100)
    rejected(api.raw("PATCH", f"/api/expenses/{expense['id']}", json={"amount": 0}), 400, 422)
    assert api.raw("PATCH", f"/api/expenses/{expense['id']}", json={"category": "party"}).status_code == 422
    assert api.get("/api/expenses")["items"][0]["amount"] == 100


def test_expense_filters_use_ist_days_and_are_newest_first(api: Api) -> None:
    today = today_ist()
    yesterday = today - timedelta(days=1)
    rent = api.create_expense(category="rent", amount=15000, spent_at=at_ist(today - timedelta(days=40), 10).isoformat())
    late_night = api.create_expense(category="electricity", amount=800, spent_at=at_ist(yesterday, 23, 59, 30).isoformat())
    after_midnight = api.create_expense(category="transportation", amount=300, spent_at=at_ist(today, 0, 0, 30).isoformat())
    morning = api.create_expense(category="electricity", amount=1200, spent_at=at_ist(today, 0, 5).isoformat())

    def ids(**params: str) -> list[int]:
        return [e["id"] for e in api.get("/api/expenses", params=params)["items"]]

    assert ids() == [morning["id"], after_midnight["id"], late_night["id"], rent["id"]]
    assert ids(category="electricity") == [morning["id"], late_night["id"]]
    assert ids(date_from=today.isoformat(), date_to=today.isoformat()) == [morning["id"], after_midnight["id"]]
    assert ids(date_from=yesterday.isoformat(), date_to=yesterday.isoformat()) == [late_night["id"]]
    assert ids(date_to=(today - timedelta(days=2)).isoformat()) == [rent["id"]]
    page = api.get("/api/expenses", params={"limit": 2, "offset": 1})
    assert (page["total"], page["limit"], page["offset"]) == (4, 2, 1)
    assert [e["id"] for e in page["items"]] == [after_midnight["id"], late_night["id"]]
    assert api.raw("GET", "/api/expenses", params={"category": "food"}).status_code == 422


def test_spent_at_without_an_offset_is_read_as_ist(api: Api) -> None:
    # A <input type="datetime-local"> value has no offset; the shop works in IST.
    local = datetime.combine(today_ist(), datetime.min.time()).replace(hour=9, minute=15)
    expense = api.create_expense(spent_at=local.isoformat())
    assert parse_dt(expense["spent_at"]) == at_ist(today_ist(), 9, 15)


def test_expense_summary_totals_by_category_within_the_range(api: Api) -> None:
    today = today_ist()
    yesterday = today - timedelta(days=1)
    api.create_expense(category="electricity", amount=1200, spent_at=at_ist(today, 9).isoformat())
    api.create_expense(category="electricity", amount=800, spent_at=at_ist(yesterday, 23, 59, 30).isoformat())
    api.create_expense(category="transportation", amount=300, spent_at=at_ist(today, 0, 0, 30).isoformat())
    api.create_expense(category="miscellaneous", amount=50.25, spent_at=at_ist(today, 8).isoformat())
    api.create_expense(category="rent", amount=15000, spent_at=at_ist(today - timedelta(days=3), 10).isoformat())

    summary = api.get("/api/expenses/summary", params={"date_from": yesterday.isoformat(), "date_to": today.isoformat()})
    assert set(summary) == {"total", "by_category"}
    assert summary["total"] == 2350.25
    assert summary["by_category"] == [
        {"category": "electricity", "amount": 2000, "count": 2},
        {"category": "transportation", "amount": 300, "count": 1},
        {"category": "miscellaneous", "amount": 50.25, "count": 1},
    ]
    today_only = api.get("/api/expenses/summary", params={"date_from": today.isoformat(), "date_to": today.isoformat()})
    assert today_only["total"] == 1550.25
    wide = api.get("/api/expenses/summary", params={"date_from": (today - timedelta(days=30)).isoformat(), "date_to": today.isoformat()})
    assert wide["total"] == 17350.25
    assert wide["by_category"][0] == {"category": "rent", "amount": 15000, "count": 1}
    assert api.raw("GET", "/api/expenses/summary", params={"date_from": "yesterday"}).status_code in (400, 422)


def test_calendar_edge_dates_in_expense_filters_cover_everything(api: Api) -> None:
    expense = api.create_expense(category="rent", amount=500)
    for params in ({"date_from": "0001-01-01"}, {"date_to": "9999-12-31"}, {"date_from": "0001-01-01", "date_to": "9999-12-31"}):
        assert [e["id"] for e in api.get("/api/expenses", params=params)["items"]] == [expense["id"]], params
        assert api.get("/api/expenses/summary", params=params)["total"] == 500, params


def test_spent_at_at_the_edge_of_the_calendar_never_breaks_the_shop(api: Api) -> None:
    for spent_at in ("0001-01-01T00:00:00", "0001-01-01T03:00:00+05:30", "9999-12-31T23:59:59+00:00"):
        response = api.raw("POST", "/api/expenses", json={"category": "rent", "amount": 5, "spent_at": spent_at})
        if response.status_code != 201:
            rejected(response, 400, 422)
        assert api.raw("GET", "/api/expenses").status_code == 200
        assert api.raw("GET", "/api/expenses/summary").status_code == 200
        assert api.raw("GET", "/api/export/expenses.csv").status_code == 200
        assert api.raw("GET", "/api/reports", params={"range": "12m"}).status_code == 200
    expense = api.create_expense(category="rent", amount=5)
    response = api.raw("PATCH", f"/api/expenses/{expense['id']}", json={"spent_at": "0001-01-01T00:00:00"})
    if response.status_code != 200:
        rejected(response, 400, 422)
    assert api.raw("GET", "/api/export/expenses.csv").status_code == 200
