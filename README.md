# Allo Multi-Warehouse Inventory & Order Reservation Platform

A Next.js application built with TypeScript, Prisma, and PostgreSQL that addresses checkout inventory race conditions by implementing temporary stock reservations.

This system guarantees that when a customer proceeds to checkout, units are temporarily held (e.g., for 10 minutes) while they complete payment. If payment succeeds, stock is permanently decremented. If the timer runs out or the checkout is cancelled, the reserved units are returned to the available stock pool.

---

## ⚡ Concurrency & Race-Condition Safety

At the core of this system is **correctness under concurrent requests**. If multiple shoppers attempt to reserve the last unit of a SKU simultaneously, exactly one must succeed.

### Concurrency Strategy: Row-Level Database Locking
To achieve this without adding latency or overhead from external distributed lock managers (like Redis), we leverage **PostgreSQL Transactions with Row-Level Locking**:

1. **Transaction Isolation & Locks**: When a reservation request reaches `POST /api/reservations`, we initiate a Prisma database transaction.
2. **Acquiring the Lock**: Before performing any check or write, we execute a raw SQL query inside the transaction to lock the exact product-warehouse inventory row:
   ```sql
   SELECT * FROM "StockLevel" 
   WHERE "productId" = $1 AND "warehouseId" = $2 
   FOR UPDATE;
   ```
3. **Blocking Concurrent Requests**: The `FOR UPDATE` clause instructs Postgres to lock this row. Any concurrent transaction attempting to lock or edit this same row is forced to wait until this transaction either **commits** or **rolls back**.
4. **Validation & State Change**: Once the lock is acquired, we query the current values, calculate available stock (`totalUnits - reservedUnits`), increment the `reservedUnits` if stock is available, insert the `Reservation` record, and commit.
5. **Result**: Concurrent requests are serialized. The first caller grabs the lock, checks availability, finds 1 unit, reserves it, and commits. The next queued caller resumes, reads the newly updated row, detects `available = 0`, and immediately aborts with a `409 Conflict`.

---

## ⏱️ Reservation Expiry System

Abandoned checkouts are inevitable. If a customer closes their tab, the hold must release. We implement a **hybrid expiry mechanism** that balances real-time accuracy and performance:

1. **Lazy / Just-In-Time (JIT) Cleanups (On-Read/On-Write)**:
   Whenever a product list is requested (`GET /api/products`) or a reservation is attempted (`POST /api/reservations`), the backend runs a quick transaction sweep specifically targeting expired reservations. Expired reservations are updated to `RELEASED`, and their held stock is restored. This guarantees that stock availability is **always 100% correct when queried or written**, preventing false "Out of Stock" states.
2. **Active Cron Cleaner (`/api/cron/cleanup`)**:
   A scheduled Vercel Cron or background worker hits `/api/cron/cleanup` every minute to perform a global sweep of all expired pending reservations. This ensures stock is returned to the active pool even during periods of zero traffic.

---

## 🔑 Idempotency (Bonus)

We implement idempotency for the **reserve** (`POST /api/reservations`) and **confirm** (`POST /api/reservations/:id/confirm`) endpoints:
- **How it works**: The client can send a unique UUID string in the `Idempotency-Key` header.
- **Database Cache**: We store keys in the `IdempotencyRequest` table along with the HTTP status code and response payload string.
- **Deduplication**: On incoming requests, if a key is matched:
  - The API skips execution of the side-effect (e.g., doesn't hold or deduct stock again).
  - The API returns the identical cached JSON response with an `X-Cache-Lookup: HIT` header.
  - If it is a new key, we execute the operation, store the resulting response in the database, and return it.

---

## 🛠️ Local Development Setup

### 1. Prerequisites
- Node.js (v18 or higher)
- A hosted PostgreSQL Database (e.g., [Neon.tech](https://neon.tech), [Supabase](https://supabase.com))
  > [!IMPORTANT]
  > The take-home exercise requires a real data layer. Create a free PostgreSQL instance on Neon or Supabase to get a connection string.

### 2. Environment Configuration
Create a `.env` file in the root of the project:
```env
# Connection URL with pooling for application queries
DATABASE_URL="postgres://username:password@hostname:5432/db_name?sslmode=require"

# Direct URL for migrations and seeds
DIRECT_URL="postgres://username:password@hostname:5432/db_name?sslmode=require"
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup (Migrations & Seed)
Run migrations to set up tables and compile the Prisma client:
```bash
npx prisma migrate dev --name init
```

Seed the database with mock warehouses, products, and inventory stock distributions:
```bash
npm run db:seed
```

### 5. Start the Application
Run the Next.js dev server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Concurrency Verification Test

To verify that the reservation logic is safe under high concurrent loads:

1. Ensure the Next.js local server is running (`npm run dev`).
2. Run the concurrency test command in a separate terminal:
   ```bash
   npm run test:concurrency
   ```
3. **What this test does**:
   - Resets the stock of a product to exactly **1 unit** total in the database.
   - Clears out any active reservations for that product.
   - Fires **10 parallel HTTP POST requests** to `/api/reservations` in the exact same millisecond.
   - Asserts that **exactly 1 request** succeeds with `201 Created` while the other **9 requests** fail with `409 Conflict`.
   - Confirms that the final database state shows exactly **1 reserved unit and 0 available units**.

---

## 🔍 Architecture Trade-offs & Future Considerations

If given more time, these enhancements would prepare this system for a larger, high-volume production scale:
- **Redis Distributed Locking**: For extremely high-throughput systems, row-level locks on relational database rows can create lock queues that tie up database connection pools. Offloading lock management to an in-memory key-value store (like Redis/Redlock) keeps database transactions short and fast.
- **Outbox Pattern for Events**: Instead of directly updating stock levels in HTTP request threads, we could emit `ReservationCreated` events to a message broker (RabbitMQ/SQS), maintaining a read-optimized cache (Redis) for stock queries and processing stock mutations asynchronously.
- **Payment Webhook Integrations**: Integrate Stripe webhooks to listen for payment confirmations, triggering the confirmation endpoint safely in the background.
