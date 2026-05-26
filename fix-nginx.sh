#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] 修复 nginx.conf gzip 配置..."

# 备份
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak

# 删除所有之前错误添加的 gzip 行
sed -i '/gzip_types/d' /etc/nginx/nginx.conf
sed -i '/gzip_min_length/d' /etc/nginx/nginx.conf

# 在 gzip on; 后面正确添加
sed -i '/^[[:space:]]*gzip on;/a\    gzip_types text/css application/javascript text/javascript;\n    gzip_min_length 1024;' /etc/nginx/nginx.conf

echo "[2/3] 写入站点配置..."
cat > /etc/nginx/sites-available/wereadwork << 'NGINXEOF'
server {
    listen 80;
    server_name wereadwork.site www.wereadwork.site 43.132.227.67;
    root /var/www/wereadwork;
    index index.html;

    location /vendor/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /src/ {
        expires 1d;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

echo "[3/3] 测试并重载 nginx..."
nginx -t && systemctl reload nginx

echo "[OK] 修复完成！"
