"""Global search, CSV import and CSV export.

Derived from SPEC section 3 (search, import, export rows) and the SearchResults /
ImportResult shapes in types.ts.
"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from api_helpers import Api, custom_item, customer_phone, digits, error, today_ist
from conftest import ShopAccount

EXPORT_KINDS = ("orders", "customers", "products", "payments", "expenses")


def csv_rows(response: httpx.Response) -> list[list[str]]:
    text = response.content.decode("utf-8-sig")
    return [row for row in csv.reader(io.StringIO(text)) if row]


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


def test_search_finds_customers_orders_and_products(api: Api) -> None:
    priya = api.create_customer(name="Priya Deshpande", phone="9890012345")
    other = api.create_customer(name="Rohit Sane")
    tea = api.create_product(name="Wagh Bakri Tea", category="Beverages", stock_quantity=10)
    order = api.create_order([custom_item(10)], customer_id=priya["id"])
    api.create_order([custom_item(10)], customer_id=other["id"])

    by_name = api.get("/api/search", params={"q": "deshpande"})
    assert set(by_name) == {"customers", "orders", "products"}
    assert [c["id"] for c in by_name["customers"]] == [priya["id"]]
    assert [o["id"] for o in by_name["orders"]] == [order["id"]]  # orders match their customer's name
    assert by_name["products"] == []

    assert [c["id"] for c in api.get("/api/search", params={"q": "0012345"})["customers"]] == [priya["id"]]
    assert order["id"] in [o["id"] for o in api.get("/api/search", params={"q": str(order["number"])})["orders"]]
    assert [p["id"] for p in api.get("/api/search", params={"q": "bakri"})["products"]] == [tea["id"]]
    assert api.get("/api/search", params={"q": "zzz-nothing"}) == {"customers": [], "orders": [], "products": []}


def test_search_needs_a_query_and_caps_each_group_at_five(api: Api) -> None:
    assert api.raw("GET", "/api/search", params={"q": ""}).status_code == 422
    assert api.raw("GET", "/api/search").status_code == 422
    for i in range(7):
        customer = api.create_customer(name=f"Kumar Family {i}")
        api.create_order([custom_item(5)], customer_id=customer["id"])
        api.create_product(name=f"Kumar Masala {i}")
    results = api.get("/api/search", params={"q": "kumar"})
    assert (len(results["customers"]), len(results["orders"]), len(results["products"])) == (5, 5, 5)


def test_search_hides_archived_customers(api: Api) -> None:
    gone = api.create_customer(name="Archived Arvind")
    api.delete(f"/api/customers/{gone['id']}")
    assert api.get("/api/search", params={"q": "Arvind"})["customers"] == []


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


def test_customer_import_creates_updates_and_reports_bad_rows(api: Api) -> None:
    existing_phone = customer_phone()
    existing = api.create_customer(name="Esha Old", phone=existing_phone, address="Old address")
    new_phone = customer_phone()
    csv_text = (
        "name,phone,address,notes\n"
        f"Ravi Kumar,{new_phone},Kothrud,Regular\n"
        f"Esha New,{existing_phone},Baner,Moved house\n"
        ",9833333333,Nowhere,missing name\n"
        "Neha Joshi,,Aundh,missing phone\n"
    )
    result = api.post("/api/import/customers", {"csv": csv_text})

    assert set(result) == {"created", "updated", "skipped", "errors"}
    assert (result["created"], result["updated"]) == (1, 1)
    assert [e["row"] for e in result["errors"]] == [3, 4]
    assert all(isinstance(e["message"], str) and e["message"] for e in result["errors"])
    assert result["skipped"] in (0, 2)

    customers = {digits(c["phone"])[-10:]: c for c in api.get("/api/customers")}
    assert set(customers) == {existing_phone, new_phone}
    assert (customers[new_phone]["name"], customers[new_phone]["address"], customers[new_phone]["notes"]) == ("Ravi Kumar", "Kothrud", "Regular")
    updated = customers[existing_phone]
    assert updated["id"] == existing["id"]
    assert (updated["name"], updated["address"]) == ("Esha New", "Baner")


def test_product_import_matches_existing_products_by_name(api: Api) -> None:
    existing = api.create_product(name="Poha 1 kg", category="Staples", selling_price=40, purchase_price=30)
    csv_text = (
        "name,category,unit,sku,stock_quantity,min_stock_level,purchase_price,selling_price\n"
        "poha 1 KG,Staples,pack,PO-1,0,5,33,45\n"
        "Sabudana 500 g,Staples,pack,SB-5,12,3,28,35\n"
        "Bad Unit Thing,Staples,bucket,,1,1,1,2\n"
        "No Price Thing,Staples,pcs,,1,1,1,\n"
    )
    result = api.post("/api/import/products", {"csv": csv_text})
    assert (result["created"], result["updated"]) == (1, 1)
    assert [e["row"] for e in result["errors"]] == [3, 4]

    products = {p["name"].lower(): p for p in api.get("/api/products")}
    assert set(products) == {"poha 1 kg", "sabudana 500 g"}
    poha = products["poha 1 kg"]
    assert poha["id"] == existing["id"]
    assert (poha["selling_price"], poha["purchase_price"], poha["min_stock_level"]) == (45, 33, 5)
    sabudana = products["sabudana 500 g"]
    assert (sabudana["unit"], sabudana["sku"], sabudana["stock_quantity"], sabudana["selling_price"]) == ("pack", "SB-5", 12, 35)
    (opening,) = api.transactions(sabudana["id"])
    assert (opening["type"], opening["stock_after"]) == ("opening", 12)


def test_import_rejects_unknown_kinds_and_needs_a_header(api: Api) -> None:
    assert api.raw("POST", "/api/import/suppliers", json={"csv": "name\nX\n"}).status_code in (404, 422)
    empty = api.raw("POST", "/api/import/customers", json={"csv": ""})
    if empty.status_code == 200:
        assert empty.json()["created"] == 0
    else:
        error(empty, 400)
    assert api.get("/api/customers") == []


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kind", EXPORT_KINDS)
def test_exports_are_dated_csv_attachments(api: Api, kind: str) -> None:
    customer = api.create_customer(name="Export Esha")
    product = api.create_product(name="Export Item", stock_quantity=5)
    api.create_order([{"product_id": product["id"], "quantity": 1}], customer_id=customer["id"], payment={"amount": 10, "method": "cash"})
    api.create_expense(category="rent", amount=500)

    response = api.raw("GET", f"/api/export/{kind}.csv")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    disposition = response.headers["content-disposition"]
    assert "attachment" in disposition
    match = re.search(r'filename="?([^";]+)"?', disposition)
    assert match and match.group(1) == f"shopos-{kind}-{today_ist().isoformat()}.csv"
    rows = csv_rows(response)
    assert len(rows) == 2, rows  # header + the one record of this kind
    assert all(cell.strip() for cell in rows[0])


def test_unknown_export_kind_is_rejected(api: Api) -> None:
    assert api.raw("GET", "/api/export/suppliers.csv").status_code in (404, 422)


def test_export_then_import_round_trips_into_another_shop(
    api: Api, client: TestClient, signup_shop: Callable[..., ShopAccount]
) -> None:
    customers = [
        api.create_customer(name="Anita Rane", address="Shivaji Nagar", notes="Comma, inside"),
        api.create_customer(name='Quote "Q" Shah', address="Camp"),
        api.create_customer(name="Plain Paresh"),
    ]
    products = [
        api.create_product(name="Kanda Poha", category="Staples", unit="kg", stock_quantity=12.5, min_stock_level=2, purchase_price=36.5, selling_price=44),
        api.create_product(name="Dettol Soap", category="Personal Care", sku="DT-75", stock_quantity=30, purchase_price=30, selling_price=38),
    ]
    neighbour = Api(client, signup_shop().headers)

    customer_csv = api.raw("GET", "/api/export/customers.csv").content.decode("utf-8-sig")
    result = neighbour.post("/api/import/customers", {"csv": customer_csv})
    assert (result["created"], result["updated"], result["errors"]) == (3, 0, [])
    imported = {c["name"]: c for c in neighbour.get("/api/customers")}
    for original in customers:
        copy = imported[original["name"]]
        assert digits(copy["phone"])[-10:] == digits(original["phone"])[-10:]
        assert (copy["address"], copy["notes"]) == (original["address"], original["notes"])

    product_csv = api.raw("GET", "/api/export/products.csv").content.decode("utf-8-sig")
    result = neighbour.post("/api/import/products", {"csv": product_csv})
    assert (result["created"], result["updated"], result["errors"]) == (2, 0, [])
    imported_products = {p["name"]: p for p in neighbour.get("/api/products")}
    for original in products:
        copy = imported_products[original["name"]]
        for field in ("category", "unit", "sku", "stock_quantity", "min_stock_level", "purchase_price", "selling_price"):
            assert copy[field] == original[field], field

    # Importing the same file again updates instead of duplicating.
    again = neighbour.post("/api/import/customers", {"csv": customer_csv})
    assert (again["created"], again["updated"]) == (0, 3)
    assert len(neighbour.get("/api/customers")) == 3


@pytest.mark.parametrize("query", ["²", "①", "#²", "٣", "%", "_", "100%"])
def test_search_handles_unusual_characters(api: Api, query: str) -> None:
    customer = api.create_customer(name="Plain Name")
    api.create_order([custom_item(10)], customer_id=customer["id"])
    api.create_product(name="Plain Product")
    # Superscripts and circled digits look like digits to str.isdigit() but aren't numbers;
    # % and _ are SQL wildcards. None of them may crash or match everything.
    assert api.get("/api/search", params={"q": query}) == {"customers": [], "orders": [], "products": []}
    assert api.get("/api/orders", params={"search": query})["items"] == []
    assert api.get("/api/customers", params={"search": query}) == []
    assert api.get("/api/products", params={"search": query}) == []


def test_search_accepts_order_numbers_as_shown_in_the_app(api: Api) -> None:
    customer = api.create_customer()
    order = api.create_order([custom_item(10)], customer_id=customer["id"])
    for query in (f"#{order['number']}", str(order["number"])):
        assert api.get("/api/search", params={"q": query})["orders"][0]["id"] == order["id"]
        assert [o["id"] for o in api.get("/api/orders", params={"search": query})["items"]] == [order["id"]]


def test_import_accepts_excel_style_files(api: Api) -> None:
    # Excel saves CSV with a byte-order mark and Windows line endings.
    phone_a, phone_b = customer_phone(), customer_phone()
    csv_text = f"﻿name,phone,address\r\nAnil Kale,{phone_a},Warje\r\n\r\nBina Rao,{phone_b},Sus\r\n"
    result = api.post("/api/import/customers", {"csv": csv_text})
    assert (result["created"], result["updated"], result["errors"]) == (2, 0, [])
    assert sorted(c["name"] for c in api.get("/api/customers")) == ["Anil Kale", "Bina Rao"]


def test_import_reports_rows_by_their_position_in_the_file(api: Api) -> None:
    csv_text = "name,phone\nGood One,9811100001\n,9811100002\nGood Two,9811100003\nNo Phone,\n"
    result = api.post("/api/import/customers", {"csv": csv_text})
    assert (result["created"], result["updated"]) == (2, 0)
    assert [e["row"] for e in result["errors"]] == [2, 4]


def test_import_stock_changes_leave_an_inventory_transaction(api: Api) -> None:
    product = api.create_product(name="Kolam Rice 25 kg", stock_quantity=10, selling_price=1200)
    csv_text = "name,category,selling_price,stock_quantity\nKolam Rice 25 kg,Staples,1250,25\n"
    result = api.post("/api/import/products", {"csv": csv_text})
    assert (result["created"], result["updated"]) == (0, 1)
    current = api.product(product["id"])
    assert (current["selling_price"], current["category"]) == (1250, "Staples")
    if current["stock_quantity"] != 10:
        latest = api.transactions(product["id"])[0]
        assert (latest["stock_after"], latest["quantity_change"]) == (current["stock_quantity"], current["stock_quantity"] - 10)
    assert api.transactions(product["id"])[0]["stock_after"] == current["stock_quantity"]


def test_exports_neutralise_spreadsheet_formulas(api: Api) -> None:
    api.create_customer(name='=HYPERLINK("http://evil.example","Click")', notes="+cmd|' /C calc'!A0")
    header, row = csv_rows(api.raw("GET", "/api/export/customers.csv"))
    columns = {name.lower(): index for index, name in enumerate(header)}
    name_cell, notes_cell = row[columns["name"]], row[columns["notes"]]
    assert "HYPERLINK" in name_cell and not name_cell.startswith(("=", "+", "-", "@")), name_cell
    assert "calc" in notes_cell and not notes_cell.startswith(("=", "+", "-", "@")), notes_cell
    # Phone numbers like "+91 98765 43210" are data, not formulas, and stay as they are.
    assert row[columns["phone"]].startswith("+91 ")
