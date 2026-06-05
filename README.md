# Allo Multi-Warehouse Inventory & Order Reservation Platform

This project is a full-stack inventory reservation system built using **Next.js, TypeScript, Prisma, and PostgreSQL**. It is designed to solve one of the most common challenges in e-commerce platforms—**inventory race conditions during checkout**.

When a customer starts the checkout process, the system temporarily reserves the requested stock for a limited time (for example, 10 minutes). This prevents other customers from purchasing the same item while payment is being completed. If the payment succeeds, the stock is permanently deducted. If the customer abandons the checkout or the reservation expires, the reserved stock is automatically released and made available again.

---

## Handling Concurrent Reservations

One of the key goals of this project is ensuring inventory accuracy when multiple customers try to purchase the same product at the same time.

To achieve this, the application uses **PostgreSQL row-level locking inside database transactions**. Whenever a reservation request is received, the corresponding inventory record is locked using a `FOR UPDATE` query. This ensures that only one transaction can modify the stock at a time.

For example, if only one unit of a product remains and multiple users attempt to reserve it simultaneously:

* The first request acquires the lock and reserves the item successfully.
* Other requests wait until the transaction completes.
* Once the lock is released, the waiting requests recheck the inventory and detect that no stock is available.
* Those requests are then rejected with a conflict response.

This approach guarantees consistent inventory counts and prevents overselling.

---

## Reservation Expiry Management

Customers do not always complete their purchases. To handle abandoned checkouts, the platform automatically releases expired reservations using two complementary approaches.

### 1. Just-in-Time Cleanup

Whenever product information is requested or a new reservation is created, the system first checks for expired reservations. Any expired holds are marked as released, and the reserved inventory is returned to the available stock pool.

This ensures that inventory information remains accurate whenever users interact with the system.

### 2. Scheduled Background Cleanup

A cron job runs periodically and performs a global cleanup of expired reservations. This ensures that stock is restored even when there is little or no traffic on the platform.

Together, these mechanisms keep inventory availability accurate at all times.

---

## Idempotency Support

To prevent duplicate operations caused by retries, network issues, or accidental multiple submissions, the reservation and confirmation APIs support **idempotency**.

Clients can send a unique value through the `Idempotency-Key` header.

When a request is received:

* If the key already exists, the system returns the previously stored response without executing the operation again.
* If the key is new, the operation is processed normally and the response is stored for future reference.

This prevents duplicate reservations and repeated stock deductions while improving API reliability.

---

## Local Development Setup

### Prerequisites

* Node.js (v18 or higher)
* PostgreSQL database (Neon, Supabase, or any PostgreSQL provider)

### Environment Variables

Create a `.env` file in the project root and add your database connection details:

```env
DATABASE_URL="postgres://username:password@hostname:5432/db_name?sslmode=require"
DIRECT_URL="postgres://username:password@hostname:5432/db_name?sslmode=require"
```

### Install Dependencies

```bash
npm install
```

### Run Database Migrations

```bash
npx prisma migrate dev --name init
```

### Seed Sample Data

```bash
npm run db:seed
```

### Start the Application

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:3000
```

---

## Concurrency Testing

To verify that the reservation system correctly handles concurrent requests:

```bash
npm run test:concurrency
```

The test performs the following actions:

* Resets inventory for a selected product to a single available unit.
* Removes existing reservations.
* Sends 10 reservation requests simultaneously.
* Verifies that only one request succeeds.
* Confirms that all remaining requests fail due to insufficient stock.
* Validates the final inventory state in the database.

This test demonstrates that the application safely handles race conditions under high concurrency.

---

## Future Improvements

If this system were expanded for larger production workloads, several enhancements could be considered:

### Redis-Based Distributed Locking

For very high traffic environments, distributed locks could reduce contention on database connections and improve scalability.

### Event-Driven Architecture

Using an Outbox Pattern together with message queues such as RabbitMQ or Amazon SQS would allow stock updates and reservation processing to be handled asynchronously.

### Payment Gateway Integration

Integrating payment providers such as Stripe would allow reservation confirmations to be triggered automatically through secure payment webhooks.

---

Overall, this project demonstrates how inventory reservations, expiration handling, concurrency control, and idempotent APIs can work together to create a reliable and scalable checkout experience while preventing overselling and maintaining accurate stock levels.
