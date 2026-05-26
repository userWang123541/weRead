#!/usr/bin/env bash
set -euo pipefail

echo "[1/2] 修复 nginx.conf gzip 配置..."
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
sed -i '/gzip_types/d' /etc/nginx/nginx.conf
sed -i '/gzip_min_length/d' /etc/nginx/nginx.conf
sed -i '/^[[:space:]]*gzip on;/a\    gzip_types text/css application/javascript text/javascript application/json;\n    gzip_min_length 1024;\n    gzip_comp_level 6;' /etc/nginx/nginx.conf

echo "[2/2] 写入站点配置..."
cat > /etc/nginx/sites-available/wereadwork << 'NGINXEOF'
server {
    listen 80;
    server_name wereadwork.site www.wereadwork.site 43.132.227.67;

    gzip on;
    gzip_types text/css application/javascript text/javascript application/json;
    gzip_min_length 1024;
    gzip_comp_level 6;

    root /var/www/wereadwork;
    index index.html;

    location /vendor/ {
        alias /var/www/wereadwork/vendor/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location /src/ {
        alias /var/www/wereadwork/src/;
        expires 1d;
        try_files $uri =404;
    }

    location /favicon.svg {
        alias /var/www/wereadwork/favicon.svg;
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

echo "测试 nginx 配置..."
nginx -t

echo "重载 nginx..."
systemctl reload nginx

echo ""
echo "[OK] 修复完成！"
echo "静态文件由 Nginx 直接服务，API 转发给 Node.js"
