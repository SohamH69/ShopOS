"""Suppliers, purchases and supplier payments.

Derived from SPEC section 2 ("Suppliers", "Products / inventory") and the supplier rows of section 3.
"""

from __future__ import annotations

from api_helpers import Api, error, parse_dt, rejected

SUPPLIER_KEYS = {
    "id", "name", "phone", "contact_person", "address", "notes", "supplies", "outstanding",
    "total_purchased", "total_paid", "last_purchase_at", "created_at",
}


def test_new_supplier_owes_its_opening_balance(api: Api) -> None:
    created = api.post(
        "/api/suppliers",
        {
            "name": "Shree Ganesh Traders",
            "phone": "9822012345",
            "contact_person": "Mahesh",
            "address": "Market Yard, Pune",
            "notes": "Delivers on Tuesdays",
            "supplies": "Rice, dal, flour",
            "opening_balance": 500,
        },
        status=201,
    )
    assert set(created) == SUPPLIER_KEYS
    assert (created["name"], created["contact_person"], created["supplies"]) == ("Shree Ganesh Traders", "Mahesh", "Rice, dal, flour")
    assert (created["outstanding"], created["total_purchased"], created["total_paid"]) == (500, 0, 0)
    assert created["last_purchase_at"] is None
    parse_dt(created["created_at"])

    plain = api.create_supplier()
    assert (plain["outstanding"], plain["contact_person"], plain["address"]) == (0, None, "")
    rejected(api.raw("POST", "/api/suppliers", json={"name": "No phone"}), 422)
    rejected(api.raw("POST", "/api/suppliers", json={"name": "Bad phone", "phone": "12345"}), 400, 422)
    rejected(api.raw("POST", "/api/suppliers", json={"name": " ", "phone": "9822000001"}), 400, 422)
    rejected(api.raw("POST", "/api/suppliers", json={"name": "Negative", "phone": "9822000000", "opening_balance": -5}), 400, 422)


def test_purchase_raises_stock_and_dues_and_updates_cost_price(api: Api) -> None:
    supplier = api.create_supplier(name="Agarwal Wholesale", opening_balance=500)
    rice = api.create_product(name="Kolam Rice", unit="kg", stock_quantity=5, purchase_price=40, selling_price=55)
    oil = api.create_product(name="Groundnut Oil", unit="l", stock_quantity=0, purchase_price=150, selling_price=190)

    purchase = api.post(
        f"/api/suppliers/{supplier['id']}/purchases",
        {"items": [{"product_id": rice["id"], "quantity": 10, "unit_cost": 42.5}, {"product_id": oil["id"], "quantity": 4.5, "unit_cost": 160}], "note": "Invoice 778"},
        status=201,
    )

    assert (purchase["supplier_id"], purchase["supplier_name"], purchase["note"]) == (supplier["id"], "Agarwal Wholesale", "Invoice 778")
    assert purchase["total"] == 1145
    assert [(i["product_id"], i["name"], i["quantity"], i["unit_cost"], i["line_total"]) for i in purchase["items"]] == [
        (rice["id"], "Kolam Rice", 10, 42.5, 425),
        (oil["id"], "Groundnut Oil", 4.5, 160, 720),
    ]
    assert purchase["created_by_name"]
    parse_dt(purchase["purchased_at"])

    rice_now, oil_now = api.product(rice["id"]), api.product(oil["id"])
    assert (rice_now["stock_quantity"], rice_now["purchase_price"]) == (15, 42.5)
    assert (oil_now["stock_quantity"], oil_now["purchase_price"]) == (4.5, 160)
    latest = api.transactions(rice["id"])[0]
    assert (latest["type"], latest["quantity_change"], latest["stock_after"], latest["purchase_id"]) == ("purchase", 10, 15, purchase["id"])

    detail = api.supplier(supplier["id"])
    assert (detail["outstanding"], detail["total_purchased"], detail["total_paid"]) == (1645, 1145, 0)
    assert parse_dt(detail["last_purchase_at"]) == parse_dt(purchase["purchased_at"])
    assert [p["id"] for p in detail["purchases"]] == [purchase["id"]]


def test_purchase_can_keep_the_old_cost_price(api: Api) -> None:
    supplier = api.create_supplier()
    sugar = api.create_product(unit="kg", purchase_price=38, selling_price=45)
    api.post(
        f"/api/suppliers/{supplier['id']}/purchases",
        {"items": [{"product_id": sugar["id"], "quantity": 0.333, "unit_cost": 10}], "update_cost_price": False},
        status=201,
    )
    product = api.product(sugar["id"])
    assert (product["stock_quantity"], product["purchase_price"]) == (0.333, 38)
    assert api.supplier(supplier["id"])["outstanding"] == 3.33


def test_purchase_paid_now_records_a_supplier_payment(api: Api) -> None:
    supplier = api.create_supplier(opening_balance=100)
    dal = api.create_product()
    purchase = api.post(
        f"/api/suppliers/{supplier['id']}/purchases",
        {"items": [{"product_id": dal["id"], "quantity": 10, "unit_cost": 50}], "paid_amount": 200, "method": "upi"},
        status=201,
    )
    assert purchase["total"] == 500
    detail = api.supplier(supplier["id"])
    assert (detail["outstanding"], detail["total_purchased"], detail["total_paid"]) == (400, 500, 200)
    assert [(p["amount"], p["method"]) for p in detail["payments"]] == [(200, "upi")]


def test_purchase_input_is_validated(api: Api) -> None:
    supplier = api.create_supplier()
    product = api.create_product(stock_quantity=1)
    path = f"/api/suppliers/{supplier['id']}/purchases"
    item = {"product_id": product["id"], "quantity": 2, "unit_cost": 10}

    error(api.raw("POST", path, json={"items": [item], "paid_amount": 20.01, "method": "cash"}), 400)
    rejected(api.raw("POST", path, json={"items": [item], "paid_amount": 5}), 400, 422)
    rejected(api.raw("POST", path, json={"items": []}), 400, 422)
    rejected(api.raw("POST", path, json={"items": [{**item, "quantity": 0}]}), 400, 422)
    rejected(api.raw("POST", path, json={"items": [{**item, "unit_cost": -1}]}), 400, 422)
    rejected(api.raw("POST", path, json={"items": [{**item, "product_id": 999_999}]}), 400, 404)

    api.delete(f"/api/products/{product['id']}")
    rejected(api.raw("POST", path, json={"items": [item]}), 400, 404, 409)

    assert api.product(product["id"])["stock_quantity"] == 1
    assert api.supplier(supplier["id"])["outstanding"] == 0
    assert api.get("/api/purchases") == []


def test_supplier_payment_cannot_exceed_what_is_owed(api: Api) -> None:
    supplier = api.create_supplier(opening_balance=300)
    path = f"/api/suppliers/{supplier['id']}/payments"

    payment = api.post(path, {"amount": 100, "method": "cash", "note": "Part payment"}, status=201)
    assert set(payment) == {"id", "supplier_id", "amount", "method", "note", "paid_at"}
    assert (payment["supplier_id"], payment["amount"], payment["method"], payment["note"]) == (supplier["id"], 100, "cash", "Part payment")
    assert api.supplier(supplier["id"])["outstanding"] == 200

    error(api.raw("POST", path, json={"amount": 200.01, "method": "upi"}), 400)
    for amount in (0, -10):
        rejected(api.raw("POST", path, json={"amount": amount, "method": "upi"}), 400, 422)
    assert api.raw("POST", path, json={"amount": 10, "method": "credit"}).status_code == 422

    api.post(path, {"amount": 200, "method": "bank_transfer"}, status=201)
    settled = api.supplier(supplier["id"])
    assert (settled["outstanding"], settled["total_paid"]) == (0, 300)
    assert [p["amount"] for p in settled["payments"]] == [200, 100]  # newest first
    error(api.raw("POST", path, json={"amount": 1, "method": "cash"}), 400)


def test_supplier_edits_cannot_rewrite_the_opening_balance(api: Api) -> None:
    supplier = api.create_supplier(opening_balance=250)
    updated = api.patch(f"/api/suppliers/{supplier['id']}", {"name": "Renamed Traders", "phone": "9822099999", "supplies": "Oil"})
    assert (updated["name"], updated["supplies"]) == ("Renamed Traders", "Oil")
    response = api.raw("PATCH", f"/api/suppliers/{supplier['id']}", json={"opening_balance": 0})
    assert response.status_code in (200, 400, 422)
    assert api.supplier(supplier["id"])["outstanding"] == 250


def test_supplier_lists_and_detail_ordering(api: Api) -> None:
    owed = api.create_supplier(name="Owed Supplier", opening_balance=100)
    clear = api.create_supplier(name="Clear Supplier")
    product = api.create_product()
    first = api.post(f"/api/suppliers/{clear['id']}/purchases", {"items": [{"product_id": product["id"], "quantity": 1, "unit_cost": 10}], "paid_amount": 10, "method": "cash"}, status=201)
    second = api.post(f"/api/suppliers/{owed['id']}/purchases", {"items": [{"product_id": product["id"], "quantity": 2, "unit_cost": 10}]}, status=201)
    third = api.post(f"/api/suppliers/{owed['id']}/purchases", {"items": [{"product_id": product["id"], "quantity": 3, "unit_cost": 10}]}, status=201)

    assert {s["id"] for s in api.get("/api/suppliers")} == {owed["id"], clear["id"]}
    assert [s["id"] for s in api.get("/api/suppliers", params={"filter": "due"})] == [owed["id"]]
    assert [p["id"] for p in api.get("/api/purchases")] == [third["id"], second["id"], first["id"]]
    assert [p["id"] for p in api.supplier(owed["id"])["purchases"]] == [third["id"], second["id"]]
    assert api.supplier(owed["id"])["outstanding"] == 150
    assert api.product(product["id"])["stock_quantity"] == 6


def test_purchase_history_lists_the_latest_100(api: Api) -> None:
    supplier = api.create_supplier()
    product = api.create_product()
    ids = [
        api.post(f"/api/suppliers/{supplier['id']}/purchases", {"items": [{"product_id": product["id"], "quantity": 1, "unit_cost": 1}]}, status=201)["id"]
        for _ in range(101)
    ]
    listed = [p["id"] for p in api.get("/api/purchases")]
    assert listed == list(reversed(ids))[:100]
    assert api.product(product["id"])["stock_quantity"] == 101
