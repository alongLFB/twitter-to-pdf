import fs from "fs";
import path from "path";

export interface SiteStats {
  visits: number;
  conversions: number;
  summaries: number;
  updatedAt: string;
}

// Initial realistic baseline counts
const DEFAULT_STATS: SiteStats = {
  visits: 1286,
  conversions: 358,
  summaries: 132,
  updatedAt: new Date().toISOString(),
};

// Data path: supports DATA_DIR env, or fallback to project root /data
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const STATS_FILE = path.join(DATA_DIR, "stats.json");

let memoryStats: SiteStats | null = null;

function ensureDataDir() {
  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ DATA_DIR)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn("Failed to create data dir:", e);
  }
}

export function getStats(): SiteStats {
  if (memoryStats) return memoryStats;

  try {
    ensureDataDir();
    if (fs.existsSync(/*turbopackIgnore: true*/ STATS_FILE)) {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ STATS_FILE, "utf-8");
      memoryStats = JSON.parse(content);
      return memoryStats!;
    } else {
      fs.writeFileSync(/*turbopackIgnore: true*/ STATS_FILE, JSON.stringify(DEFAULT_STATS, null, 2), "utf-8");
      memoryStats = { ...DEFAULT_STATS };
      return memoryStats;
    }
  } catch (err) {
    console.error("Error reading stats file:", err);
    return DEFAULT_STATS;
  }
}

export function incrementStat(key: "visits" | "conversions" | "summaries", amount = 1): SiteStats {
  const current = getStats();
  current[key] = (current[key] || 0) + amount;
  current.updatedAt = new Date().toISOString();
  memoryStats = current;

  // Persist to file
  try {
    ensureDataDir();
    fs.writeFileSync(/*turbopackIgnore: true*/ STATS_FILE, JSON.stringify(current, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing stats file:", err);
  }

  return current;
}
