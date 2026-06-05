import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { releaseExpiredReservationsForStock } from "@/lib/reservations";

export async function POST(req: NextRequest) {
  try {
    const idempotencyKey = req.headers.get("idempotency-key");

    // 1. Check Idempotency Key
    if (idempotencyKey) {
      const existingRequest = await prisma.idempotencyRequest.findUnique({
        where: { key: idempotencyKey },
      });
      if (existingRequest) {
        return new NextResponse(existingRequest.response, {
          status: existingRequest.statusCode,
          headers: {
            "Content-Type": "application/json",
            "X-Cache-Lookup": "HIT",
          },
        });
      }
    }

    // 2. Parse request body
    const body = await req.json();
    const { productId, warehouseId, quantity: rawQuantity } = body;
    const quantity = parseInt(rawQuantity, 10) || 1;

    if (!productId || !warehouseId || quantity <= 0) {
      return NextResponse.json(
        { error: "Invalid request payload. Must include productId, warehouseId, and a positive quantity." },
        { status: 400 }
      );
    }

    // 3. Process reservation in transaction
    const result = await prisma.$transaction(async (tx) => {
      // a. Lazy cleanup of expired reservations for this stock
      await releaseExpiredReservationsForStock(tx, productId, warehouseId);

      // b. Acquire Row-Level Lock on the StockLevel row
      // Using SELECT ... FOR UPDATE ensures any concurrent transaction blocks until this transaction finishes
      await tx.$executeRaw`
        SELECT * FROM "StockLevel" 
        WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} 
        FOR UPDATE;
      `;

      // c. Fetch the locked StockLevel row
      const stock = await tx.stockLevel.findUnique({
        where: {
          productId_warehouseId: { productId, warehouseId },
        },
      });

      if (!stock) {
        throw new Error("INSUFFICIENT_STOCK"); // Product or Warehouse combination doesn't exist/no stock
      }

      // d. Check stock availability
      const availableUnits = stock.totalUnits - stock.reservedUnits;
      if (availableUnits < quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      // e. Reserve stock
      await tx.stockLevel.update({
        where: {
          productId_warehouseId: { productId, warehouseId },
        },
        data: {
          reservedUnits: {
            increment: quantity,
          },
        },
      });

      // f. Create reservation record
      // Expires in 10 minutes
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "PENDING",
          expiresAt,
          idempotencyKey,
        },
        include: {
          product: true,
          warehouse: true,
        },
      });

      return reservation;
    }, {
      // Set a short timeout to fail fast if we are waiting for a lock
      timeout: 10000,
    });

    const responseData = {
      message: "Reservation created successfully",
      reservation: {
        id: result.id,
        productId: result.productId,
        productName: result.product.name,
        warehouseId: result.warehouseId,
        warehouseName: result.warehouse.name,
        quantity: result.quantity,
        status: result.status,
        expiresAt: result.expiresAt,
        createdAt: result.createdAt,
      },
    };

    // 4. Save response in Idempotency table if key is provided
    if (idempotencyKey) {
      await prisma.idempotencyRequest.create({
        data: {
          key: idempotencyKey,
          response: JSON.stringify(responseData),
          statusCode: 201,
        },
      });
    }

    return NextResponse.json(responseData, { status: 201 });
  } catch (error: any) {
    if (error.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json(
        { error: "Not enough stock available in this warehouse" },
        { status: 409 }
      );
    }

    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
