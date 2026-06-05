// @ts-nocheck
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";

async function runConcurrencyTest() {
  console.log("=== STARTING CONCURRENCY TEST ===");

  // 1. Get a product and a warehouse to use for testing
  const product = await prisma.product.findFirst();
  const warehouse = await prisma.warehouse.findFirst();

  if (!product || !warehouse) {
    console.error("Error: Seed the database before running the concurrency test (npm run seed).");
    process.exit(1);
  }

  console.log(`Testing with product: ${product.name} (SKU: ${product.sku})`);
  console.log(`Testing with warehouse: ${warehouse.name}`);

  // 2. Set stock levels to exactly 1 total unit, 0 reserved units (1 available unit)
  await prisma.stockLevel.upsert({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
    update: {
      totalUnits: 1,
      reservedUnits: 0,
    },
    create: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalUnits: 1,
      reservedUnits: 0,
    },
  });

  // Ensure no active pending reservations exist for this combination
  await prisma.reservation.deleteMany({
    where: {
      productId: product.id,
      warehouseId: warehouse.id,
      status: "PENDING",
    },
  });

  console.log("Database stock reset. Stock level: 1 Total, 0 Reserved. (Available = 1)");

  // 3. Fire 10 parallel HTTP requests to the reservations endpoint
  console.log("Firing 10 concurrent reservation requests in parallel...");
  
  const requests = Array.from({ length: 10 }).map(async (_, index) => {
    // Generate a unique idempotency key for each shopper
    const idempotencyKey = `shopper-${index}-${Date.now()}`;
    
    try {
      const start = Date.now();
      const res = await fetch(`${BASE_URL}/api/reservations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 1,
        }),
      });
      const duration = Date.now() - start;
      const status = res.status;
      const body = await res.json();
      
      return { index, status, body, duration, success: res.ok };
    } catch (err: any) {
      return { index, status: 500, body: { error: err.message }, duration: 0, success: false };
    }
  });

  const results = await Promise.all(requests);

  // 4. Analyze results
  console.log("\n=== TEST RESULTS ===");
  let successCount = 0;
  let conflictCount = 0;
  let otherCount = 0;

  results.forEach((r) => {
    console.log(
      `Request #${r.index.toString().padStart(2, "0")}: Status ${r.status} | Time: ${r.duration}ms | Response: ${
        r.success ? "RESERVED" : r.body.error
      }`
    );
    if (r.status === 201) successCount++;
    else if (r.status === 409) conflictCount++;
    else otherCount++;
  });

  console.log("\n=== SUMMARY ===");
  console.log(`Successful reservations (201 Created): ${successCount}`);
  console.log(`Concurrent conflicts (409 Conflict): ${conflictCount}`);
  console.log(`Other failures/responses:              ${otherCount}`);

  // 5. Query final state in database
  const finalStock = await prisma.stockLevel.findUnique({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
  });

  console.log(`\nFinal Database State for Stock Level:`);
  console.log(`- Total Units: ${finalStock?.totalUnits}`);
  console.log(`- Reserved Units: ${finalStock?.reservedUnits}`);
  console.log(`- Available Units: ${(finalStock?.totalUnits ?? 0) - (finalStock?.reservedUnits ?? 0)}`);

  // Assert correctness
  if (successCount === 1 && conflictCount === 9) {
    console.log("\n SUCCESS: Concurrency handling is correct! Exactly 1 request succeeded and 9 got 409 Conflict.");
  } else {
    console.error("\n FAILURE: Concurrency handling failed. Check implementation.");
    process.exit(1);
  }
}

runConcurrencyTest()
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
