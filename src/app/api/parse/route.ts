import { NextRequest, NextResponse } from "next/server";
import { ParsedTweet, ArticleBlock, ParseResponse } from "@/types/tweet";
import { incrementStat } from "@/lib/stats";

interface DraftJsEntityRange {
  key: number | string;
  length: number;
  offset: number;
}

interface DraftJsBlock {
  key?: string;
  type?: string;
  text?: string;
  entityRanges?: DraftJsEntityRange[];
}

interface TwitterPhoto {
  url?: string;
}

interface MediaEntityItem {
  id?: string;
  media_id?: string;
  media_key?: string;
  media_info?: {
    original_img_url?: string;
  };
  original_img_url?: string;
  url?: string;
}

interface FXTwitterResponse {
  code?: number;
  message?: string;
  tweet?: {
    id?: string;
    url?: string;
    text?: string;
    created_at?: string;
    likes?: number;
    retweets?: number;
    bookmarks?: number;
    replies?: number;
    views?: number | null;
    author?: {
      name?: string;
      screen_name?: string;
      avatar_url?: string;
      description?: string;
      verified?: boolean;
      followers?: number;
      verification?: { verified?: boolean };
    };
    media?: {
      photos?: TwitterPhoto[];
    };
    article?: {
      title?: string;
      image?: string;
      preview_text?: string;
      cover_media?: {
        original_img_url?: string;
        url?: string;
        media_info?: {
          original_img_url?: string;
        };
      };
      media_entities?: MediaEntityItem[];
      content?: {
        blocks?: DraftJsBlock[];
        entityMap?: unknown;
      };
    };
  };
}

function extractTweetId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If input is already numeric ID
  if (/^\d{1,25}$/.test(trimmed)) {
    return trimmed;
  }

  // If input is a URL
  const statusMatch = trimmed.match(/status(?:es)?\/(\d{1,25})/i);
  if (statusMatch && statusMatch[1]) {
    return statusMatch[1];
  }

  return null;
}

function calculateWordCount(text: string): number {
  // Count CJK characters + non-CJK words
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const nonCjk = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, " ");
  const words = (nonCjk.match(/[a-zA-Z0-9_\-]+/g) || []).length;
  return cjkChars + words;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const urlOrId = body.url || body.id;

    if (!urlOrId) {
      return NextResponse.json<ParseResponse>(
        { success: false, error: "请输入推特链接或推文 ID" },
        { status: 400 }
      );
    }

    const tweetId = extractTweetId(urlOrId);
    if (!tweetId) {
      return NextResponse.json<ParseResponse>(
        { success: false, error: "未识别出有效的推文 ID，请检查链接格式是否正确" },
        { status: 400 }
      );
    }

    // 1. Fetch from FXTwitter API
    let fxtwitterData: FXTwitterResponse | null = null;
    try {
      const fxRes = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
          Accept: "application/json",
        },
        next: { revalidate: 60 },
      });

      if (fxRes.ok) {
        fxtwitterData = (await fxRes.json()) as FXTwitterResponse;
      }
    } catch (e) {
      console.warn("FXTwitter fetch failed, trying fallbacks...", e);
    }

    const tweet = fxtwitterData?.tweet;
    if (!tweet) {
      // 2. Try react-tweet fallback
      try {
        const rtRes = await fetch(`https://react-tweet.vercel.app/api/tweet/${tweetId}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (rtRes.ok) {
          const rtData = await rtRes.json();
          const d = rtData?.data;
          if (d) {
            const rawText = d.text || "";
            const wordCount = calculateWordCount(rawText);
            const parsed: ParsedTweet = {
              id: tweetId,
              url: `https://x.com/i/status/${tweetId}`,
              isArticle: !!d.article,
              title: d.article?.title || (rawText.slice(0, 40) + "..."),
              coverImage: d.article?.cover_media?.media_info?.original_img_url || null,
              blocks: [
                {
                  key: "fallback-text",
                  type: "unstyled",
                  text: d.article?.preview_text || rawText,
                },
              ],
              text: d.article?.preview_text || rawText,
              author: {
                name: d.user?.name || "Twitter User",
                screen_name: d.user?.screen_name || "twitter",
                avatar_url: d.user?.profile_image_url_https || "",
                verified: !!d.user?.verified,
                description: d.user?.description || "",
                followers: d.user?.followers_count || 0,
              },
              photos: (d.photos || [])
                .map((p: TwitterPhoto) => p.url)
                .filter((u: string | undefined): u is string => typeof u === "string"),
              stats: {
                likes: d.favorite_count || 0,
                retweets: d.conversation_count || 0,
                bookmarks: 0,
                replies: 0,
                views: null,
              },
              createdAt: d.created_at || new Date().toISOString(),
              readingTime: Math.max(1, Math.ceil(wordCount / 350)),
              wordCount,
            };
            return NextResponse.json<ParseResponse>({ success: true, data: parsed });
          }
        }
      } catch (errFallback) {
        console.error("Fallback also failed:", errFallback);
      }

      return NextResponse.json<ParseResponse>(
        { success: false, error: "未能获取到该推文或文章，可能已被删除或设为私密。" },
        { status: 404 }
      );
    }

    const isArticle = !!tweet.article;
    const article = tweet.article;

    let title = "";
    let coverImage: string | null = null;
    let blocks: ArticleBlock[] = [];
    let fullText = "";

    // Always extract tweet-level photos
    const photos: string[] = [];
    if (tweet.media?.photos) {
      for (const p of tweet.media.photos) {
        if (p.url) photos.push(p.url);
      }
    }

    if (isArticle && article) {
      title = article.title || "未命名推特文章";

      // Extract cover image
      coverImage =
        article.cover_media?.media_info?.original_img_url ||
        article.cover_media?.original_img_url ||
        article.cover_media?.url ||
        article.image ||
        null;

      // Extract media_entities mapping
      const mediaMap = new Map<string, string>();
      const mediaList: string[] = [];
      if (article.media_entities && Array.isArray(article.media_entities)) {
        for (const me of article.media_entities) {
          const imgUrl = me.media_info?.original_img_url || me.original_img_url || me.url;
          if (imgUrl) {
            mediaList.push(imgUrl);
            if (me.id) mediaMap.set(String(me.id), imgUrl);
            if (me.media_id) mediaMap.set(String(me.media_id), imgUrl);
            if (me.media_key) mediaMap.set(String(me.media_key), imgUrl);
          }
        }
      }

      // Extract entityMap image entities
      const entityImageMap = new Map<string, string>();
      const rawEntityMap = article.content?.entityMap;
      if (Array.isArray(rawEntityMap)) {
        for (const item of rawEntityMap) {
          const k = String(item.key);
          const val = item.value;
          if (val) {
            const entType = String(val.type || "").toUpperCase();
            const entData = val.data || {};
            const imgUrl = entData.url || entData.src || entData.original_img_url || mediaMap.get(String(entData.media_id || ""));
            if (imgUrl && (entType.includes("IMAGE") || entType.includes("PHOTO") || entType.includes("MEDIA"))) {
              entityImageMap.set(k, imgUrl);
            }
          }
        }
      } else if (rawEntityMap && typeof rawEntityMap === "object") {
        for (const [k, val] of Object.entries(rawEntityMap as Record<string, { type?: string; data?: Record<string, string | number> }>)) {
          if (val) {
            const entType = String(val.type || "").toUpperCase();
            const entData = val.data || {};
            const imgUrl = (entData.url as string) || (entData.src as string) || (entData.original_img_url as string) || mediaMap.get(String(entData.media_id || ""));
            if (imgUrl && (entType.includes("IMAGE") || entType.includes("PHOTO") || entType.includes("MEDIA"))) {
              entityImageMap.set(k, imgUrl);
            }
          }
        }
      }

      // Extract Draft.js content blocks
      const rawBlocks = article.content?.blocks || [];
      blocks = rawBlocks.map((b: DraftJsBlock, index: number) => {
        let type = b.type || "unstyled";
        const text = (b.text || "").trim();
        let imageUrl: string | undefined = undefined;

        // Check if block links to an entity image
        if (b.entityRanges && b.entityRanges.length > 0) {
          for (const er of b.entityRanges) {
            const found = entityImageMap.get(String(er.key));
            if (found) {
              imageUrl = found;
              type = "image";
              break;
            }
          }
        }

        // Check if block is atomic and match remaining media
        if ((type === "atomic" || type === "media") && !imageUrl && mediaList.length > 0) {
          imageUrl = mediaList.shift();
          type = "image";
        }

        // Check if block text contains markdown image ![alt](url)
        const mdImg = text.match(/^!\[.*?\]\((https?:\/\/[^\s)]+)\)$/);
        if (mdImg && mdImg[1]) {
          type = "image";
          imageUrl = mdImg[1];
        }

        // Check if text is standalone twimg URL
        if (type === "unstyled" && /^https?:\/\/pbs\.twimg\.com\/media\/[^\s]+$/.test(text)) {
          type = "image";
          imageUrl = text;
        }

        // Convert standard markdown separators to divider
        if (text === "---" || text === "***" || text === "——") {
          type = "divider";
        }

        return {
          key: b.key || `block-${index}`,
          type,
          text: b.text || "",
          imageUrl,
        };
      });

      // If there are still media entities not inlined in blocks, add them to photos
      for (const remaining of mediaList) {
        if (!photos.includes(remaining) && remaining !== coverImage) {
          photos.push(remaining);
        }
      }

      // Assemble full plain text for export / markdown
      fullText = blocks
        .map((b) => {
          if (b.type === "divider") return "\n---\n";
          if (b.type === "image") return `\n![插图](${b.imageUrl})\n`;
          if (b.type === "header-one") return `# ${b.text}`;
          if (b.type === "header-two") return `## ${b.text}`;
          if (b.type === "header-three") return `### ${b.text}`;
          if (b.type === "blockquote") return `> ${b.text}`;
          return b.text;
        })
        .filter((t) => t.length > 0)
        .join("\n\n");
    } else {
      // Standard tweet or Note tweet
      const tweetText = tweet.text || "";
      const lines = tweetText.split("\n\n");
      title = lines[0]?.slice(0, 45) || `${tweet.author?.name || "Twitter"} 的推文`;

      blocks = lines
        .map((line: string, idx: number) => ({
          key: `tweet-p-${idx}`,
          type: "unstyled",
          text: line.trim(),
        }))
        .filter((b: ArticleBlock) => b.text.length > 0);

      fullText = tweetText;
    }

    const wordCount = calculateWordCount(fullText || title);
    const readingTime = Math.max(1, Math.ceil(wordCount / 350));

    const parsedTweet: ParsedTweet = {
      id: tweet.id || tweetId,
      url: tweet.url || `https://x.com/${tweet.author?.screen_name || "i"}/status/${tweetId}`,
      isArticle,
      title,
      coverImage,
      blocks,
      text: fullText,
      author: {
        name: tweet.author?.name || "X 用户",
        screen_name: tweet.author?.screen_name || "",
        avatar_url: tweet.author?.avatar_url || "",
        verified: !!(tweet.author?.verification?.verified || tweet.author?.verified),
        description: tweet.author?.description || "",
        followers: tweet.author?.followers,
      },
      photos,
      stats: {
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        bookmarks: tweet.bookmarks || 0,
        replies: tweet.replies || 0,
        views: tweet.views || null,
      },
      createdAt: tweet.created_at || new Date().toISOString(),
      readingTime,
      wordCount,
    };

    try {
      incrementStat("conversions");
    } catch {
      // ignore
    }

    return NextResponse.json<ParseResponse>({
      success: true,
      data: parsedTweet,
    });
  } catch (error: unknown) {
    console.error("Parse error:", error);
    const msg = error instanceof Error ? error.message : "解析过程中发生未知错误";
    return NextResponse.json<ParseResponse>(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
