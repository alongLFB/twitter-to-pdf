import { NextRequest, NextResponse } from "next/server";
import { getStats, incrementStat } from "@/lib/stats";

export async function GET() {
  try {
    const stats = getStats();
    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (err: unknown) {
    console.error("Failed to get stats:", err);
    return NextResponse.json(
      { success: false, error: "获取统计数据失败" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    let updatedStats;
    if (action === "visit") {
      updatedStats = incrementStat("visits");
    } else if (action === "conversion") {
      updatedStats = incrementStat("conversions");
    } else if (action === "summary") {
      updatedStats = incrementStat("summaries");
    } else {
      updatedStats = getStats();
    }

    return NextResponse.json({
      success: true,
      data: updatedStats,
    });
  } catch (err: unknown) {
    console.error("Failed to update stats:", err);
    return NextResponse.json(
      { success: false, error: "更新统计数据失败" },
      { status: 500 }
    );
  }
}
