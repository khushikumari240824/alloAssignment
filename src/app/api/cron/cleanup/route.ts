import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { releaseExpiredReservations } from "@/lib/reservations";

async function runCleanup() {
  const count = await prisma.$transaction(async (tx) => {
    return await releaseExpiredReservations(tx);
  });

  return {
    success: true,
    releasedCount: count,
    timestamp: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const result = await runCleanup();
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Cron GET cleanup error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run reservation cleanup" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const result = await runCleanup();
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Cron POST cleanup error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run reservation cleanup" },
      { status: 500 }
    );
  }
}
