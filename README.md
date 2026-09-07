# X to PDF (Twitter 长文与深度推文转 PDF 工具)

一键将 Twitter/X 长篇推文、Twitter Article 文章转换为高质感、排版优美的 PDF 文件。支持沉浸式阅读、高精度矢量打印、Markdown 导出与本地历史记录。

参考项目：[alongLFB/media-downloader](https://github.com/alongLFB/media-downloader) 的界面与交互设计风格。

---

## ✨ 核心特性

- 📄 **原生支持 Twitter Article**：专为 Twitter 最新的 Article / Notes 长文优化，自动解析 Draft.js 富文本结构，提取多达数百段落、章节层级、引用块、内嵌插图及封面配图（如孙宇晨《我的女友景甜》等长文）。
- 📑 **双模 PDF 导出**：
  - **一键直接下载 PDF**：前端通过轻量级智能分页渲染，快速生成带页眉页码的 `.pdf` 离线文件。
  - **浏览器原生矢量打印 (Save as PDF)**：深度调校的 `@media print` 打印引擎，支持 A4 / Letter 页面边距、分页防截断保护（避免图片与段落断层）、无杂质纯白排版、超清可选中文本。
- 📖 **沉浸式阅读器 (Reader Mode)**：
  - 支持 **字号调节**（小 / 标准 / 大）
  - 支持 **字体切换**（现代无衬线 / 文学经典宋体衬线）
  - 支持 **多套背景主题**（明亮白 / 护眼羊皮纸 / 深邃黑）
  - 支持 **封面图** 与 **推文互动数据**（点赞、转推、阅读量）显示开关
- 📝 **Markdown 与纯文本导出**：一键生成包含 YAML Frontmatter 格式的 `.md` 文件或复制纯文本，无缝同步至 Notion、Obsidian、Logseq。
- 🕒 **本地历史记录**：自动保存最近转换过的长文历史（存储在浏览器 localStorage，不上传服务器），点击即重现，无需反复粘贴。
- 🛡️ **CORS 图片反代保护**：内置 `/api/proxy-image` 解决跨域图片在 Canvas 导出时的白屏问题。

---

## 🛠️ 技术栈

- **前端与框架**：Next.js 16 (App Router, Standalone mode), React 19, TypeScript
- **样式方案**：Tailwind CSS v4 (深色星空玻璃拟物风格 + 响应式布局)
- **图标库**：Lucide React
- **PDF 渲染**：jsPDF, html2canvas, Native CSS Print (`@media print`)
- **网络请求**：Axios, Next.js Server Route Handlers

---

## 🚀 部署方式 (SA1 服务器)

### 方式一：Docker Compose 部署 (推荐)

项目已配置好 Next.js `output: "standalone"` 极简多阶构建，Docker 镜像体积仅约 120MB，内存占用低。

```bash
# 1. 运行一键构建并后台启动
docker compose up -d --build

# 2. 查看运行状态
docker compose ps

# 3. 查看容器日志
docker compose logs -f
```

容器会自动在本地监听 `127.0.0.1:3000`，由 Nginx 负责外网反向代理与 HTTPS 加密。

---

### 方式二：Nginx 反向代理与 SSL 配置

1. **复制配置文件**：
   将项目中的 `nginx/twitter-to-pdf.conf` 复制到系统的 Nginx 配置目录（已预置 `x2pdf.alonglfb.com` 与 `xtopdf.alonglfb.com` 转发至 `3032` 端口）：
   ```bash
   sudo cp nginx/twitter-to-pdf.conf /etc/nginx/conf.d/twitter-to-pdf.conf
   ```

2. **一键申请双域名免费 SSL 证书 (Certbot)**：
   ```bash
   # 测试 Nginx 语法
   sudo nginx -t

   # 一键申请双域名 SAN 证书并自动完成 SSL 配置
   sudo certbot --nginx -d x2pdf.alonglfb.com -d xtopdf.alonglfb.com

   # 热重载 Nginx
   sudo systemctl reload nginx
   ```

---

### 方式三：本地开发模式

```bash
# 安装依赖
npm install

# 启动开发服务器（支持热重载）
npm run dev

# 访问开发页面
# http://localhost:3000
```

---

## 💡 使用指南

1. **输入链接**：在主页输入框中粘贴任何推文或文章链接，例如：
   ```text
   https://x.com/justinsuntron/status/2092932777612390850?s=20
   ```
   也可以直接点击输入框下方的预设快捷体验标签（如「🔥 孙宇晨长文《我的女友景甜》」）。
2. **开始转换**：点击「开始转换」或按回车键，系统将秒级解析文章全部章节与段落。
3. **调整偏好**：
   - 切换字号、背景（明亮白 / 羊皮纸 / 深邃黑）、字体样式。
   - 勾选或取消「包含封面」、「显示互动数据」。
4. **导出文件**：
   - 点击 **下载 PDF 文件** 即可生成并保存 `.pdf`。
   - 点击 **打印 / 另存为高精 PDF** 可调用系统打印机直接另存为高清晰度矢量 PDF。
   - 点击 **Markdown** 导出笔记文档。

---

## 📁 目录结构

```text
twitter-to-pdf/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── parse/
│   │   │   │   └── route.ts        # Twitter推文/长文服务端解析接口
│   │   │   └── proxy-image/
│   │   │       └── route.ts        # 跨域图片反代安全接口
│   │   ├── favicon.ico
│   │   ├── globals.css             # Tailwind v4、玻璃态动画与Print打印样式表
│   │   ├── layout.tsx              # 根布局与元数据配置
│   │   └── page.tsx                # 主页面 (搜索栏、阅读器、导出栏、历史记录)
│   └── types/
│       └── tweet.ts                # 推文、文章块与API响应类型定义
├── nginx/
│   └── twitter-to-pdf.conf         # 生产级 Nginx 反代与 SSL 配置模板
├── Dockerfile                      # Next.js Standalone 极简多阶镜像构建文件
├── docker-compose.yml              # Docker 编排配置
├── deploy.sh                       # SA1 服务器一键部署脚本
├── .dockerignore
├── package.json
├── tsconfig.json
└── README.md
```
