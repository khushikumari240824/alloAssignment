import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        stockLevels: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    const formatted = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl,
      stockLevels: p.stockLevels.map((sl) => ({
        warehouseId: sl.warehouseId,
        warehouseName: sl.warehouse.name,
        location: sl.warehouse.location,
        totalUnits: sl.totalUnits,
        reservedUnits: sl.reservedUnits,
        availableUnits: Math.max(0, sl.totalUnits - sl.reservedUnits),
      })),
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch products" },
      { status: 500 }
    );
  }
}
