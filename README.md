# Shopboard API

Production-oriented API for the Shopboard multi-tenant order and inventory dashboard. It runs as a regular Express service locally and as a Netlify Function in production.

## Included capabilities

- Short-lived JWT access tokens and rotating, hashed refresh sessions in an HttpOnly cookie
- Password reset with a six-digit, single-use, expiring OTP delivered through Hostinger SMTP
- Owner-scoped products, stock movements, orders, dashboard analytics, and operational tasks
- Transactional order placement and CSV imports with stock consistency checks
- Product and multi-line order CSV templates, atomic imports, and formula-safe exports
- Realistic sample workspace creation for empty accounts
- Password-protected operational-data reset and permanent account deletion
- Report preferences modelled as `PAUSED`, `DAILY`, or `WEEKLY`; automated report delivery is intentionally paused and no scheduler is enabled
- Validation, structured errors, CORS allow-listing, rate limiting, security headers, tests, health checks, and graceful shutdown

## Requirements

- Node.js 22+
- MongoDB Atlas or another replica set. Imports, order placement, reset, and deletion use transactions.

## Local development

```bash
cp .env.example .env
npm ci
npm run dev
```

The API starts on `http://localhost:5000`; health is at `GET /api/health`.

Use a new random `JWT_SECRET` of at least 24 characters and never commit `.env`. Verify the configured SMTP account without sending an email with:

```bash
npm run email:verify
```

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MONGO_URI` | Yes | — | MongoDB replica-set or Atlas connection string |
| `JWT_SECRET` | Yes | — | Access-token signing and OTP HMAC key; minimum 24 characters |
| `ACCESS_TOKEN_EXPIRES_IN` | No | `15m` | Short-lived access-token lifetime |
| `PORT` / `BACKEND_PORT` | No | `5000` | Local HTTP port |
| `CORS_ORIGIN` | Direct browser access only | local allow / production deny | Comma-separated allowed frontend origins; the same-origin Netlify proxy does not need it |
| `COOKIE_SECURE` | No | production-aware | Set `true` on Netlify and `false` for local HTTP |
| `COOKIE_SAME_SITE` | No | `lax` | Refresh-cookie SameSite policy; `lax` is correct for the included frontend proxy |
| `TRUST_PROXY` | No | production-aware | Set `1` behind a reverse proxy |
| `SMTP_HOST` | Password reset | — | Hostinger SMTP host, normally `smtp.hostinger.com` |
| `SMTP_PORT` | Password reset | `465` | SMTP port |
| `SMTP_USER` | Password reset | — | Hostinger mailbox address |
| `SMTP_PASS` | Password reset | — | Hostinger mailbox password |
| `SMTP_FROM` | No | `SMTP_USER` | Display name and sender address |

## Netlify deployment

This repository includes [`netlify.toml`](./netlify.toml) and [`netlify/functions/api.js`](./netlify/functions/api.js). In the backend Netlify site:

1. Set this repository directory as the site base.
2. Configure `MONGO_URI`, a strong `JWT_SECRET`, `ACCESS_TOKEN_EXPIRES_IN=15m`, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax`, `TRUST_PROXY=1`, and the Hostinger `SMTP_*` variables.
3. Deploy. Requests to `/api/*` are routed to the Express Function.
4. Copy the deployed site origin, such as `https://shopboard-api.netlify.app`, into the frontend site's `BACKEND_SERVICE_URL`.

The frontend's same-origin proxy is the recommended browser path. It keeps the refresh cookie first-party on the frontend domain and forwards it to this service.

## API map

Public routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service and database state |
| `POST` | `/api/users/register` | Create a store administrator |
| `POST` | `/api/users/login` | Sign in by email, username, or mobile |
| `POST` | `/api/users/refresh` | Rotate refresh session and issue an access token |
| `POST` | `/api/users/logout` | Revoke the current refresh session |
| `POST` | `/api/users/password-reset/request` | Send a generic-response OTP request |
| `POST` | `/api/users/password-reset/confirm` | Consume OTP, reset password, and revoke all sessions |

Authenticated routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET/PATCH/DELETE` | `/api/users/me` | Profile management or permanent account deletion |
| `GET/POST` | `/api/inventory` | Search/list or create products |
| `PATCH` | `/api/inventory/:id` | Update catalogue fields |
| `PATCH` | `/api/inventory/:id/stock` | Record a stock adjustment |
| `GET` | `/api/inventory/:id/movements` | Read stock audit history |
| `DELETE` | `/api/inventory/:id` | Soft-archive a product |
| `GET/POST` | `/api/orders` | Search/list or place orders |
| `GET` | `/api/orders/:id` | Read one order |
| `PATCH` | `/api/orders/:id/status` | Move through an allowed fulfilment transition |
| `GET` | `/api/dashboard/overview` | KPIs, trends, alerts, and recent orders |
| `GET/POST` | `/api/tasks` | List or create operational tasks |
| `PATCH/DELETE` | `/api/tasks/:id` | Update or remove a task |
| `GET` | `/api/data/templates/products` | Download product import template |
| `GET` | `/api/data/templates/orders` | Download multi-line order import template |
| `POST` | `/api/data/import/products` | Atomically import product CSV (`file`, max 2 MB/500 rows) |
| `POST` | `/api/data/import/orders` | Atomically import order CSV (`file`, max 2 MB/500 rows) |
| `GET` | `/api/data/export/products` | Download product CSV backup |
| `GET` | `/api/data/export/orders` | Download order CSV backup |
| `POST` | `/api/data/sample` | Add sample data to an empty account |
| `DELETE` | `/api/data/reset` | Delete operational data after password and phrase confirmation |

Successful item responses use `{ data }`, collections use `{ data, pagination }`, and errors use `{ message, code, details? }`.

## Quality commands

```bash
npm test
npm run check
npm run audit
```

The legacy order/task aliases remain temporarily available for the raw frontend's older clients; new code uses the REST paths above.
