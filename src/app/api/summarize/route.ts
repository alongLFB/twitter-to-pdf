import { NextRequest, NextResponse } from "next/server";
import { ArticleSummary, SummarizeResponse } from "@/types/tweet";

// Simple in-memory cache to save API calls for repeat requests
const summaryCache = new Map<string, ArticleSummary>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, title, tweetId, forceRefresh } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json<SummarizeResponse>(
        { success: false, error: "缺少需要总结的文章文本内容" },
        { status: 400 }
      );
    }

    // Check cache (unless forceRefresh is requested)
    const cacheKey = tweetId || `${title || ""}_${text.slice(0, 80)}_${text.length}`;
    if (!forceRefresh && summaryCache.has(cacheKey)) {
      return NextResponse.json<SummarizeResponse>({
        success: true,
        data: summaryCache.get(cacheKey),
      });
    }

    // Determine Provider & Model from Environment
    const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase().trim();
    let model = (process.env.AI_MODEL || "").trim();

    // Context text preparation: truncate if over 35,000 characters to stay safe
    const safeText = text.length > 35000 ? text.slice(0, 35000) + "\n\n(正文篇幅过长，已截取前 35,000 字)..." : text;

    const systemPrompt = `你是一位顶级的数字媒体特约主编与深度阅读导师。你的任务是将用户提供的 Twitter/X 长文或推文提炼成极具洞察力、精炼且有网感的【TL;DR 智能速读摘要】。
请务必直接输出合法的 JSON 格式，严格遵守以下 JSON 结构规范，不要输出任何额外的标记、注释或前言后语：

{
  "oneSentence": "【一句话神总结】：用最凝练、有吸引力且直击要害的语言概括文章核心主旨（50字以内）。",
  "keyTakeaways": [
    "📌 核心要点1：起因背景或核心事实",
    "💡 核心要点2：关键转折、论据或作者深层逻辑",
    "🎯 核心要点3：最终结局、未来启示或结论判断"
  ],
  "goldenQuote": "文章中最具洞察力、感染力或金句属性的原句（若无则提炼最提气的结论）",
  "tags": ["核心话题标签1", "标签2", "标签3"]
}`;

    const userPrompt = `文章标题：${title || "无标题推特文章"}\n\n文章正文内容：\n${safeText}`;

    let summary: ArticleSummary;

    // =========================================================================
    // 1. Google Gemini (Default / High Quota Free Tier)
    // =========================================================================
    if (provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
      if (!apiKey) {
        return NextResponse.json<SummarizeResponse>(
          {
            success: false,
            error: "未配置 GEMINI_API_KEY。请在环境变量或 .env 中配置，可从 https://aistudio.google.com 免费获取。",
          },
          { status: 500 }
        );
      }

      model = model || "gemini-2.0-flash";

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.3,
          },
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Gemini API Error:", res.status, errorText);
        return NextResponse.json<SummarizeResponse>(
          { success: false, error: `Gemini API 调用失败 (${res.status}): ${errorText.slice(0, 150)}` },
          { status: 502 }
        );
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      summary = parseJsonResult(rawText);
      summary.provider = "Google Gemini";
      summary.model = model;
    }
    // =========================================================================
    // 2. OpenAI / DeepSeek / OneAPI Compatible
    // =========================================================================
    else if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
      if (!apiKey) {
        return NextResponse.json<SummarizeResponse>(
          { success: false, error: "未配置 OPENAI_API_KEY，请在 .env 中设置。" },
          { status: 500 }
        );
      }

      model = model || "gpt-4o-mini";
      const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("OpenAI API Error:", res.status, errorText);
        return NextResponse.json<SummarizeResponse>(
          { success: false, error: `OpenAI API 响应错误 (${res.status}): ${errorText.slice(0, 150)}` },
          { status: 502 }
        );
      }

      const data = await res.json();
      const rawText = data?.choices?.[0]?.message?.content;
      summary = parseJsonResult(rawText);
      summary.provider = "OpenAI";
      summary.model = model;
    }
    // =========================================================================
    // 3. Anthropic Claude
    // =========================================================================
    else if (provider === "claude" || provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.AI_API_KEY;
      if (!apiKey) {
        return NextResponse.json<SummarizeResponse>(
          { success: false, error: "未配置 ANTHROPIC_API_KEY，请在 .env 中设置。" },
          { status: 500 }
        );
      }

      model = model || "claude-3-5-haiku-20241022";
      const baseUrl = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1").replace(/\/$/, "");

      const res = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Claude API Error:", res.status, errorText);
        return NextResponse.json<SummarizeResponse>(
          { success: false, error: `Claude API 响应错误 (${res.status}): ${errorText.slice(0, 150)}` },
          { status: 502 }
        );
      }

      const data = await res.json();
      const rawText = data?.content?.[0]?.text;
      summary = parseJsonResult(rawText);
      summary.provider = "Anthropic Claude";
      summary.model = model;
    } else {
      return NextResponse.json<SummarizeResponse>(
        {
          success: false,
          error: `不支持的 AI 提供商: "${provider}"。目前仅支持 "gemini" | "openai" | "claude"。`,
        },
        { status: 400 }
      );
    }

    // Cache successful summary
    if (summary && summary.oneSentence) {
      if (summaryCache.size > 200) {
        summaryCache.clear();
      }
      summaryCache.set(cacheKey, summary);
    }

    return NextResponse.json<SummarizeResponse>({
      success: true,
      data: summary,
    });
  } catch (err: unknown) {
    console.error("Summarize API Unexpected Error:", err);
    return NextResponse.json<SummarizeResponse>(
      {
        success: false,
        error: err instanceof Error ? err.message : "总结生成过程中发生未知错误",
      },
      { status: 500 }
    );
  }
}

// Clean and safely parse model response into ArticleSummary structure
function parseJsonResult(raw: string | undefined): ArticleSummary {
  if (!raw) {
    throw new Error("AI 模型未返回有效文本内容");
  }

  // Strip Markdown code block indicators if any
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      oneSentence: parsed.oneSentence || "未能提取出单句总结",
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      goldenQuote: parsed.goldenQuote || undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    console.warn("Raw JSON parsing failed, attempting fallback regex:", raw);
    return {
      oneSentence: cleaned.slice(0, 100),
      keyTakeaways: ["提取摘要结构失败，请重试"],
      tags: ["速读"],
    };
  }
}
