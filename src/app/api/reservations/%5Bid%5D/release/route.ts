import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reservationId } = await params;

    // Process release in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Lock the reservation row
      await tx.$executeRaw`
        SELECT * FROM "Reservation" 
        WHERE "id" = ${reservationId} 
        FOR UPDATE;
      `;

      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
      });

      if (!reservation) {
        throw new Error("NOT_FOUND");
      }

      // If already released, return success (no-op)
      if (reservation.status === "RELEASED") {
        return { message: "Reservation already released" };
      }

      // If already confirmed, it cannot be released
      if (reservation.status === "CONFIRMED") {
        throw new Error("ALREADY_CONFIRMED");
      }

      // Lock StockLevel row
      await tx.$executeRaw`
        SELECT * FROM "StockLevel" 
        WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId} 
        FOR UPDATE;
      `;

      // Decrement reserved units
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

      // Update reservation status to RELEASED
      const updatedReservation = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "RELEASED",
        },
      });

      return {
        message: "Reservation released successfully",
        reservation: updatedReservation,
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }
    if (error.message === "ALREADY_CONFIRMED") {
      return NextResponse.json(
        { error: "Cannot release a reservation that has already been confirmed" },
        { status: 400 }
      );
    }

    console.error("POST /api/reservations/release error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
