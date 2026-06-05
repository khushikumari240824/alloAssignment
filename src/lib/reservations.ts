import { prisma } from "./db";

/**
 * Releases all expired pending reservations across all products and warehouses.
 * Must be executed within a transaction to maintain ACID safety.
 */
export async function releaseExpiredReservations(tx: any) {
  const now = new Date();

  // Find all reservations that have expired and are still PENDING
  const expired = await tx.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: {
        lte: now,
      },
    },
  });

  if (expired.length === 0) {
    return 0;
  }

  for (const res of expired) {
    // Acquire a row-level lock on the specific stock level
    await tx.$executeRaw`
      SELECT * FROM "StockLevel" 
      WHERE "productId" = ${res.productId} AND "warehouseId" = ${res.warehouseId} 
      FOR UPDATE;
    `;

    // Decrement reserved units
    await tx.stockLevel.update({
      where: {
        productId_warehouseId: {
          productId: res.productId,
          warehouseId: res.warehouseId,
        },
      },
      data: {
        reservedUnits: {
          decrement: res.quantity,
        },
      },
    });

    // Update reservation status to RELEASED
    await tx.reservation.update({
      where: { id: res.id },
      data: { status: "RELEASED" },
    });
  }

  return expired.length;
}

/**
 * Releases expired pending reservations specifically for a single product and warehouse stock level.
 * Used for lazy cleanup during checks and reservations to ensure stock totals are exact.
 */
export async function releaseExpiredReservationsForStock(
  tx: any,
  productId: string,
  warehouseId: string
) {
  const now = new Date();

  const expired = await tx.reservation.findMany({
    where: {
      productId,
      warehouseId,
      status: "PENDING",
      expiresAt: {
        lte: now,
      },
    },
  });

  if (expired.length === 0) {
    return 0;
  }

  for (const res of expired) {
    // Lock the StockLevel row
    await tx.$executeRaw`
      SELECT * FROM "StockLevel" 
      WHERE "productId" = ${res.productId} AND "warehouseId" = ${res.warehouseId} 
      FOR UPDATE;
    `;

    // Decrement reserved units
    await tx.stockLevel.update({
      where: {
        productId_warehouseId: {
          productId: res.productId,
          warehouseId: res.warehouseId,
        },
      },
      data: {
        reservedUnits: {
          decrement: res.quantity,
        },
      },
    });

    // Update reservation status to RELEASED
    await tx.reservation.update({
      where: { id: res.id },
      data: { status: "RELEASED" },
    });
  }

  return expired.length;
}
