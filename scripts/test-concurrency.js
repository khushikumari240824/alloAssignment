import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";

async function runConcurrencyTest() {
  console.log("=== STARTING CONCURRENCY TEST ===");

  const product = await prisma.product.findFirst();
  const warehouse = await prisma.warehouse.findFirst();

  if (!product || !warehouse) {
    console.error("Error: Seed the database before running the concurrency test (npm run db:seed).");
    process.exit(1);
  }

  console.log(`Testing with product: ${product.name} (SKU: ${product.sku})`);
  console.log(`Testing with warehouse: ${warehouse.name}`);

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

  await prisma.reservation.deleteMany({
    where: {
      productId: product.id,
      warehouseId: warehouse.id,
      status: "PENDING",
    },
  });

  console.log("Database stock reset. Stock level: 1 Total, 0 Reserved. (Available = 1)");
  console.log("Firing 10 concurrent reservation requests in parallel...");

  const requests = Array.from({ length: 10 }).map(async (_, index) => {
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
    } catch (error) {
      return { index, status: 500, body: { error: error.message }, duration: 0, success: false };
    }
  });

  const results = await Promise.all(requests);

  console.log("\n=== TEST RESULTS ===");
  let successCount = 0;
  let conflictCount = 0;
  let otherCount = 0;

  results.forEach((result) => {
    console.log(
      `Request #${result.index.toString().padStart(2, "0")}: Status ${result.status} | Time: ${result.duration}ms | Response: ${
        result.success ? "RESERVED" : result.body.error
      }`
    );

    if (result.status === 201) successCount++;
    else if (result.status === 409) conflictCount++;
    else otherCount++;
  });

  console.log("\n=== SUMMARY ===");
  console.log(`Successful reservations (201 Created): ${successCount}`);
  console.log(`Concurrent conflicts (409 Conflict): ${conflictCount}`);
  console.log(`Other failures/responses:              ${otherCount}`);

  const finalStock = await prisma.stockLevel.findUnique({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
  });

  console.log("\nFinal Database State for Stock Level:");
  console.log(`- Total Units: ${finalStock?.totalUnits}`);
  console.log(`- Reserved Units: ${finalStock?.reservedUnits}`);
  console.log(`- Available Units: ${(finalStock?.totalUnits ?? 0) - (finalStock?.reservedUnits ?? 0)}`);

  if (successCount === 1 && conflictCount === 9) {
    console.log("\nSUCCESS: Concurrency handling is correct! Exactly 1 request succeeded and 9 got 409 Conflict.");
  } else {
    console.error("\nFAILURE: Concurrency handling failed. Check implementation.");
    process.exit(1);
  }
}

runConcurrencyTest()
  .catch((error) => {
    console.error("Test execution failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });