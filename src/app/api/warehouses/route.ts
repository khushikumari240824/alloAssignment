import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(warehouses);
  } catch (error: any) {
    console.error("GET /api/warehouses error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch warehouses" },
      { status: 500 }
    );
  }
}
