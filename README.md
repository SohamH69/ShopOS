# ShopOS

Shop management for local shops: orders, customer khata, payments, pickups and deliveries, stock, suppliers, expenses, reports and staff, all in one place. Built from `ShopOS Business Plan.docx`.

- **Backend:** Python FastAPI + SQLAlchemy + SQLite (`backend/`)
- **Frontend:** React + TypeScript + Vite (`frontend/`), installable as an app (PWA)
- **Website:** public landing page with a **Get the app** section (install the app, or use it in the browser)

## Quick start

```powershell
npm run setup        # installs frontend packages and backend requirements (first time only)
npm run dev          # API on http://127.0.0.1:8000 + app on http://127.0.0.1:5173
```

Open http://127.0.0.1:5173 and click **Try the demo**, or sign in with:

| Role | Login | Password |
|---|---|---|
| Owner | demo@shopos.app (or phone 9876500001) | demo1234 |
| Manager | sunita@shopos.app | demo1234 |
| Employee | arjun@shopos.app | demo1234 |
| Accountant | meera@shopos.app | demo1234 |

The demo shop (Raj Local Mart) is created automatically on first run with two months of orders, payments, stock and suppliers. Reset it any time with `npm run seed:reset`.

## Run as one server (production style)

```powershell
npm start            # builds the frontend, then serves app + API on http://0.0.0.0:8000
```

Other devices on your network can then open `http://<this-computer's-IP>:8000`.

## Get the app (install)

ShopOS installs straight from the browser, with no app store:

- **Android:** Chrome menu → *Install app*
- **iPhone / iPad:** Safari → Share → *Add to Home Screen*
- **Windows / Mac:** install icon in the Chrome or Edge address bar (or the **Install ShopOS** button on the site)

The website's `/download` page and the **Get the app** section show the right steps for each device, plus a QR code to open it on a phone. Browsers only offer installing on `localhost` or over **HTTPS**, so for phones on your network, host it behind HTTPS (any reverse proxy or tunnel works).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Backend (auto-reload) and frontend together |
| `npm run dev:api` / `npm run dev:web` | Just one of them |
| `npm run build` | Type-check and build the frontend into `frontend/dist` |
| `npm start` / `npm run serve` | Build + serve everything on port 8000 / serve without rebuilding |
| `npm test` | Backend tests (pytest) and frontend tests (vitest) |
| `npm run seed:reset` | Recreate the demo shop |

## What's inside

- **Today** dashboard: sales, orders, payments received, money owed to you, a *Needs attention* list, pending pickups, the week's sales, low stock
- **Orders:** walk-in, phone and WhatsApp orders; order status and payment status tracked separately; part payments; repeat orders; printable receipts with a UPI QR for dues
- **Pickups & deliveries:** Ready / Preparing / New board: *Collect ₹X* → *Mark collected* in two clicks
- **Customers & khata:** credit ledger with running balance, payments that clear the oldest orders first, payment promises, WhatsApp reminders
- **Products:** stock drops automatically when an order is completed; stock adjustments with history; low-stock alerts
- **Suppliers, expenses, payments, reports** (daily/weekly/monthly sales, top customers, fast and slow movers, profit)
- **Staff** with owner / manager / employee / accountant roles and editable permissions
- **Shop setup:** every shop gets a public shop ID (like `SO-7K2Q9M`) and adds a photo of the shop front and its map location before the app opens
- **Customer side:** each customer gets a private khata link the shop shares on WhatsApp: their balance, khata and orders, a UPI Pay button, and the shop's products to send an order (it arrives as an Online order)
- **Admin for developers** at `/admin`: every shop with its photo and location, platform numbers, suspend/reactivate a shop, change its plan. Create an admin with `python -m app.admin_cli create --email you@example.com --name "Your Name"` (from `backend/`)
- **Settings:** shop profile, UPI ID, password, install the app, CSV import and export

More backend detail (API, env vars, tests) is in `backend/README.md`.
