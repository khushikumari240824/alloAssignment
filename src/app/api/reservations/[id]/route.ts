import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // Return structured details
    return NextResponse.json({
      id: reservation.id,
      productId: reservation.productId,
      productName: reservation.product.name,
      productPrice: reservation.product.price,
      productSku: reservation.product.sku,
      warehouseId: reservation.warehouseId,
      warehouseName: reservation.warehouse.name,
      warehouseLocation: reservation.warehouse.location,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      createdAt: reservation.createdAt,
    });
  } catch (error: any) {
    console.error("GET /api/reservations/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
