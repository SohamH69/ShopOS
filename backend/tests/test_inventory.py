"""Products and inventory: create, duplicates, derived fields, adjustments, transactions, lists.

Derived from SPEC section 2 ("Products / inventory") and the product rows of section 3.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest

from api_helpers import Api, custom_item, error, line, parse_dt, rejected

PRODUCT_KEYS = {
    "id", "name", "category", "unit", "sku", "stock_quantity", "min_stock_level", "reserved_quantity",
    "purchase_price", "selling_price", "low_stock", "stock_value", "margin_percent", "is_archived",
    "created_at", "updated_at",
}


def test_new_product_records_its_opening_stock(api: Api) -> None:
    created = api.post(
        "/api/products",
        {
            "name": "Tata Salt 1 kg",
            "category": "Staples",
            "unit": "pack",
            "sku": "TS-1KG",
            "stock_quantity": 12,
            "min_stock_level": 4,
            "purchase_price": 22,
            "selling_price": 28,
        },
        status=201,
    )
    assert set(created) == PRODUCT_KEYS
    assert (created["name"], created["category"], created["unit"], created["sku"]) == ("Tata Salt 1 kg", "Staples", "pack", "TS-1KG")
    assert (created["stock_quantity"], created["min_stock_level"], created["reserved_quantity"]) == (12, 4, 0)
    assert (created["purchase_price"], created["selling_price"]) == (22, 28)
    assert created["stock_value"] == 264
    assert created["margin_percent"] == pytest.approx(21.43, abs=0.05)  # precision is not specified
    assert (created["low_stock"], created["is_archived"]) == (False, False)
    parse_dt(created["created_at"])
    parse_dt(created["updated_at"])

    (opening,) = api.transactions(created["id"])
    assert (opening["type"], opening["quantity_change"], opening["stock_after"]) == ("opening", 12, 12)
    assert (opening["product_id"], opening["product_name"]) == (created["id"], "Tata Salt 1 kg")
    assert (opening["order_id"], opening["purchase_id"], opening["reason"]) == (None, None, None)


def test_product_defaults_and_derived_fields(api: Api) -> None:
    plain = api.post("/api/products", {"name": "Loose Chana", "category": "Pulses", "selling_price": 50}, status=201)
    assert (plain["unit"], plain["sku"], plain["stock_quantity"], plain["purchase_price"]) == ("pcs", None, 0, 0)
    assert plain["margin_percent"] == 100

    free = api.create_product(selling_price=0, purchase_price=5)
    assert free["margin_percent"] is None

    loose = api.create_product(unit="kg", stock_quantity=2.5, purchase_price=41.30, selling_price=50)
    assert loose["stock_value"] == 103.25
    assert loose["margin_percent"] == pytest.approx(17.4, abs=0.05)


def test_product_input_is_validated(api: Api) -> None:
    rejected(api.raw("POST", "/api/products", json={"name": "No price", "category": "X"}), 422)
    rejected(api.raw("POST", "/api/products", json={"name": "Odd unit", "category": "X", "selling_price": 1, "unit": "bag"}), 422)
    rejected(api.raw("POST", "/api/products", json={"name": " ", "category": "X", "selling_price": 1}), 400, 422)
    rejected(api.raw("POST", "/api/products", json={"name": "Negative", "category": "X", "selling_price": -1}), 400, 422)
    assert api.get("/api/products") == []


def test_duplicate_names_are_409_until_the_old_one_is_archived(api: Api) -> None:
    original = api.create_product(name="Parle-G Biscuits")
    for name in ("Parle-G Biscuits", "parle-g biscuits", "PARLE-G BISCUITS"):
        error(api.raw("POST", "/api/products", json={"name": name, "category": "Snacks", "selling_price": 10}), 409)

    other = api.create_product(name="Marie Gold")
    error(api.raw("PATCH", f"/api/products/{other['id']}", json={"name": "parle-g biscuits"}), 409)
    assert api.patch(f"/api/products/{original['id']}", {"name": "Parle-G Biscuits", "selling_price": 12})["selling_price"] == 12

    assert api.delete(f"/api/products/{original['id']}") == {"ok": True}
    replacement = api.create_product(name="Parle-G Biscuits")
    assert replacement["id"] != original["id"]


def test_patch_updates_fields_but_never_the_stock(api: Api) -> None:
    product = api.create_product(stock_quantity=8, purchase_price=40, selling_price=50)
    updated = api.patch(f"/api/products/{product['id']}", {"selling_price": 80, "category": "Spices", "min_stock_level": 10, "sku": "SP-1"})
    assert (updated["selling_price"], updated["category"], updated["sku"]) == (80, "Spices", "SP-1")
    assert updated["margin_percent"] == 50
    assert updated["low_stock"] is True  # 8 <= 10

    response = api.raw("PATCH", f"/api/products/{product['id']}", json={"stock_quantity": 500})
    assert response.status_code in (200, 400, 422)
    assert api.product(product["id"])["stock_quantity"] == 8
    assert len(api.transactions(product["id"])) == 1


@pytest.mark.parametrize(
    "stock, minimum, low",
    [(5, 5, True), (4.999, 5, True), (6, 5, False), (0, 0, True), (-1, 0, True), (1, 0, False)],
)
def test_low_stock_means_at_or_below_the_minimum(module_api: Api, stock: float, minimum: float, low: bool) -> None:
    product = module_api.create_product(min_stock_level=minimum)
    if stock:
        module_api.post(f"/api/products/{product['id']}/adjust", {"mode": "set", "quantity": max(stock, 0), "reason": "correction"})
    if stock < 0:
        customer = module_api.create_customer()
        module_api.create_order([line(product, -stock)], customer_id=customer["id"], status="collected")
    assert module_api.product(product["id"])["stock_quantity"] == stock
    assert module_api.product(product["id"])["low_stock"] is low


def test_stock_adjustments_add_remove_and_set(api: Api) -> None:
    product = api.create_product(name="Moong Dal", unit="kg", stock_quantity=10)
    path = f"/api/products/{product['id']}/adjust"

    added = api.post(path, {"mode": "add", "quantity": 5, "reason": "restock", "note": "Morning delivery"})
    assert added["stock_quantity"] == 15
    removed = api.post(path, {"mode": "remove", "quantity": 2.5, "reason": "damage", "note": "Torn bag"})
    assert removed["stock_quantity"] == 12.5
    counted = api.post(path, {"mode": "set", "quantity": 20, "reason": "correction"})
    assert counted["stock_quantity"] == 20
    emptied = api.post(path, {"mode": "set", "quantity": 0, "reason": "other"})
    assert emptied["stock_quantity"] == 0 and emptied["low_stock"] is True

    history = api.transactions(product["id"])
    assert [(t["type"], t["quantity_change"], t["stock_after"], t["reason"]) for t in history] == [
        ("adjustment", -20, 0, "other"),
        ("adjustment", 7.5, 20, "correction"),
        ("adjustment", -2.5, 12.5, "damage"),
        ("adjustment", 5, 15, "restock"),
        ("opening", 10, 10, None),
    ]
    assert history[3]["note"] == "Morning delivery" and history[2]["note"] == "Torn bag"
    assert all(t["created_by_name"] for t in history[:4])
    created_times = [parse_dt(t["created_at"]) for t in history]
    assert created_times == sorted(created_times, reverse=True)


def test_adjustments_are_validated(api: Api) -> None:
    product = api.create_product(stock_quantity=3)
    path = f"/api/products/{product['id']}/adjust"
    for body in (
        {"mode": "add", "quantity": 0, "reason": "restock"},
        {"mode": "remove", "quantity": -1, "reason": "damage"},
        {"mode": "set", "quantity": -1, "reason": "correction"},
    ):
        rejected(api.raw("POST", path, json=body), 400, 422)
    assert api.raw("POST", path, json={"mode": "multiply", "quantity": 2, "reason": "other"}).status_code == 422
    assert api.raw("POST", path, json={"mode": "add", "quantity": 2, "reason": "gift"}).status_code == 422
    assert api.product(product["id"])["stock_quantity"] == 3
    assert len(api.transactions(product["id"])) == 1


def test_quantities_are_rounded_to_three_decimals_after_every_change(api: Api) -> None:
    product = api.create_product(unit="kg")
    path = f"/api/products/{product['id']}/adjust"
    for _ in range(3):
        api.post(path, {"mode": "add", "quantity": 0.1, "reason": "restock"})
    assert api.product(product["id"])["stock_quantity"] == 0.3
    api.post(path, {"mode": "remove", "quantity": 0.2, "reason": "damage"})
    assert api.product(product["id"])["stock_quantity"] == 0.1
    assert [t["stock_after"] for t in api.transactions(product["id"])][:4] == [0.1, 0.3, 0.2, 0.1]


def test_transactions_are_newest_first_and_capped_at_100(api: Api) -> None:
    product = api.create_product(stock_quantity=0)
    for _ in range(104):
        api.post(f"/api/products/{product['id']}/adjust", {"mode": "add", "quantity": 1, "reason": "restock"})
    history = api.transactions(product["id"])
    assert len(history) == 100
    assert history[0]["stock_after"] == 104 and history[-1]["stock_after"] == 5


def test_reserved_quantity_follows_open_orders(api: Api) -> None:
    product = api.create_product(stock_quantity=20)
    customer = api.create_customer()
    first = api.create_order([line(product, 2)], customer_id=customer["id"])
    api.create_order([line(product, 3), custom_item(5)], customer_id=customer["id"], status="ready")
    assert api.product(product["id"])["reserved_quantity"] == 5
    api.set_status(first["id"], "collected")
    assert api.product(product["id"])["reserved_quantity"] == 3
    api.set_status(first["id"], "ready")
    assert api.product(product["id"])["reserved_quantity"] == 5


def test_archived_products_leave_lists_and_low_stock(api: Api) -> None:
    keep = api.create_product(name="Basmati Rice", category="Staples", stock_quantity=1, min_stock_level=5)
    gone = api.create_product(name="Old Soap", category="Personal Care", stock_quantity=0, min_stock_level=5)
    assert api.delete(f"/api/products/{gone['id']}") == {"ok": True}

    assert [p["id"] for p in api.get("/api/products")] == [keep["id"]]
    assert [p["id"] for p in api.get("/api/products", params={"low_stock": "true"})] == [keep["id"]]
    with_archived = api.get("/api/products", params={"include_archived": "true"})
    assert {p["id"]: p["is_archived"] for p in with_archived} == {keep["id"]: False, gone["id"]: True}
    assert api.product(gone["id"])["is_archived"] is True
    assert api.dashboard()["metrics"]["low_stock"] == 1


def test_product_list_sorting_search_and_categories(api: Api) -> None:
    api.create_product(name="Zandu Balm", category="Personal Care", sku="ZB-10", stock_quantity=10)
    api.create_product(name="amul Butter", category="Dairy", stock_quantity=10)
    api.create_product(name="Maggi Noodles", category="Snacks", stock_quantity=2, min_stock_level=5)
    api.create_product(name="Kurkure", category="Snacks", stock_quantity=50, min_stock_level=5)

    def names(**params: str) -> list[str]:
        return [p["name"] for p in api.get("/api/products", params=params)]

    assert names() == ["amul Butter", "Kurkure", "Maggi Noodles", "Zandu Balm"]
    assert names(search="maggi") == ["Maggi Noodles"]
    assert names(search="zb-1") == ["Zandu Balm"]
    assert names(search="dairy") == ["amul Butter"]
    assert names(category="Snacks") == ["Kurkure", "Maggi Noodles"]
    assert names(low_stock="true") == ["Maggi Noodles"]
    assert names(low_stock="false") == ["amul Butter", "Kurkure", "Zandu Balm"]
    assert api.get("/api/products/categories") == ["Dairy", "Personal Care", "Snacks"]


def test_concurrent_stock_changes_are_never_lost(api: Api) -> None:
    product = api.create_product(stock_quantity=0)
    customer = api.create_customer()
    orders = [api.create_order([line(product, 1)], customer_id=customer["id"]) for _ in range(5)]

    def restock(_: int) -> int:
        return api.raw("POST", f"/api/products/{product['id']}/adjust", json={"mode": "add", "quantity": 2, "reason": "restock"}).status_code

    def sell(order_id: int) -> int:
        return api.raw("POST", f"/api/orders/{order_id}/status", json={"status": "collected"}).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        restocks = [pool.submit(restock, i) for i in range(10)]
        sales = [pool.submit(sell, order["id"]) for order in orders]
        assert {future.result() for future in restocks + sales} == {200}

    assert api.product(product["id"])["stock_quantity"] == 15  # 10 x 2 in, 5 x 1 out
    history = api.transactions(product["id"])
    assert len(history) == 15
    # A lost update would break the chain: each stock_after must follow from the one before.
    running = 0.0
    for transaction in reversed(history):
        running = round(running + transaction["quantity_change"], 3)
        assert transaction["stock_after"] == running, history
    assert running == 15

