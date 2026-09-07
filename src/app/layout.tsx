import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Twitter/X 文章与长文转 PDF | Tweet & Article to PDF",
  description: "一键将 Twitter/X 长篇推文、Twitter Article 文章转换为高质感、排版优美的 PDF 文件，支持浏览器高精度打印、Markdown 导出与沉浸式阅读模式。",
  keywords: ["Twitter to PDF", "X to PDF", "推特转PDF", "Twitter长文导出", "推特文章下载", "X Article"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-[#030712] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}
