import fs from "fs";
import path from "path";
import { ParsedTweet, ArticleSummary } from "@/types/tweet";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const ARCHIVE_DIR = path.join(DATA_DIR, "archive");
const SUMMARIES_DIR = path.join(DATA_DIR, "summaries");

function ensureDirs() {
  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ ARCHIVE_DIR)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ ARCHIVE_DIR, { recursive: true });
    }
    if (!fs.existsSync(/*turbopackIgnore: true*/ SUMMARIES_DIR)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ SUMMARIES_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn("Failed to ensure archive dirs:", e);
  }
}

/**
 * Persist parsed tweet to local server storage as permanent snapshot
 */
export function saveTweetToArchive(tweet: ParsedTweet): void {
  try {
    ensureDirs();
    const filePath = path.join(ARCHIVE_DIR, `${tweet.id}.json`);
    const dataToSave: ParsedTweet = {
      ...tweet,
      isFromArchive: false,
      archivedAt: new Date().toISOString(),
    };
    fs.writeFileSync(/*turbopackIgnore: true*/ filePath, JSON.stringify(dataToSave, null, 2), "utf-8");
  } catch (err) {
    console.error(`[Archive] Failed to save tweet snapshot for ${tweet.id}:`, err);
  }
}

/**
 * Retrieve parsed tweet snapshot from local server storage
 */
export function getTweetFromArchive(tweetId: string): ParsedTweet | null {
  try {
    ensureDirs();
    const filePath = path.join(ARCHIVE_DIR, `${tweetId}.json`);
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf-8");
      const data: ParsedTweet = JSON.parse(content);
      data.isFromArchive = true;
      return data;
    }
  } catch (err) {
    console.error(`[Archive] Failed to read tweet snapshot for ${tweetId}:`, err);
  }
  return null;
}

/**
 * Persist AI summary to local server storage
 */
export function saveSummaryToArchive(tweetId: string, summary: ArticleSummary): void {
  try {
    ensureDirs();
    const filePath = path.join(SUMMARIES_DIR, `${tweetId}.json`);
    fs.writeFileSync(/*turbopackIgnore: true*/ filePath, JSON.stringify(summary, null, 2), "utf-8");
  } catch (err) {
    console.error(`[Archive] Failed to save summary for ${tweetId}:`, err);
  }
}

/**
 * Retrieve AI summary from local server storage
 */
export function getSummaryFromArchive(tweetId: string): ArticleSummary | null {
  try {
    ensureDirs();
    const filePath = path.join(SUMMARIES_DIR, `${tweetId}.json`);
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`[Archive] Failed to read summary for ${tweetId}:`, err);
  }
  return null;
}
