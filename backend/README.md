# ShopOS backend

FastAPI + SQLAlchemy 2.0 + SQLite API for ShopOS, the operating system for local shops.
It serves the JSON API under `/api` (shapes defined in `frontend/src/lib/types.ts`) and,
once the frontend is built, the web app itself.

## Run

From the project root:

```powershell
python -m pip install -r backend/requirements.txt
npm run backend          # python -m uvicorn main:app --reload --port 8000 --app-dir backend
```

Or from `backend/`:

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

- API docs: http://127.0.0.1:8000/api/docs
- Health check: http://127.0.0.1:8000/api/health
- During development run the Vite dev server too (`npm run dev`, port 5173); it proxies `/api` here.
- After `npm run build`, this server also serves the app from `frontend/dist` at
  http://127.0.0.1:8000/ (client routes such as `/app/orders` fall back to `index.html`).

The first start creates `backend/data/shopos.db` and `backend/data/secret.key` and seeds the
demo shop. `backend/data/` is git-ignored.

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `SHOPOS_DATABASE_URL` | `sqlite:///<backend>/data/shopos.db` | SQLAlchemy database URL |
| `SHOPOS_SECRET_KEY` | generated once into `backend/data/secret.key` | Key that signs sign-in tokens (HS256) |
| `SHOPOS_TOKEN_DAYS` | `30` | How long a sign-in token stays valid |
| `SHOPOS_CORS_ORIGINS` | none | Extra allowed origins, comma separated. `localhost`/`127.0.0.1` on ports 5173 and 4173 are always allowed |
| `SHOPOS_SEED_DEMO` | `1` | Set to `0` to skip seeding the demo shop when the database is empty |
| `SHOPOS_FRONTEND_DIST` | `<project>/frontend/dist` | Folder with the built frontend to serve |

## Demo shop

"Raj Local Mart" in Pune: 36 products, 30 customers, about 220 orders over the last 60 days
(today included, with pickups waiting, deliveries pending, khata dues, payment promises and
low stock). The password for every demo account is `demo1234`.

| Role | Name | Sign in with |
|---|---|---|
| Owner | Raj Deshmukh | `demo@shopos.app` or `9876500001` |
| Manager | Sunita Joshi | `sunita@shopos.app` |
| Employee | Arjun Pawar | `arjun@shopos.app` |
| Accountant | Meera Iyer | `meera@shopos.app` |

`POST /api/auth/demo` signs in as the owner (and creates the demo shop if it is missing); the
website's "Try the demo shop" button uses it.

### Reset the demo data

Stop the server, then from `backend/`:

```powershell
python -m app.seed --reset    # drop every table, recreate and seed again
python -m app.seed            # only seed when no demo shop exists yet
```

The data is generated relative to the current date with a fixed random seed, and is built
through the same service functions as the API, so stock movements, payment statuses and
balances always add up.

## Tests

From `backend/`:

```powershell
python -m pytest -q
```

Tests run against a throwaway SQLite database (configured in `tests/conftest.py` before the
app is imported) with the demo shop seeded. `tests/conftest.py` documents the shared fixtures:
`client`, `demo_headers`, `signup_shop()` for a fresh empty shop, `create_staff()` for a
signed-in staff member with a given role, and `api` / `module_api` (an `api_helpers.Api` signed
in to a brand-new shop per test or per module). `tests/test_smoke.py` calls every endpoint and
checks that responses have exactly the keys defined in `types.ts`.

The other modules are a black-box suite written from the spec's business rules and HTTP API:
`test_auth`, `test_permissions` (roles, staff, cross-shop isolation), `test_orders`,
`test_payments`, `test_customers`, `test_inventory`, `test_suppliers`, `test_expenses`,
`test_dashboard_reports`, `test_io_search` and `test_spa`. They talk to the API over HTTP only;
the one exception is `api_helpers.backdate()` / `move_promise_date()`, which rewrite stored
timestamps so records can sit on either side of IST midnight or in the past.

## How it is organised

```
main.py            shim for `uvicorn main:app --app-dir backend`
app/main.py        app factory: CORS, error handlers, routers, startup (create tables + seed), SPA
app/config.py      environment settings
app/db.py          engine (SQLite: WAL, foreign keys, BEGIN IMMEDIATE for writes), sessions
app/models.py      SQLAlchemy models (money in paise, timestamps in UTC)
app/schemas.py     Pydantic request/response models mirroring types.ts
app/serializers.py ORM rows -> response models
app/services/      business rules (orders, payments, customers, inventory, suppliers, ...)
app/routers/       thin HTTP layer, one module per area
app/seed.py        demo data
app/spa.py         serves frontend/dist
```

Conventions:

- Money is stored as integer paise and returned as rupees (at most 2 decimals), rounding
  half-up at every boundary. Quantities are rounded to 3 decimals.
- Datetimes are stored in UTC and returned as ISO 8601 with an offset. "Today", date filters
  and report buckets use IST (UTC+05:30). Naive datetimes sent by clients are read as IST.
- Every query is scoped to the signed-in user's shop; another shop's ids return 404.
- Errors are `{"detail": "Plain sentence."}` with 400/401/403/404/409/429; request
  validation errors are FastAPI's standard 422.
- Services flush but never commit; routers commit once per request.
