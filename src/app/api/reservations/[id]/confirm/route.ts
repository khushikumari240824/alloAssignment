import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reservationId } = await params;
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

    // 2. Process confirmation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // a. Acquire Row-Level Lock on the Reservation row
      await tx.$executeRaw`
        SELECT * FROM "Reservation" 
        WHERE "id" = ${reservationId} 
        FOR UPDATE;
      `;

      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: {
          product: true,
          warehouse: true,
        },
      });

      if (!reservation) {
        throw new Error("NOT_FOUND");
      }

      // b. If already confirmed, return success (no-op)
      if (reservation.status === "CONFIRMED") {
        return { reservation, alreadyConfirmed: true };
      }

      const now = new Date();
      const isExpired = reservation.status === "RELEASED" || reservation.expiresAt <= now;

      // c. If expired or released
      if (isExpired) {
        if (reservation.status === "PENDING") {
          // Clean it up right now: lock stock level and decrement reservedUnits
          await tx.$executeRaw`
            SELECT * FROM "StockLevel" 
            WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId} 
            FOR UPDATE;
          `;

          await tx.stockLevel.update({
            where: {
              productId_warehouseId: {
                productId: reservation.productId,
                warehouseId: reservation.warehouseId,
              },
            },
            data: {
              reservedUnits: {
                decrement: reservation.quantity,
              },
            },
          });

          await tx.reservation.update({
            where: { id: reservation.id },
            data: { status: "RELEASED" },
          });
        }
        throw new Error("EXPIRED");
      }

      // d. If reservation is PENDING and valid:
      // Lock the StockLevel row
      await tx.$executeRaw`
        SELECT * FROM "StockLevel" 
        WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId} 
        FOR UPDATE;
      `;

      // Permanently decrement stock levels
      await tx.stockLevel.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: {
          totalUnits: {
            decrement: reservation.quantity,
          },
          reservedUnits: {
            decrement: reservation.quantity,
          },
        },
      });

      // Update reservation status to CONFIRMED
      const updatedReservation = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "CONFIRMED",
        },
        include: {
          product: true,
          warehouse: true,
        },
      });

      return { reservation: updatedReservation, alreadyConfirmed: false };
    });

    const responseData = {
      message: result.alreadyConfirmed
        ? "Reservation was already confirmed"
        : "Reservation confirmed successfully",
      reservation: {
        id: result.reservation.id,
        productId: result.reservation.productId,
        productName: result.reservation.product.name,
        warehouseId: result.reservation.warehouseId,
        warehouseName: result.reservation.warehouse.name,
        quantity: result.reservation.quantity,
        status: result.reservation.status,
        expiresAt: result.reservation.expiresAt,
        updatedAt: result.reservation.updatedAt,
      },
    };

    // 3. Save response in Idempotency table if key is provided
    if (idempotencyKey) {
      await prisma.idempotencyRequest.create({
        data: {
          key: idempotencyKey,
          response: JSON.stringify(responseData),
          statusCode: 200,
        },
      });
    }

    return NextResponse.json(responseData, { status: 200 });
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }
    if (error.message === "EXPIRED") {
      return NextResponse.json(
        { error: "This reservation has expired and is no longer available" },
        { status: 410 }
      );
    }

    console.error("POST /api/reservations/confirm error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
