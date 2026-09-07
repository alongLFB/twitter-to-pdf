/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import {
  FileText,
  Search,
  Sparkles,
  Download,
  Printer,
  FileCode,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  Trash2,
  Type,
  Eye,
  RefreshCw,
  Heart,
  Repeat,
  Bookmark,
  Clipboard,
  X as CloseIcon,
  ShieldCheck,
  ArrowLeft,
  ArrowUp,
  HelpCircle,
  Bot,
  Quote,
  Tag,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ParsedTweet, ParseResponse, ArticleSummary, SummarizeResponse } from "@/types/tweet";
import { SponsorModal } from "@/components/SponsorModal";

const DEMO_LINKS = [
  {
    title: "孙宇晨长文《我的女友景甜》",
    url: "https://x.com/justinsuntron/status/2092932777612390850?s=20",
    desc: "Twitter Article 深度长篇 (294个正文段落)",
    tag: "🔥 热门长文",
  },
  {
    title: "推特历史第一条推文 (Jack)",
    url: "https://x.com/jack/status/20",
    desc: "2006年发布的第一条经典推文",
    tag: "🏛️ 历史经典",
  },
];

interface HistoryItem {
  id: string;
  title: string;
  authorName: string;
  screenName: string;
  createdAt: string;
  convertedAt: string;
  url: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tweetData, setTweetData] = useState<ParsedTweet | null>(null);

  // PDF & Reading Preferences
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("base");
  const [fontFamily, setFontFamily] = useState<"sans" | "serif">("sans");
  const [readerTheme, setReaderTheme] = useState<"dark" | "light" | "sepia">("light");
  const [showCover, setShowCover] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [pageSize, setPageSize] = useState<"a4" | "letter">("a4");

  // Export states
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [showFloatingBar, setShowFloatingBar] = useState(false);

  // AI Summary states
  const [summary, setSummary] = useState<ArticleSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
  const [includeSummaryInPdf, setIncludeSummaryInPdf] = useState(true);
  const [summaryCooldown, setSummaryCooldown] = useState(0);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Sponsor Modal state
  const [sponsorOpen, setSponsorOpen] = useState(false);

  // Real-time Persistent Site Stats
  const [stats, setStats] = useState<{ visits: number; conversions: number; summaries: number } | null>(null);

  // History state initialized safely after mount to prevent SSR hydration mismatch
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem("twitter_pdf_history");
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      // ignore
    }

    // Fetch site stats
    axios
      .get<{ success: boolean; data: { visits: number; conversions: number; summaries: number } }>("/api/stats")
      .then((res) => {
        if (res.data.success && res.data.data) {
          setStats(res.data.data);
        }
      })
      .catch(() => {});

    // Track visit once per browser session
    try {
      if (typeof window !== "undefined" && !sessionStorage.getItem("visited_x2pdf")) {
        sessionStorage.setItem("visited_x2pdf", "1");
        axios
          .post<{ success: boolean; data: { visits: number; conversions: number; summaries: number } }>("/api/stats", {
            action: "visit",
          })
          .then((res) => {
            if (res.data.success && res.data.data) {
              setStats(res.data.data);
            }
          })
          .catch(() => {});
      }
    } catch {
      // ignore
    }
  }, []);

  // DOM Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  // Track scroll position to show sticky floating bar when viewing long articles
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400 && tweetData) {
        setShowFloatingBar(true);
      } else {
        setShowFloatingBar(false);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [tweetData]);

  const saveToHistory = (data: ParsedTweet) => {
    try {
      const newItem: HistoryItem = {
        id: data.id,
        title: data.title,
        authorName: data.author.name,
        screenName: data.author.screen_name,
        createdAt: data.createdAt,
        convertedAt: new Date().toLocaleDateString("zh-CN"),
        url: data.url,
      };
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== data.id);
        const updated = [newItem, ...filtered].slice(0, 8);
        if (typeof window !== "undefined") {
          localStorage.setItem("twitter_pdf_history", JSON.stringify(updated));
        }
        return updated;
      });
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem("twitter_pdf_history");
    }
    showToast("已清空浏览器本地存储的转换历史记录");
  };

  const handleGenerateSummary = async (forceRefresh = false) => {
    if (!tweetData) return;

    // Rate-limiting check on re-generation
    if (forceRefresh && summaryCooldown > 0) {
      showToast(`操作过于频繁，请等待 ${summaryCooldown} 秒后再次重试`);
      return;
    }

    setLoadingSummary(true);
    setSummaryError(null);

    // If re-generating, trigger 15-second cooldown
    if (forceRefresh) {
      setSummaryCooldown(15);
      const timer = setInterval(() => {
        setSummaryCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    try {
      const res = await axios.post<SummarizeResponse>("/api/summarize", {
        text: tweetData.text,
        title: tweetData.title,
        author: `${tweetData.author.name} (@${tweetData.author.screen_name})`,
        tweetId: tweetData.id,
        forceRefresh,
      });

      if (res.data.success && res.data.data) {
        setSummary(res.data.data);
        setIsSummaryCollapsed(false);
        showToast("✨ AI 智能速读摘要已生成！");
        // Real-time update summaries stat counter
        setStats((prev) => (prev ? { ...prev, summaries: prev.summaries + 1 } : null));
      } else {
        setSummaryError(res.data.error || "生成摘要失败，请检查服务器 AI 配置");
      }
    } catch (err: unknown) {
      console.error("Generate summary error:", err);
      if (axios.isAxiosError(err)) {
        setSummaryError(err.response?.data?.error || err.message || "请求 AI 接口失败，请检查网络或 API 配置");
      } else if (err instanceof Error) {
        setSummaryError(err.message);
      } else {
        setSummaryError("生成摘要时出现未知错误");
      }
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleCopySummary = () => {
    if (!summary) return;

    let text = `📝 【AI 速读提炼】${tweetData?.title || "Twitter 长文精读"}\n\n`;
    text += `💡 核心总结：\n${summary.oneSentence}\n\n`;

    if (summary.keyTakeaways && summary.keyTakeaways.length > 0) {
      text += `📌 核心要点：\n`;
      summary.keyTakeaways.forEach((item, idx) => {
        text += `${idx + 1}. ${item}\n`;
      });
      text += `\n`;
    }

    if (summary.goldenQuote) {
      text += `💬 精选金句：\n“${summary.goldenQuote}”\n\n`;
    }

    if (summary.tags && summary.tags.length > 0) {
      text += `🏷️ 关键词：${summary.tags.map((t) => `#${t}`).join(" ")}\n\n`;
    }

    if (tweetData?.url) {
      text += `🔗 原文链接：${tweetData.url}\n`;
    }
    text += `— 由 X to PDF 智能提炼导出`;

    try {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedSummary(true);
        showToast("📋 AI 总结文案已复制，可直接粘贴分享给好友！");
        setTimeout(() => setCopiedSummary(false), 2500);
      });
    } catch {
      showToast("复制失败，请手动选取文本复制");
    }
  };

  const handleParse = async (targetUrl?: string) => {
    const inputUrl = targetUrl || url;
    if (!inputUrl.trim()) {
      setError("请先输入或粘贴 Twitter/X 推文或文章链接");
      return;
    }

    setLoading(true);
    setError("");
    setSummary(null);
    setSummaryError(null);
    setLoadingSummary(false);

    try {
      const res = await axios.post<ParseResponse>("/api/parse", { url: inputUrl.trim() });
      if (res.data.success && res.data.data) {
        setTweetData(res.data.data);
        saveToHistory(res.data.data);
        // Real-time update conversions stat counter
        setStats((prev) => (prev ? { ...prev, conversions: prev.conversions + 1 } : null));
        // Scroll to toolbar so user immediately sees the download action buttons and settings
        setTimeout(() => {
          toolbarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      } else {
        setError(res.data.error || "解析失败，请检查链接是否正确或稍后重试");
      }
    } catch (err: unknown) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || err.message || "请求服务器失败，请稍后重试");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("解析过程中发生未知错误");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        handleParse(text);
      }
    } catch (err) {
      console.warn("Clipboard access denied:", err);
    }
  };

  // Reset and Return back to initial input state cleanly (strictly preserves Image 2 layout)
  const handleBackToInput = () => {
    // 1. Immediately reset scroll position to the absolute top
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (typeof document !== "undefined") {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.getElementById("page-top")?.scrollIntoView({ behavior: "instant", block: "start" });
    }

    // 2. Clear parsed tweet data and error to return to clean input view
    setTweetData(null);
    setError("");
    setSummary(null);
    setSummaryError(null);
    setLoadingSummary(false);

    // 3. Ensure after React unmounts the article DOM that the viewport stays firmly anchored at top: 0
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (typeof document !== "undefined") {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        document.getElementById("page-top")?.scrollIntoView({ behavior: "instant", block: "start" });
      }
    });

    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (typeof document !== "undefined") {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        document.getElementById("page-top")?.scrollIntoView({ behavior: "instant", block: "start" });
      }
    }, 50);

    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (typeof document !== "undefined") {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    }, 120);
  };

  // Scroll to top
  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Safe Paginated Direct PDF Generation
  const handleDownloadPdf = async () => {
    if (!tweetData) return;
    setGeneratingPdf(true);
    setDownloadProgress("正在准备排版与分页...");

    let offscreen: HTMLDivElement | null = null;

    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      // Create an off-screen container for rendering A4 pages
      offscreen = document.createElement("div");
      offscreen.style.position = "fixed";
      offscreen.style.left = "-99999px";
      offscreen.style.top = "0";
      offscreen.style.width = "780px";
      offscreen.style.zIndex = "-9999";
      offscreen.style.background = "#ffffff";
      offscreen.style.color = "#111827";
      document.body.appendChild(offscreen);

      // Usable height calibrated to match standard A4 print dimensions
      const PAGE_CONTENT_MAX_HEIGHT = 960;
      const createdPages: HTMLElement[] = [];

      const createPage = (pageNum: number) => {
        const page = document.createElement("div");
        page.style.width = "780px";
        page.style.height = "1123px";
        page.style.maxHeight = "1123px";
        page.style.overflow = "hidden";
        page.style.background = "#ffffff";
        page.style.color = "#111827";
        page.style.padding = "40px 42px 42px 42px";
        page.style.boxSizing = "border-box";
        page.style.position = "relative";
        page.style.fontFamily =
          fontFamily === "serif"
            ? 'Georgia, Cambria, "Songti SC", "Noto Serif SC", serif'
            : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';

        // Page Header
        const pageHeader = document.createElement("div");
        pageHeader.style.display = "flex";
        pageHeader.style.justifyContent = "space-between";
        pageHeader.style.fontSize = "10px";
        pageHeader.style.color = "#94a3b8";
        pageHeader.style.borderBottom = "1px solid #f1f5f9";
        pageHeader.style.paddingBottom = "6px";
        pageHeader.style.marginBottom = "18px";
        pageHeader.innerHTML = `<span style="font-weight:600;">X to PDF</span><span>${new Date().toLocaleDateString("zh-CN")}</span>`;
        page.appendChild(pageHeader);

        // Content Area
        const contentSlot = document.createElement("div");
        contentSlot.style.maxHeight = `${PAGE_CONTENT_MAX_HEIGHT}px`;
        contentSlot.style.overflow = "hidden";
        page.appendChild(contentSlot);

        // Page Footer with Page Number
        const pageFooter = document.createElement("div");
        pageFooter.style.position = "absolute";
        pageFooter.style.bottom = "18px";
        pageFooter.style.left = "42px";
        pageFooter.style.right = "42px";
        pageFooter.style.display = "flex";
        pageFooter.style.justifyContent = "space-between";
        pageFooter.style.fontSize = "10px";
        pageFooter.style.color = "#94a3b8";
        pageFooter.style.borderTop = "1px solid #f1f5f9";
        pageFooter.style.paddingTop = "8px";
        pageFooter.innerHTML = `<span style="max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tweetData.title}</span><span class="page-num-tag">第 ${pageNum} 页</span>`;
        page.appendChild(pageFooter);

        offscreen?.appendChild(page);
        createdPages.push(page);
        return { page, contentSlot };
      };

      let pageNum = 1;
      let { contentSlot: currentSlot } = createPage(pageNum);

      const elementsToLayout: HTMLElement[] = [];

      // 1. Document Title & Author Info
      const docHeader = document.createElement("div");
      docHeader.style.marginBottom = "20px";
      docHeader.style.borderBottom = "1px solid #e2e8f0";
      docHeader.style.paddingBottom = "14px";
      docHeader.innerHTML = `
        <h1 style="font-size: 22px; font-weight: 800; line-height: 1.35; margin-bottom: 10px; color: #0f172a;">
          ${tweetData.title}
        </h1>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b;">
          <div>
            <strong style="color: #1e293b;">${tweetData.author.name}</strong> (@${tweetData.author.screen_name})
          </div>
          <div>
            ${new Date(tweetData.createdAt).toLocaleDateString("zh-CN")} · ${tweetData.wordCount} 字 · 约 ${tweetData.readingTime} 分钟阅读
          </div>
        </div>
      `;
      elementsToLayout.push(docHeader);

      // 1.5 AI Summary Card for PDF (if enabled and available)
      if (includeSummaryInPdf && summary) {
        const summaryDiv = document.createElement("div");
        summaryDiv.style.marginBottom = "20px";
        summaryDiv.style.padding = "14px 18px";
        summaryDiv.style.borderRadius = "8px";
        summaryDiv.style.background = "#f8fafc";
        summaryDiv.style.border = "1px solid #e2e8f0";
        summaryDiv.style.borderLeft = "4px solid #6366f1";

        let keyPointsHtml = "";
        if (summary.keyTakeaways && summary.keyTakeaways.length > 0) {
          keyPointsHtml = `
            <div style="margin-top: 8px; font-size: 11.5px; line-height: 1.6; color: #334155;">
              <strong style="color: #1e293b; font-size: 11.5px; display: block; margin-bottom: 4px;">📌 核心要点速览：</strong>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${summary.keyTakeaways.map((point) => `<div style="line-height: 1.5;">${point}</div>`).join("")}
              </div>
            </div>
          `;
        }

        let quoteHtml = "";
        if (summary.goldenQuote) {
          quoteHtml = `
            <div style="margin-top: 8px; padding: 6px 12px; background: #ffffff; border-left: 3px solid #818cf8; border-radius: 4px; font-style: italic; font-size: 11px; color: #475569;">
              💬 "${summary.goldenQuote}"
            </div>
          `;
        }

        let tagsHtml = "";
        if (summary.tags && summary.tags.length > 0) {
          tagsHtml = `
            <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
              ${summary.tags.map((tag) => `<span style="font-size: 9.5px; background: #e0e7ff; color: #4338ca; padding: 1px 7px; border-radius: 9999px;">#${tag}</span>`).join("")}
            </div>
          `;
        }

        summaryDiv.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12.5px; font-weight: 700; color: #4338ca;">
              ✨ AI 智能速读 · 核心提炼 (TL;DR)
            </span>
            <span style="font-size: 9.5px; background: #ede9fe; color: #6d28d9; padding: 2px 7px; border-radius: 9999px; font-weight: 600;">
              ${summary.model || summary.provider || "AI Generated"}
            </span>
          </div>
          <div style="font-size: 12px; font-weight: 600; line-height: 1.55; color: #0f172a; background: #ffffff; padding: 7px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            💡 ${summary.oneSentence}
          </div>
          ${keyPointsHtml}
          ${quoteHtml}
          ${tagsHtml}
        `;
        elementsToLayout.push(summaryDiv);
      }

      // 2. Cover image (if enabled)
      if (showCover && tweetData.coverImage) {
        const coverDiv = document.createElement("div");
        coverDiv.style.marginBottom = "18px";
        coverDiv.style.textAlign = "center";
        const img = document.createElement("img");
        img.src = `/api/proxy-image?url=${encodeURIComponent(tweetData.coverImage)}`;
        img.style.maxWidth = "100%";
        img.style.maxHeight = "320px";
        img.style.borderRadius = "8px";
        img.style.objectFit = "cover";
        img.crossOrigin = "anonymous";
        coverDiv.appendChild(img);
        elementsToLayout.push(coverDiv);
      }

      // 3. Article Content Blocks (including inline images)
      for (const block of tweetData.blocks) {
        if (block.type === "image" || block.imageUrl) {
          const imgDiv = document.createElement("div");
          imgDiv.style.margin = "14px 0";
          imgDiv.style.textAlign = "center";
          const img = document.createElement("img");
          img.src = `/api/proxy-image?url=${encodeURIComponent(block.imageUrl || block.text)}`;
          img.style.maxWidth = "100%";
          img.style.maxHeight = "320px";
          img.style.borderRadius = "8px";
          img.style.objectFit = "contain";
          img.crossOrigin = "anonymous";
          imgDiv.appendChild(img);
          if (block.text && block.text !== block.imageUrl && !block.text.startsWith("http")) {
            const cap = document.createElement("div");
            cap.style.fontSize = "10px";
            cap.style.color = "#64748b";
            cap.style.marginTop = "4px";
            cap.textContent = block.text;
            imgDiv.appendChild(cap);
          }
          elementsToLayout.push(imgDiv);
        } else if (block.type === "divider") {
          const hr = document.createElement("hr");
          hr.style.border = "none";
          hr.style.borderTop = "1px solid #e2e8f0";
          hr.style.margin = "14px 0";
          elementsToLayout.push(hr);
        } else if (block.type === "header-one") {
          const h = document.createElement("h2");
          h.style.fontSize = "17px";
          h.style.fontWeight = "700";
          h.style.color = "#4338ca";
          h.style.margin = "16px 0 8px 0";
          h.textContent = block.text;
          elementsToLayout.push(h);
        } else if (block.type === "header-two" || block.type === "header-three") {
          const h = document.createElement("h3");
          h.style.fontSize = "15px";
          h.style.fontWeight = "600";
          h.style.color = "#0369a1";
          h.style.margin = "14px 0 6px 0";
          h.textContent = block.text;
          elementsToLayout.push(h);
        } else if (block.type === "blockquote") {
          const bq = document.createElement("blockquote");
          bq.style.borderLeft = "3.5px solid #6366f1";
          bq.style.background = "#f8fafc";
          bq.style.color = "#475569";
          bq.style.padding = "8px 12px";
          bq.style.margin = "10px 0";
          bq.style.fontStyle = "italic";
          bq.style.fontSize = fontSize === "sm" ? "12px" : fontSize === "lg" ? "15px" : "13.5px";
          bq.textContent = block.text;
          elementsToLayout.push(bq);
        } else {
          if (!block.text.trim()) continue;
          const p = document.createElement("p");
          p.style.fontSize = fontSize === "sm" ? "12.5px" : fontSize === "lg" ? "15.5px" : "14px";
          p.style.lineHeight = "1.85";
          p.style.color = "#334155";
          p.style.marginBottom = "10px";
          p.style.textAlign = "justify";
          p.textContent = block.text;
          elementsToLayout.push(p);
        }
      }

      // Add attached photos if any
      if (tweetData.photos && tweetData.photos.length > 0) {
        for (const photo of tweetData.photos) {
          const photoDiv = document.createElement("div");
          photoDiv.style.margin = "12px 0";
          photoDiv.style.textAlign = "center";
          const img = document.createElement("img");
          img.src = `/api/proxy-image?url=${encodeURIComponent(photo)}`;
          img.style.maxWidth = "100%";
          img.style.maxHeight = "280px";
          img.style.borderRadius = "8px";
          img.crossOrigin = "anonymous";
          photoDiv.appendChild(img);
          elementsToLayout.push(photoDiv);
        }
      }

      // Layout elements into pages with zero text truncation
      for (const el of elementsToLayout) {
        currentSlot.appendChild(el);
        if (currentSlot.scrollHeight > PAGE_CONTENT_MAX_HEIGHT) {
          // Overflowed page capacity! Move element to next page
          currentSlot.removeChild(el);
          pageNum++;
          const next = createPage(pageNum);
          currentSlot = next.contentSlot;
          currentSlot.appendChild(el);
        }
      }

      // Update total page numbers in footer
      const totalPages = createdPages.length;
      for (let i = 0; i < totalPages; i++) {
        const tag = createdPages[i].querySelector(".page-num-tag");
        if (tag) tag.textContent = `第 ${i + 1} / ${totalPages} 页`;
      }

      // Initialize jsPDF
      const isLetter = pageSize === "letter";
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: isLetter ? "letter" : "a4",
      });
      const pageWidth = isLetter ? 215.9 : 210;
      const pageHeight = isLetter ? 279.4 : 297;

      // Render each page individually to canvas
      for (let i = 0; i < totalPages; i++) {
        setDownloadProgress(`正在渲染 PDF (第 ${i + 1} / ${totalPages} 页)...`);
        const canvas = await html2canvas(createdPages[i], {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, pageHeight);
      }

      const safeTitle = (tweetData.title || "twitter-article")
        .replace(/[/\\?%*:|"<>]/g, "_")
        .slice(0, 30);
      pdf.save(`${safeTitle}.pdf`);
      showToast(`🎉 PDF 导出成功 (共 ${totalPages} 页)！已保存至下载目录`);
    } catch (err: unknown) {
      console.error("PDF generation error:", err);
      alert("生成 PDF 时出错，建议点击旁边的「打印 / 另存为高精 PDF」，已针对分页做防截断优化，排版清晰无截断。");
    } finally {
      if (offscreen) {
        offscreen.remove();
      }
      setGeneratingPdf(false);
      setDownloadProgress("");
    }
  };

  // 2. High-Fidelity Browser Print-to-PDF
  const handlePrint = () => {
    window.print();
  };

  // 3. Export Markdown
  const handleExportMarkdown = () => {
    if (!tweetData) return;
    const frontmatter = `---
title: "${tweetData.title.replace(/"/g, '\\"')}"
author: "${tweetData.author.name} (@${tweetData.author.screen_name})"
date: "${tweetData.createdAt}"
source: "${tweetData.url}"
word_count: ${tweetData.wordCount}
reading_time: "${tweetData.readingTime} min"
---

# ${tweetData.title}

> **作者**：${tweetData.author.name} (@${tweetData.author.screen_name})  
> **原文**：${tweetData.url}  
> **发布日期**：${new Date(tweetData.createdAt).toLocaleString("zh-CN")}

${includeSummaryInPdf && summary ? `> [!NOTE]
> **💡 AI 核心速读 (TL;DR)**：${summary.oneSentence}
> 
> **📌 核心要点**：
${summary.keyTakeaways.map(t => `> - ${t}`).join("\n")}
${summary.goldenQuote ? `>\n> **💬 金句摘录**：_${summary.goldenQuote}_` : ""}${summary.tags && summary.tags.length > 0 ? `\n>\n> **🏷️ 标签**：${summary.tags.map(t => `#${t}`).join(" ")}` : ""}

---

` : ""}${tweetData.coverImage ? `![封面图片](${tweetData.coverImage})\n\n` : ""}${tweetData.text}
`;

    const blob = new Blob([frontmatter], { type: "text/markdown;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = (tweetData.title || "twitter-article")
      .replace(/[/\\?%*:|"<>]/g, "_")
      .slice(0, 30);
    a.href = blobUrl;
    a.download = `${safeTitle}.md`;
    a.click();
    URL.revokeObjectURL(blobUrl);
    showToast("Markdown 文件已成功导出至下载文件夹！");
  };

  // 4. Copy Text
  const handleCopyText = async () => {
    if (!tweetData) return;
    const content = `${tweetData.title}\n作者：${tweetData.author.name} (@${tweetData.author.screen_name})\n原文：${tweetData.url}\n\n${tweetData.text}`;
    try {
      await navigator.clipboard.writeText(content);
      showToast("全文内容已复制到剪贴板！");
    } catch {
      alert("复制失败，请手动选择复制。");
    }
  };

  const showToast = (msg: string) => {
    setCopiedNotification(msg);
    setTimeout(() => {
      setCopiedNotification(null);
    }, 4000);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between relative">
      {/* Background glowing gradients (isolated clipping to prevent root scroll interception) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px] animate-pulse-glow" />
        <div className="absolute top-[20%] right-[-5%] w-[450px] h-[450px] rounded-full bg-sky-600/15 blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[140px]" />
      </div>

      {/* Floating Toast Notification */}
      {copiedNotification && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white text-sm font-medium rounded-xl shadow-2xl shadow-indigo-500/40 border border-indigo-400/30 animate-bounce">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* Sticky Bottom Floating Bar (Appears when reading long articles) */}
      {showFloatingBar && tweetData && (
        <aside aria-label="快捷导出浮动栏" className="no-print fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900/95 text-white rounded-2xl shadow-2xl border border-indigo-500/30 backdrop-blur-lg animate-fade-in max-w-[92vw]">
          <div className="hidden md:flex items-center gap-2 pr-2 border-r border-slate-700 text-xs text-slate-300 max-w-[200px] truncate">
            <span className="font-semibold text-indigo-300 truncate">{tweetData.title}</span>
          </div>

          <button
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
            title="生成并下载 PDF 文件到本地下载目录"
          >
            {generatingPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>{generatingPdf ? "正在导出..." : "下载 PDF"}</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
            title="浏览器原生矢量打印 / 另存为 PDF（防文字截断优化）"
          >
            <Printer className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">另存为 PDF</span>
          </button>

          <button
            onClick={handleScrollToTop}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition cursor-pointer"
            title="返回顶部"
          >
            <ArrowUp className="w-4 h-4" />
          </button>

          <button
            onClick={handleBackToInput}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 rounded-xl text-xs font-medium border border-slate-700 hover:border-rose-500/30 flex items-center gap-1 transition cursor-pointer"
            title="返回输入新链接"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">返回输入</span>
          </button>
        </aside>
      )}

      {/* Header Bar */}
      <header id="page-top" className="no-print border-b border-white/10 bg-[#030712]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div
            onClick={handleBackToInput}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group"
            title="返回首页重新输入"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-sky-500 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg text-white tracking-tight group-hover:text-indigo-200 transition-colors whitespace-nowrap">
                  X to PDF
                </span>
                <span className="hidden sm:inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30 whitespace-nowrap">
                  Article & Tweet
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">推特长文与深度内容排版转 PDF 神器</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {tweetData && (
              <button
                onClick={handleBackToInput}
                className="text-xs text-indigo-300 hover:text-white px-3 py-1.5 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/30 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>返回输入</span>
              </button>
            )}

            <a
              href="https://github.com/alongLFB/media-downloader"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 border border-white/10 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>参考项目</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pt-6 pb-6 sm:pt-7 sm:pb-8 z-10">
        {/* Hero Section */}
        <div id="hero-section" className="no-print text-center mb-8 space-y-3.5 scroll-mt-28">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs font-medium backdrop-blur-sm shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>支持 Twitter Article / Note Tweet / 深度长篇多图推文</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400 tracking-tight">
            将推特长文一键转为优雅的 PDF
          </h1>

          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            告别在推特狭窄信息流与干扰元素中阅读长篇大论。只需粘贴推文或文章链接，秒级提取纯净全文，自动排版为适合阅读、打印与永久归档的电子书格式。
          </p>

          {/* Real-time Website Stats Index */}
          {stats && (
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5 text-xs text-slate-400">
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800/90 backdrop-blur-xs"
                title="全站访客累计次数（会话级真实去重）"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-400">全站访问:</span>
                <span className="font-bold text-slate-200">{stats.visits.toLocaleString()} 次</span>
              </div>
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800/90 backdrop-blur-xs"
                title="全站成功解析转换推文与长文篇数"
              >
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-slate-400">长文转换:</span>
                <span className="font-bold text-slate-200">{stats.conversions.toLocaleString()} 篇</span>
              </div>
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/70 border border-slate-800/90 backdrop-blur-xs"
                title="全站调用 AI 生成速读摘要总次数"
              >
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-slate-400">AI 深度速读:</span>
                <span className="font-bold text-slate-200">{stats.summaries.toLocaleString()} 次</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Box Component */}
        <div className="no-print glass-panel p-2 sm:p-3 rounded-2xl shadow-2xl mb-8 border border-white/10">
          <div className="relative flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleParse()}
                placeholder="粘贴 Twitter/X 链接或文章 ID (例如 https://x.com/justinsuntron/status/2092932777612390850)"
                className="w-full pl-11 pr-20 py-3.5 bg-slate-900/90 text-white placeholder-slate-500 rounded-xl border border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm sm:text-base transition-all"
              />
              <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
                {url && (
                  <button
                    onClick={() => setUrl("")}
                    className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                    title="清空输入框"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={handlePaste}
                  className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition cursor-pointer"
                  title="从剪贴板粘贴"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>粘贴</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => handleParse()}
              disabled={loading}
              className="px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 text-white font-semibold text-sm sm:text-base rounded-xl shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>正在解析长文...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>开始转换</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Demo Pre-sets */}
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 flex items-center gap-1 font-medium">
              <span>快速体验示例：</span>
            </span>
            {DEMO_LINKS.map((demo, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setUrl(demo.url);
                  handleParse(demo.url);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-indigo-300 border border-slate-700/50 hover:border-indigo-500/30 transition-all text-xs cursor-pointer"
              >
                <span>{demo.tag}</span>
                <span className="font-semibold text-slate-200">{demo.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="no-print glass-panel p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 mb-8 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-red-200">解析推文失败</p>
              <p className="text-red-300/90 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => setError("")}
              className="text-red-400 hover:text-red-200 p-1 cursor-pointer"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Parsed Result & Reader Mode */}
        {tweetData && (
          <div className="space-y-6">
            {/* Top Toolbar & Download Actions */}
            <div ref={toolbarRef} className="no-print glass-panel p-5 rounded-2xl border border-indigo-500/30 shadow-2xl space-y-4">
              {/* Return & Meta Status */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleBackToInput}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                    title="返回顶部输入框，可重新输入或清空"
                  >
                    <ArrowLeft className="w-4 h-4 text-indigo-400" />
                    <span>← 返回重新输入</span>
                  </button>

                  <span className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-500/30 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>{tweetData.isArticle ? "Twitter Article 长文" : "推特动态"}</span>
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Type className="w-3.5 h-3.5 text-slate-400" />
                    <span>{tweetData.wordCount} 字</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>约 {tweetData.readingTime} 分钟阅读</span>
                  </span>
                </div>
              </div>

              {/* Main Export Actions Row */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Primary Download PDF button */}
                  <button
                    onClick={handleDownloadPdf}
                    disabled={generatingPdf}
                    className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/30 flex items-center gap-2 transition cursor-pointer"
                    title="生成并直接下载 PDF 文件到本地"
                  >
                    {generatingPdf ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>{generatingPdf ? downloadProgress || "正在导出..." : "📥 一键下载 PDF 文件"}</span>
                  </button>

                  {/* Browser Native Print / Save as PDF */}
                  <button
                    onClick={handlePrint}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl text-sm font-medium border border-slate-700 flex items-center gap-2 transition cursor-pointer"
                    title="调用系统打印机对话框，目标选择「另存为 PDF」可获取超清矢量排版（已优化文字防截断）"
                  >
                    <Printer className="w-4 h-4 text-sky-400" />
                    <span>🖨️ 打印 / 另存为高精 PDF</span>
                  </button>

                  {/* Export Markdown */}
                  <button
                    onClick={handleExportMarkdown}
                    className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs sm:text-sm font-medium border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                    title="导出为 Markdown (.md) 格式供 Notion / Obsidian 使用"
                  >
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <span>导出 Markdown</span>
                  </button>

                  {/* Copy Text */}
                  <button
                    onClick={handleCopyText}
                    className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs sm:text-sm font-medium border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                    title="复制纯文本内容到剪贴板"
                  >
                    <Copy className="w-4 h-4 text-amber-400" />
                    <span>复制全文</span>
                  </button>

                  {/* AI Summary Quick Trigger / Scroll Button */}
                  <button
                    onClick={() => {
                      if (!summary) {
                        handleGenerateSummary(false);
                      } else {
                        document.getElementById("ai-summary-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
                    }}
                    disabled={loadingSummary}
                    className="px-3.5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md shadow-purple-500/20 flex items-center gap-1.5 transition cursor-pointer"
                    title={summary ? "跳转查看 AI 速读总结" : "一键由 AI 分析提炼核心要点与 TL;DR 速读"}
                  >
                    {loadingSummary ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-200" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-amber-300" />
                    )}
                    <span>{loadingSummary ? "AI 正在分析..." : summary ? "查看 AI 速读" : "✨ AI 智能速读"}</span>
                  </button>
                </div>

                <a
                  href={tweetData.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition"
                  title="在 X 打开原文"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                  <span>在 X 打开原文</span>
                </a>
              </div>

              {/* Download destination hint */}
              <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800/80">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>
                  点击「一键下载 PDF」将生成并保存 <strong>{tweetData.title}.pdf</strong> 到浏览器的默认<strong>「下载」</strong>文件夹；点击「打印 / 另存为高精 PDF」已配置 <strong>break-inside: avoid</strong> 防截断保护。
                </span>
              </div>

              {/* Reader Preferences Bar */}
              <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Theme Switcher */}
                  <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                    <span className="text-slate-500 px-2">背景:</span>
                    <button
                      onClick={() => setReaderTheme("light")}
                      className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                        readerTheme === "light"
                          ? "bg-white text-slate-900 font-semibold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      明亮白
                    </button>
                    <button
                      onClick={() => setReaderTheme("sepia")}
                      className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                        readerTheme === "sepia"
                          ? "bg-[#fbf0d9] text-[#5f4b32] font-semibold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      羊皮纸
                    </button>
                    <button
                      onClick={() => setReaderTheme("dark")}
                      className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                        readerTheme === "dark"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      深邃黑
                    </button>
                  </div>

                  {/* Font Size Toggle */}
                  <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                    <span className="text-slate-500 px-2">字号:</span>
                    {(["sm", "base", "lg"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setFontSize(s)}
                        className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                          fontSize === s
                            ? "bg-indigo-600 text-white font-semibold"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {s === "sm" ? "小" : s === "base" ? "标准" : "大"}
                      </button>
                    ))}
                  </div>

                  {/* Font Family Toggle */}
                  <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                    <span className="text-slate-500 px-2">字体:</span>
                    <button
                      onClick={() => setFontFamily("sans")}
                      className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                        fontFamily === "sans"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      现代无衬线
                    </button>
                    <button
                      onClick={() => setFontFamily("serif")}
                      className={`px-2.5 py-1 rounded text-xs font-serif transition cursor-pointer ${
                        fontFamily === "serif"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      宋体衬线
                    </button>
                  </div>

                  {/* Paper Size */}
                  <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                    <span className="text-slate-500 px-2">纸张:</span>
                    <button
                      onClick={() => setPageSize("a4")}
                      className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                        pageSize === "a4"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      A4
                    </button>
                    <button
                      onClick={() => setPageSize("letter")}
                      className={`px-2.5 py-1 rounded text-xs transition cursor-pointer ${
                        pageSize === "letter"
                          ? "bg-indigo-600 text-white font-semibold"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Letter
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Toggle Cover */}
                  {tweetData.coverImage && (
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showCover}
                        onChange={(e) => setShowCover(e.target.checked)}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-900"
                      />
                      <span>包含封面</span>
                    </label>
                  )}

                  {/* Toggle Stats */}
                  <label
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                    title="在正文顶部显示/隐藏推文的点赞、转推、书签与阅读量等社交媒体热度数据"
                  >
                    <input
                      type="checkbox"
                      checked={showStats}
                      onChange={(e) => setShowStats(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-900"
                    />
                    <span>保留社交热度指标</span>
                  </label>

                  {/* Toggle Include AI Summary */}
                  {summary && (
                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-indigo-300 font-medium">
                      <input
                        type="checkbox"
                        checked={includeSummaryInPdf}
                        onChange={(e) => setIncludeSummaryInPdf(e.target.checked)}
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-900"
                      />
                      <span>包含 AI 总结</span>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Printable Document Article Container */}
            <div
              ref={articleRef}
              className={`printable-container rounded-2xl shadow-2xl p-6 sm:p-12 transition-colors duration-200 ${
                readerTheme === "light"
                  ? "theme-light border border-slate-200"
                  : readerTheme === "sepia"
                  ? "theme-sepia border border-[#e6d8be]"
                  : "theme-dark border border-white/10"
              } ${fontFamily === "serif" ? "font-serif" : "font-sans"}`}
            >
              {/* Document Header */}
              <div className="border-b border-black/10 dark:border-white/10 pb-6 mb-8 print-avoid-break">
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-4 leading-snug">
                  {tweetData.title}
                </h1>

                {/* Author Card & Meta */}
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm opacity-90">
                  <div className="flex items-center gap-3">
                    {tweetData.author.avatar_url && (
                      <img
                        src={`/api/proxy-image?url=${encodeURIComponent(tweetData.author.avatar_url)}`}
                        alt={tweetData.author.name}
                        className="w-12 h-12 rounded-full ring-2 ring-indigo-500/30 object-cover"
                        crossOrigin="anonymous"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span>{tweetData.author.name}</span>
                        {tweetData.author.verified && (
                          <ShieldCheck className="w-4 h-4 text-sky-500 fill-sky-500/20" />
                        )}
                      </div>
                      <div className="text-xs opacity-75">
                        @{tweetData.author.screen_name}
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-xs opacity-75 space-y-1">
                    <div>
                      发布时间：{new Date(tweetData.createdAt).toLocaleDateString("zh-CN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div>
                      字数：{tweetData.wordCount} 字 · 预计阅读 {tweetData.readingTime} 分钟
                    </div>
                  </div>
                </div>

                {/* Interactive Stats Badge */}
                {showStats && (
                  <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/5 flex flex-wrap items-center gap-4 text-xs opacity-80 print-hidden">
                    <span className="flex items-center gap-1 text-rose-500 font-medium">
                      <Heart className="w-3.5 h-3.5 fill-rose-500/20" />
                      <span>{tweetData.stats.likes.toLocaleString()} 点赞</span>
                    </span>
                    <span className="flex items-center gap-1 text-emerald-500 font-medium">
                      <Repeat className="w-3.5 h-3.5" />
                      <span>{tweetData.stats.retweets.toLocaleString()} 转推</span>
                    </span>
                    <span className="flex items-center gap-1 text-indigo-500 font-medium">
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>{tweetData.stats.bookmarks.toLocaleString()} 书签</span>
                    </span>
                    {tweetData.stats.views && (
                      <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                        <Eye className="w-3.5 h-3.5" />
                        <span>{tweetData.stats.views.toLocaleString()} 阅读量</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* AI Article Summary Card */}
              {(() => {
                const isLight = readerTheme === "light";
                const isSepia = readerTheme === "sepia";

                if (summary) {
                  return (
                    <div
                      id="ai-summary-card"
                      className={`mb-8 rounded-2xl border transition-all duration-200 article-block-item print-avoid-break overflow-hidden ${
                        !includeSummaryInPdf ? "print:hidden" : ""
                      } ${
                        isLight
                          ? "bg-slate-50/90 border-slate-200/90 shadow-sm text-slate-800"
                          : isSepia
                          ? "bg-[#f5ebd9] border-[#dfcfba] shadow-sm text-[#3b2716]"
                          : "bg-slate-900/90 border-indigo-500/30 shadow-lg text-slate-200"
                      }`}
                    >
                      {/* Card Header */}
                      <div
                        className={`p-4 sm:p-5 pb-3 border-b flex items-center justify-between gap-3 ${
                          isLight
                            ? "border-slate-200/80"
                            : isSepia
                            ? "border-[#dfcfba]"
                            : "border-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-sm ${
                              isLight
                                ? "bg-indigo-600 text-white"
                                : isSepia
                                ? "bg-[#7c5328] text-[#fef9f0]"
                                : "bg-indigo-600 text-white"
                            }`}
                          >
                            <Sparkles className="w-4 h-4 text-amber-300" />
                          </div>
                          <span
                            className={`font-bold text-sm sm:text-base tracking-tight ${
                              isLight
                                ? "text-slate-900"
                                : isSepia
                                ? "text-[#3b2716]"
                                : "text-white"
                            }`}
                          >
                            AI 智能速读 · 核心提炼 (TL;DR)
                          </span>
                          {(summary.model || summary.provider) && (
                            <span
                              className={`text-[10px] sm:text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                                isLight
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  : isSepia
                                  ? "bg-[#ebdec9] text-[#5c3c1e] border-[#d6c2a5]"
                                  : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                              }`}
                            >
                              {summary.model || summary.provider}
                            </span>
                          )}
                        </div>

                        <div className="no-print flex items-center gap-1.5">
                          {/* Copy Summary for Quick Social Share */}
                          <button
                            onClick={handleCopySummary}
                            className={`px-2 py-1 rounded-lg transition cursor-pointer text-xs flex items-center gap-1 font-medium ${
                              copiedSummary
                                ? "text-emerald-700 bg-emerald-50 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-500/40"
                                : isLight
                                ? "text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200"
                                : isSepia
                                ? "text-[#5c3c1e] bg-[#ebdec9] hover:bg-[#dfcfba] border border-[#d6c2a5]"
                                : "text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30"
                            }`}
                            title="一键复制 AI 提炼文案，便于直接粘贴分享给微信/社交好友"
                          >
                            {copiedSummary ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedSummary ? "已复制" : "复制总结"}</span>
                          </button>

                          <button
                            onClick={() => handleGenerateSummary(true)}
                            disabled={loadingSummary || summaryCooldown > 0}
                            className={`p-1.5 rounded-lg transition cursor-pointer text-xs flex items-center gap-1 ${
                              summaryCooldown > 0 ? "opacity-60 cursor-not-allowed" : ""
                            } ${
                              isLight
                                ? "text-slate-600 hover:text-indigo-600 hover:bg-slate-200/60"
                                : isSepia
                                ? "text-[#6e5033] hover:text-[#2d1b0c] hover:bg-[#ebdeca]"
                                : "text-slate-400 hover:text-white hover:bg-white/10"
                            }`}
                            title={summaryCooldown > 0 ? `冷却中 (${summaryCooldown}s)` : "重新调用 AI 生成新的速读摘要"}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingSummary ? "animate-spin text-indigo-500" : ""}`} />
                            <span className="hidden sm:inline font-medium">
                              {loadingSummary ? "生成中..." : summaryCooldown > 0 ? `冷却中 (${summaryCooldown}s)` : "重新生成"}
                            </span>
                          </button>
                          <button
                            onClick={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              isLight
                                ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                                : isSepia
                                ? "text-[#6e5033] hover:text-[#2d1b0c] hover:bg-[#ebdeca]"
                                : "text-slate-400 hover:text-white hover:bg-white/10"
                            }`}
                            title={isSummaryCollapsed ? "展开摘要" : "折叠摘要"}
                          >
                            {isSummaryCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Card Body */}
                      {!isSummaryCollapsed && (
                        <div className="p-4 sm:p-5 space-y-4">
                          {/* One Sentence Summary */}
                          <div
                            className={`p-3.5 sm:p-4 rounded-xl border leading-relaxed ${
                              isLight
                                ? "bg-white border-slate-200/90 text-slate-900 shadow-xs"
                                : isSepia
                                ? "bg-[#fcf7ee] border-[#dfcfba] text-[#2d1b0c] shadow-xs"
                                : "bg-slate-950/80 border-indigo-500/25 text-slate-100"
                            }`}
                          >
                            <div
                              className={`text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1 ${
                                isLight
                                  ? "text-indigo-600"
                                  : isSepia
                                  ? "text-[#8c5722]"
                                  : "text-indigo-400"
                              }`}
                            >
                              <span>💡 核心结论</span>
                            </div>
                            <p className="text-sm sm:text-base font-semibold leading-relaxed">
                              {summary.oneSentence}
                            </p>
                          </div>

                          {/* Key Takeaways */}
                          {summary.keyTakeaways && summary.keyTakeaways.length > 0 && (
                            <div className="space-y-2">
                              <div
                                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                                  isLight
                                    ? "text-slate-900"
                                    : isSepia
                                    ? "text-[#3b2716]"
                                    : "text-slate-200"
                                }`}
                              >
                                <span>📌 关键要点提炼</span>
                              </div>
                              <ul className="space-y-2 text-xs sm:text-sm">
                                {summary.keyTakeaways.map((item, idx) => {
                                  const hasEmojiOrBullet = /^[\p{Extended_Pictographic}\u2022\u25CF\u25CB\-\*]/u.test(item.trim());
                                  return (
                                    <li
                                      key={idx}
                                      className={`flex items-start gap-2.5 leading-relaxed font-normal ${
                                        isLight
                                          ? "text-slate-700"
                                          : isSepia
                                          ? "text-[#422e1b]"
                                          : "text-slate-300"
                                      }`}
                                    >
                                      {!hasEmojiOrBullet && (
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${
                                            isLight
                                              ? "bg-indigo-500"
                                              : isSepia
                                              ? "bg-[#8c5722]"
                                              : "bg-indigo-400"
                                          }`}
                                        />
                                      )}
                                      <span className="flex-1">{item}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          {/* Golden Quote */}
                          {summary.goldenQuote && (
                            <div
                              className={`p-3.5 rounded-xl border-l-4 border-t border-r border-b text-xs sm:text-sm ${
                                isLight
                                  ? "bg-white border-l-indigo-500 border-slate-200/90 text-slate-800"
                                  : isSepia
                                  ? "bg-[#fcf7ee] border-l-[#8c5722] border-[#dfcfba] text-[#2d1b0c]"
                                  : "bg-slate-950/60 border-l-indigo-400 border-indigo-500/20 text-slate-200"
                              }`}
                            >
                              <div
                                className={`text-[11px] font-bold not-italic flex items-center gap-1 mb-1 ${
                                  isLight
                                    ? "text-indigo-600"
                                    : isSepia
                                    ? "text-[#8c5722]"
                                    : "text-indigo-400"
                                }`}
                              >
                                <Quote className="w-3.5 h-3.5" />
                                <span>精选金句</span>
                              </div>
                              <p className="leading-relaxed font-medium italic">
                                “{summary.goldenQuote}”
                              </p>
                            </div>
                          )}

                          {/* Tags */}
                          {summary.tags && summary.tags.length > 0 && (
                            <div
                              className={`pt-3 border-t flex flex-wrap items-center gap-1.5 text-xs ${
                                isLight
                                  ? "border-slate-200/80"
                                  : isSepia
                                  ? "border-[#dfcfba]"
                                  : "border-white/10"
                              }`}
                            >
                              <Tag
                                className={`w-3.5 h-3.5 shrink-0 mr-1 ${
                                  isLight
                                    ? "text-indigo-600"
                                    : isSepia
                                    ? "text-[#8c5722]"
                                    : "text-indigo-400"
                                }`}
                              />
                              {summary.tags.map((tag, tIdx) => (
                                <span
                                  key={tIdx}
                                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                                    isLight
                                      ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/80"
                                      : isSepia
                                      ? "bg-[#ebdec9] text-[#5c3c1e] border-[#d6c2a5]"
                                      : "bg-indigo-950/60 text-indigo-300 border-indigo-500/30"
                                  }`}
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Quick Share Action at bottom of summary */}
                          <div
                            className={`no-print pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-xs ${
                              isLight
                                ? "border-slate-200/80 text-slate-600"
                                : isSepia
                                ? "border-[#dfcfba] text-[#6e5033]"
                                : "border-white/10 text-slate-400"
                            }`}
                          >
                            <span className="text-[11px] opacity-80">
                              💡 觉得总结有用？可复制整段提炼文案直接粘贴发给微信或社交好友
                            </span>
                            <button
                              onClick={handleCopySummary}
                              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-xs flex items-center gap-1.5 font-medium shadow-xs ${
                                copiedSummary
                                  ? "text-emerald-700 bg-emerald-50 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-500/40"
                                  : isLight
                                  ? "text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200"
                                  : isSepia
                                  ? "text-[#5c3c1e] bg-[#ebdec9] hover:bg-[#dfcfba] border border-[#d6c2a5]"
                                  : "text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30"
                              }`}
                            >
                              {copiedSummary ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span>{copiedSummary ? "已复制到剪贴板！" : "复制 AI 总结文案"}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                /* Un-summarized prompt card */
                return (
                  <div
                    id="ai-summary-card"
                    className={`no-print mb-8 rounded-2xl border border-dashed transition-all p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                      isLight
                        ? "border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50/70 text-slate-800"
                        : isSepia
                        ? "border-[#cbb294] bg-[#f5ecdd]/60 hover:bg-[#f5ecdd] text-[#3b2716]"
                        : "border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 text-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-md ${
                          isLight
                            ? "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20"
                            : isSepia
                            ? "bg-[#7c5328] shadow-[#7c5328]/20"
                            : "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/20"
                        }`}
                      >
                        <Sparkles className="w-4 h-4 text-amber-300" />
                      </div>
                      <div>
                        <h4
                          className={`text-sm font-bold flex items-center gap-2 ${
                            isLight
                              ? "text-slate-900"
                              : isSepia
                              ? "text-[#3b2716]"
                              : "text-slate-100"
                          }`}
                        >
                          <span>✨ AI 智能速读 · 提取核心长文摘要</span>
                          <span
                            className={`text-[10px] font-normal px-2 py-0.5 rounded-full border ${
                              isLight
                                ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                                : isSepia
                                ? "bg-[#ebdec9] text-[#5c3c1e] border-[#d6c2a5]"
                                : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                            }`}
                          >
                            TL;DR
                          </span>
                        </h4>
                        <p
                          className={`text-xs mt-1 leading-relaxed ${
                            isLight
                              ? "text-slate-600"
                              : isSepia
                              ? "text-[#6e5033]"
                              : "text-slate-400"
                          }`}
                        >
                          一键提炼一句话核心结论、3条关键要点与金句摘录，支持 Google Gemini、OpenAI 与 Claude 模型，可随 PDF 一并导出。
                        </p>
                        {summaryError && (
                          <div className="mt-2 text-xs text-rose-500 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{summaryError}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleGenerateSummary(false)}
                      disabled={loadingSummary}
                      className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
                    >
                      {loadingSummary ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>AI 深度解析中...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>一键提炼全文速读</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })()}

              {/* Cover Image */}
              {showCover && tweetData.coverImage && (
                <div className="mb-8 rounded-xl overflow-hidden shadow-lg border border-black/5 dark:border-white/5 article-block-item print-avoid-break">
                  <img
                    src={`/api/proxy-image?url=${encodeURIComponent(tweetData.coverImage)}`}
                    alt={tweetData.title}
                    className="w-full max-h-[480px] object-cover"
                    crossOrigin="anonymous"
                  />
                </div>
              )}

              {/* Article Content Blocks */}
              <div
                className={`${
                  fontSize === "sm"
                    ? "text-sm leading-relaxed"
                    : fontSize === "lg"
                    ? "text-lg leading-loose"
                    : "text-base leading-relaxed"
                }`}
              >
                {tweetData.blocks.map((block) => {
                  // Inline Image Block
                  if (block.type === "image" || block.imageUrl) {
                    return (
                      <div key={block.key} className="my-6 text-center article-block-item print-avoid-break">
                        <img
                          src={`/api/proxy-image?url=${encodeURIComponent(block.imageUrl || block.text)}`}
                          alt="推文插图"
                          className="rounded-xl border border-black/10 dark:border-white/10 max-h-[500px] w-full object-contain mx-auto shadow-md"
                          crossOrigin="anonymous"
                        />
                        {block.text && block.text !== block.imageUrl && !block.text.startsWith("http") && (
                          <p className="text-xs opacity-70 mt-2 text-center">{block.text}</p>
                        )}
                      </div>
                    );
                  }

                  if (block.type === "divider") {
                    return (
                      <div key={block.key} className="py-4 article-block-item print-avoid-break">
                        <hr className="border-t border-slate-300 dark:border-slate-700" />
                      </div>
                    );
                  }

                  if (block.type === "header-one") {
                    return (
                      <h2
                        key={block.key}
                        className="article-block-item text-xl sm:text-2xl font-bold mt-6 mb-3 print-avoid-break text-indigo-600 dark:text-indigo-400"
                      >
                        {block.text}
                      </h2>
                    );
                  }

                  if (block.type === "header-two") {
                    return (
                      <h3
                        key={block.key}
                        className="article-block-item text-lg sm:text-xl font-semibold mt-5 mb-2 print-avoid-break text-sky-600 dark:text-sky-400"
                      >
                        {block.text}
                      </h3>
                    );
                  }

                  if (block.type === "blockquote") {
                    return (
                      <blockquote
                        key={block.key}
                        className="article-block-item pl-4 py-1 my-3 print-avoid-break border-l-4 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 italic rounded-r-lg"
                      >
                        {block.text}
                      </blockquote>
                    );
                  }

                  // Default unstyled paragraph
                  if (!block.text.trim()) {
                    return <div key={block.key} className="h-2" />;
                  }

                  return (
                    <p
                      key={block.key}
                      className="article-block-item leading-relaxed text-justify mb-4 print:mb-3 print-avoid-break"
                    >
                      {block.text}
                    </p>
                  );
                })}

                {/* Additional Media Photos */}
                {tweetData.photos && tweetData.photos.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 print-avoid-break">
                    {tweetData.photos.map((photo, pIdx) => (
                      <img
                        key={pIdx}
                        src={`/api/proxy-image?url=${encodeURIComponent(photo)}`}
                        alt={`推文配图 ${pIdx + 1}`}
                        className="rounded-xl border border-black/5 dark:border-white/5 object-cover w-full shadow-sm article-block-item print-avoid-break"
                        crossOrigin="anonymous"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Actions Card inside Document */}
              <div className="no-print mt-10 pt-6 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-4 bg-black/5 dark:bg-white/5 p-5 rounded-2xl">
                <div>
                  <h3
                    className={`font-bold text-base mb-1 ${
                      readerTheme === "light"
                        ? "text-slate-900"
                        : readerTheme === "sepia"
                        ? "text-[#433220]"
                        : "text-slate-100"
                    }`}
                  >
                    🎉 文章阅读完毕
                  </h3>
                  <p
                    className={`text-xs ${
                      readerTheme === "light"
                        ? "text-slate-600"
                        : readerTheme === "sepia"
                        ? "text-[#6b5840]"
                        : "text-slate-400"
                    }`}
                  >
                    已提取全部段落与排版，您可以随时导出保存：
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSponsorOpen(true)}
                    className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 rounded-xl text-xs sm:text-sm font-medium border border-rose-500/30 flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                    title="觉得工具好用？赞赏请作者喝杯咖啡"
                  >
                    <Heart className="w-4 h-4 text-rose-400 fill-rose-500/30" />
                    <span>打赏支持</span>
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={generatingPdf}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{generatingPdf ? downloadProgress || "导出中..." : "下载 PDF 文件"}</span>
                  </button>
                  <button
                    onClick={handlePrint}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs sm:text-sm font-medium border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-sky-400" />
                    <span>另存为高精 PDF</span>
                  </button>
                  <button
                    onClick={handleBackToInput}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs sm:text-sm font-medium border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4 text-indigo-400" />
                    <span>返回顶部</span>
                  </button>
                </div>
              </div>

              {/* Document Print Footer */}
              <div className="mt-8 pt-6 border-t border-black/10 dark:border-white/10 text-xs opacity-60 flex flex-wrap items-center justify-between gap-2 print-avoid-break">
                <div>
                  本文档由 <strong>X to PDF</strong> 自动排版生成 · 原文链接：
                  <a href={tweetData.url} className="underline ml-1">
                    {tweetData.url}
                  </a>
                </div>
                <div>导出时间：{new Date().toLocaleDateString("zh-CN")}</div>
              </div>
            </div>
          </div>
        )}

        {/* Recent History Section - Only shown on landing page to keep article reading clean */}
        {!tweetData && mounted && history.length > 0 && (
          <div className="no-print mt-6 glass-panel p-4 sm:p-5 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-white text-sm">最近转换历史</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  说明：历史记录仅保存在您的当前浏览器本地 (localStorage)，服务器不存储任何记录，完全保护隐私。
                </p>
              </div>
              <button
                onClick={clearHistory}
                className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition cursor-pointer px-2.5 py-1 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                title="清除保存在浏览器本地的转换记录"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空本地记录</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setUrl(item.url);
                    handleParse(item.url);
                  }}
                  className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 cursor-pointer transition flex flex-col justify-between group"
                >
                  <div>
                    <h4 className="font-medium text-slate-200 text-sm line-clamp-1 group-hover:text-indigo-300 transition">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      {item.authorName} (@{item.screenName})
                    </p>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-800/50 flex items-center justify-between text-[11px] text-slate-500">
                    <span>本地保存于 {item.convertedAt}</span>
                    <span className="text-indigo-400 group-hover:underline">点击重新载入 →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feature Highlights Grid - Only shown on initial landing to keep article reading clean */}
        {!tweetData && (
          <div className="no-print mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-slate-300">
            <div className="glass-card p-4 sm:p-5 rounded-xl border border-white/5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-2.5">
                <BookOpen className="w-4 h-4" />
              </div>
              <h4 className="font-semibold text-white text-sm mb-1">原生支持 Twitter Article</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                支持 Twitter 最新推出的全篇长文格式，自动提取 Draft.js 正文块、章节结构、内嵌插图与封面大图。
              </p>
            </div>

            <div className="glass-card p-4 sm:p-5 rounded-xl border border-white/5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center mb-2.5">
                <Printer className="w-4 h-4" />
              </div>
              <h4 className="font-semibold text-white text-sm mb-1">双模 PDF 极速导出</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                提供轻量分页直接下载与浏览器高精矢量打印（Save as PDF），自动防截字优化，排版工整无孤行。
              </p>
            </div>

            <div className="glass-card p-4 sm:p-5 rounded-xl border border-white/5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2.5">
                <FileCode className="w-4 h-4" />
              </div>
              <h4 className="font-semibold text-white text-sm mb-1">Markdown 与笔记联动</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                支持导出包含 YAML 元数据的 Markdown 文件或一键复制，无缝同步至 Notion、Obsidian、Logseq。
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="no-print border-t border-white/10 py-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <p>© 2026 X to PDF Converter · 专注深度阅读与优质长文归档</p>
        <span className="hidden sm:inline opacity-30">|</span>
        <button
          onClick={() => setSponsorOpen(true)}
          className="text-rose-400/85 hover:text-rose-300 hover:underline flex items-center gap-1 transition cursor-pointer"
        >
          <Heart className="w-3.5 h-3.5 fill-rose-500/30" />
          <span>请作者喝杯咖啡 (微信/支付宝)</span>
        </button>
      </footer>

      {/* Sponsor Modal */}
      <SponsorModal isOpen={sponsorOpen} onClose={() => setSponsorOpen(false)} />
    </div>
  );
}
