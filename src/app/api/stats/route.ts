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

// In-memory record to prevent automated script bot spam on visit counter (5s per IP)
const visitIpMap = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    let updatedStats;
    if (action === "visit") {
      const forwarded =
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";

      const now = Date.now();
      const lastIpVisit = visitIpMap.get(forwarded) || 0;

      // Allow if more than 5 seconds have elapsed from this IP, or if IP is unknown/local
      if (forwarded === "unknown" || now - lastIpVisit >= 5000) {
        visitIpMap.set(forwarded, now);
        updatedStats = incrementStat("visits");

        // Clean up map periodically if it grows large
        if (visitIpMap.size > 2000) {
          for (const [k, v] of visitIpMap.entries()) {
            if (now - v > 60000) visitIpMap.delete(k);
          }
        }
      } else {
        updatedStats = getStats();
      }
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
