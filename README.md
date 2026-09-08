# Shopboard API

The backend for Shopboard, a multi-tenant order and inventory operations dashboard. It exposes authenticated APIs for products, stock movements, orders, operational tasks, and dashboard analytics.

## What is implemented

- JWT authentication with password hashing and owner-scoped data access
- Product catalogue with search, pagination, low-stock filtering, soft archival, and configurable reorder levels
- Audited stock movements for opening balances, manual adjustments, orders, and cancellations
- Transactional order placement: prices/costs are snapshotted and stock is deducted with a concurrency guard
- Controlled order workflow: `PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED`, with cancellation allowed before shipment
- Live revenue, profit, fulfilment, inventory-value, product, and 14-day trend analytics
- Consistent validation/error responses, CORS allow-listing, security headers, rate limiting, graceful shutdown, and health checks
- Node test suite and production Docker image

## Requirements

- Node.js 22+
- MongoDB replica set or MongoDB Atlas. Order creation uses transactions so a standalone MongoDB process is not sufficient.

## Local setup

```bash
cp .env.example .env
npm ci
npm run dev
```

Set a new random `JWT_SECRET` of at least 24 characters. Never commit `.env`.

The API starts on `http://localhost:5000`; health is available at `GET /api/health`.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MONGO_URI` | Yes | — | MongoDB replica-set or Atlas connection string |
| `JWT_SECRET` | Yes | — | JWT signing key, minimum 24 characters |
| `JWT_EXPIRES_IN` | No | `8h` | Access-token lifetime |
| `PORT` | No | `5000` | HTTP port |
| `CORS_ORIGIN` | Production | allow all | Comma-separated frontend origins |

## API map

All routes except registration, login, and health require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/users/register` | Create an admin/store |
| `POST` | `/api/users/login` | Authenticate by email, username, or mobile |
| `GET/PATCH` | `/api/users/me` | Read/update the current profile |
| `GET/POST` | `/api/inventory` | Search/list or create products |
| `PATCH` | `/api/inventory/:id` | Update catalogue fields |
| `PATCH` | `/api/inventory/:id/stock` | Record a stock adjustment |
| `GET` | `/api/inventory/:id/movements` | Read stock audit history |
| `DELETE` | `/api/inventory/:id` | Soft-archive a product |
| `GET/POST` | `/api/orders` | Search/list or place orders |
| `GET` | `/api/orders/:id` | Read one order |
| `PATCH` | `/api/orders/:id/status` | Move to an allowed fulfilment state |
| `GET` | `/api/dashboard/overview` | Store KPIs, trends, alerts, and recent orders |
| `GET/POST` | `/api/tasks` | List or create tasks |
| `PATCH/DELETE` | `/api/tasks/:id` | Update or remove a task |

Successful collection responses use `{ data, pagination }`; item responses use `{ data }`. Errors use `{ message, code, details? }`.

## Quality commands

```bash
npm test
npm run check
npm audit --audit-level=high
docker build -t shopboard-api .
```

The checked-in legacy aliases (`get-orders`, `add-order`, and task equivalents) remain temporarily available for older clients; new code should use the REST paths above.
