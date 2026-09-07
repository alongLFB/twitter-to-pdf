#!/usr/bin/env bash

# =========================================================
# Twitter/X to PDF 自动化部署脚本 (SA1 服务器)
# =========================================================

set -e

echo "🚀 开始部署 Twitter/X to PDF 服务..."

# 1. 检查 Docker 环境
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未检测到 Docker，请先安装 Docker: curl -fsSL https://get.docker.com | bash"
    exit 1
fi

# 2. 停止旧容器并重新构建运行
echo "📦 正在使用 Docker Compose 构建轻量化镜像并启动容器..."
docker compose down || true
docker compose up -d --build

# 3. 等待容器就绪
echo "⏳ 等待服务启动中..."
sleep 3

# 4. 检查容器状态
HOST_PORT=${APP_PORT:-3025}
if docker ps | grep -q "twitter-to-pdf"; then
    echo "✅ 容器已成功在后台运行！本地监听端口: 127.0.0.1:$HOST_PORT"
    docker ps --filter "name=twitter-to-pdf" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    if curl -s "http://127.0.0.1:$HOST_PORT/api/health" | grep -q "ok" 2>/dev/null; then
        echo "✅ 健康检查通过: http://127.0.0.1:$HOST_PORT/api/health 响应正常"
    fi
else
    echo "❌ 容器启动异常，请运行 'docker logs twitter-to-pdf' 查看报错日志。"
    exit 1
fi

echo ""
echo "========================================================="
echo "🎉 部署完成！"
echo "接下来请配置 Nginx 反向代理与 SSL 证书："
echo "1. 复制 nginx/twitter-to-pdf.conf 到 /etc/nginx/conf.d/"
echo "2. 将文件中的 your_domain.com 替换为您的域名"
echo "3. 运行: nginx -t && systemctl reload nginx"
echo "4. 使用 Certbot 获取免费 SSL: certbot --nginx -d your_domain.com"
echo "========================================================="
