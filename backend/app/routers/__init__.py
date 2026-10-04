"""HTTP routers. Each module is a thin layer over ``app.services``."""

from fastapi import APIRouter

from app.routers import (
    auth,
    customers,
    dashboard,
    expenses,
    health,
    io,
    orders,
    payments,
    products,
    reports,
    shop,
    suppliers,
    users,
)

ALL_ROUTERS: tuple[APIRouter, ...] = (
    health.router,
    auth.router,
    shop.router,
    users.router,
    dashboard.router,
    customers.router,
    products.router,
    orders.router,
    payments.router,
    suppliers.router,
    expenses.router,
    reports.router,
    io.router,
)
