#!/usr/bin/env bash
set -euo pipefail

# ── 颜色定义 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ── 配置（按需修改） ──
DOMAIN="wereadwork.site"
APP_DIR="/var/www/wereadwork"
APP_PORT=3456
NODE_VERSION="18"

# .env 配置
WEREAD_API_KEY="${WEREAD_API_KEY:-wrk-mR0uDPHsTYKSkYXD4a4dnAAA}"
LLM_EMBEDDING_BASE_URL="${LLM_EMBEDDING_BASE_URL:-https://api.siliconflow.cn/v1}"
LLM_EMBEDDING_API_KEY="${LLM_EMBEDDING_API_KEY:-sk-zhkqicohmkkukpzinwvfqdmtkcgdnwcqdywfvsuhltpmbaqs}"
LLM_EMBEDDING_MODEL="${LLM_EMBEDDING_MODEL:-BAAI/bge-large-zh-v1.5}"
LLM_CHAT_BASE_URL="${LLM_CHAT_BASE_URL:-https://token-plan-cn.xiaomimimo.com/v1}"
LLM_CHAT_API_KEY="${LLM_CHAT_API_KEY:-tp-c61bic2mjub82xdrj5do6paofjwp7bfr0jkzui0lcuvnhz25}"
LLM_CHAT_MODEL="${LLM_CHAT_MODEL:-mimo-v2.5-pro}"

# ── 前置检查 ──
info "检查运行环境..."

REAL_USER="${SUDO_USER:-$USER}"
if [ "$(id -u)" -eq 0 ] && [ -z "$SUDO_USER" ]; then
  fail "请用普通用户 + sudo 运行此脚本，例如: sudo bash deploy.sh"
fi

if ! command -v sudo &>/dev/null; then
  fail "需要 sudo 权限，请先安装 sudo"
fi

# 检测系统
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  OS_VERSION=$VERSION_ID
  info "检测到系统: $PRETTY_NAME"
else
  fail "无法检测操作系统，仅支持 Ubuntu/Debian"
fi

if [[ "$OS" != "ubuntu" && "$OS" != "debian" ]]; then
  warn "当前系统为 $OS，脚本针对 Ubuntu/Debian 优化，其他系统可能需要手动调整"
fi

# ── 询问 GitHub 仓库地址 ──
if [ -z "${GIT_REPO:-}" ]; then
  echo ""
  echo -e "${CYAN}请输入你的 GitHub 仓库地址（HTTPS 格式）:${NC}"
  echo -e "${CYAN}例如: https://github.com/username/repo.git${NC}"
  read -rp "> " GIT_REPO
fi

if [ -z "$GIT_REPO" ]; then
  fail "仓库地址不能为空"
fi

# 询问项目子目录（如果代码在仓库根目录直接回车）
if [ -z "${PROJECT_SUBDIR:-}" ]; then
  echo ""
  echo -e "${CYAN}项目代码在仓库的哪个目录？（如果在根目录直接回车）${NC}"
  echo -e "${CYAN}例如: we${NC}"
  read -rp "> " PROJECT_SUBDIR
fi

PROJECT_SUBDIR="${PROJECT_SUBDIR:-.}"

echo ""
echo "════════════════════════════════════════════════════"
echo "  部署配置确认"
echo "════════════════════════════════════════════════════"
echo "  域名:      $DOMAIN"
echo "  仓库:      $GIT_REPO"
echo "  子目录:    $PROJECT_SUBDIR"
echo "  安装目录:  $APP_DIR"
echo "  应用端口:  $APP_PORT"
echo "════════════════════════════════════════════════════"
echo ""
read -rp "确认开始部署？(y/N) " CONFIRM
if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
  echo "已取消"
  exit 0
fi

# ── 1. 系统更新 & 安装基础软件 ──
info "更新系统软件包..."
sudo apt update -y && sudo apt upgrade -y
ok "系统已更新"

info "安装基础软件 (git, curl, nginx)..."
sudo apt install -y git curl nginx
ok "基础软件安装完成"

# ── 2. 安装 Node.js ──
if command -v node &>/dev/null; then
  CURRENT_NODE=$(node -v | tr -d 'v' | cut -d. -f1)
  if [ "$CURRENT_NODE" -ge "$NODE_VERSION" ]; then
    ok "Node.js 已安装: $(node -v)"
  else
    warn "Node.js 版本过低 ($(node -v))，正在升级..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
    sudo apt install -y nodejs
    ok "Node.js 已升级: $(node -v)"
  fi
else
  info "安装 Node.js ${NODE_VERSION}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
  sudo apt install -y nodejs
  ok "Node.js 已安装: $(node -v)"
fi

# ── 3. 安装 PM2 ──
if command -v pm2 &>/dev/null; then
  ok "PM2 已安装"
else
  info "安装 PM2..."
  sudo npm install -g pm2
  ok "PM2 已安装"
fi

# ── 4. 克隆代码 ──
info "部署代码..."
sudo mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR" ]; then
  warn "目录 $APP_DIR 已存在，更新代码..."
  cd "$APP_DIR"
  git pull origin main || git pull
else
  git clone "$GIT_REPO" "$APP_DIR"
  cd "$APP_DIR"
fi
ok "代码已部署到 $APP_DIR"

# ── 5. 进入项目目录 & 安装依赖 ──
if [ "$PROJECT_SUBDIR" != "." ]; then
  if [ -d "$PROJECT_SUBDIR" ]; then
    cd "$PROJECT_SUBDIR"
    info "进入子目录: $PROJECT_SUBDIR"
  else
    fail "子目录 $PROJECT_SUBDIR 不存在"
  fi
fi

info "安装 Node.js 依赖..."
npm install --production
ok "依赖安装完成"

# ── 6. 创建 .env 文件 ──
info "创建 .env 配置文件..."
cat > .env << EOF
WEREAD_API_KEY=$WEREAD_API_KEY

LLM_EMBEDDING_BASE_URL=$LLM_EMBEDDING_BASE_URL
LLM_EMBEDDING_API_KEY=$LLM_EMBEDDING_API_KEY
LLM_EMBEDDING_MODEL=$LLM_EMBEDDING_MODEL

LLM_CHAT_BASE_URL=$LLM_CHAT_BASE_URL
LLM_CHAT_API_KEY=$LLM_CHAT_API_KEY
LLM_CHAT_MODEL=$LLM_CHAT_MODEL
EOF

chmod 600 .env
ok ".env 文件已创建（权限已设为 600）"

# ── 7. 创建数据目录 ──
mkdir -p data
ok "数据目录已创建"

# ── 8. PM2 启动应用 ──
WORK_DIR=$(pwd)
info "使用 PM2 启动应用 (工作目录: $WORK_DIR)..."

# 停止旧进程（如果存在）
pm2 delete wereadwork 2>/dev/null || true

# 创建 PM2 生态配置
cat > ecosystem.config.cjs << EOF
module.exports = {
  apps: [{
    name: 'wereadwork',
    script: 'server.js',
    cwd: '$WORK_DIR',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: $APP_PORT
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true
  }]
};
EOF

mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save

# 设置开机自启
STARTUP_CMD=$(pm2 startup 2>&1 | grep 'sudo' | tail -1)
if [ -n "$STARTUP_CMD" ]; then
  info "设置开机自启..."
  eval "$STARTUP_CMD" 2>/dev/null || warn "开机自启设置可能需要手动执行: $STARTUP_CMD"
fi

ok "应用已启动"
pm2 status

# ── 9. 配置 Nginx ──
info "配置 Nginx 反向代理..."

sudo tee /etc/nginx/sites-available/wereadwork > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
        proxy_connect_timeout 30s;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:$APP_PORT;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# 启用站点
sudo ln -sf /etc/nginx/sites-available/wereadwork /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null

# 测试配置
if sudo nginx -t 2>&1; then
  sudo systemctl reload nginx
  ok "Nginx 配置完成"
else
  fail "Nginx 配置有误，请检查 /etc/nginx/sites-available/wereadwork"
fi

# ── 10. 配置防火墙 ──
if command -v ufw &>/dev/null; then
  info "配置防火墙..."
  sudo ufw allow 22/tcp   2>/dev/null || true
  sudo ufw allow 80/tcp   2>/dev/null || true
  sudo ufw allow 443/tcp  2>/dev/null || true
  sudo ufw --force enable 2>/dev/null || true
  ok "防火墙已配置"
fi

# ── 11. 申请 SSL 证书 ──
echo ""
info "正在申请 HTTPS 证书 (Let's Encrypt)..."
echo ""

if sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --redirect 2>&1; then
  ok "HTTPS 证书已配置！"

  # 设置自动续期
  sudo systemctl enable certbot.timer 2>/dev/null || true
  ok "证书自动续期已启用"
else
  warn "HTTPS 证书申请失败（可能是 DNS 还未生效）"
  warn "DNS 生效后手动执行: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# ── 12. 更新 PM2 重启脚本路径 ──
pm2 save

# ── 完成 ──
echo ""
echo "════════════════════════════════════════════════════"
echo ""
ok "部署完成！"
echo ""
echo "  网站地址:  https://$DOMAIN"
echo "  应用端口:  $APP_PORT"
echo "  代码目录:  $WORK_DIR"
echo "  日志目录:  $WORK_DIR/logs"
echo ""
echo "  常用命令:"
echo "    pm2 status              查看应用状态"
echo "    pm2 logs wereadwork     查看日志"
echo "    pm2 restart wereadwork  重启应用"
echo "    pm2 stop wereadwork     停止应用"
echo ""
echo "  更新代码:"
echo "    cd $WORK_DIR"
echo "    git pull && npm install --production && pm2 restart wereadwork"
echo ""
echo "════════════════════════════════════════════════════"
