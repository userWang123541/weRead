# 微读 Read (wereadwork.site) 完整部署指南

> 基于 2026 年 5 月实际部署过程整理，记录了从零到上线的全部步骤。

---

## 项目概况

- **项目名称**：微读 Read（微信读书笔记管理工作台）
- **技术栈**：Node.js + Express + Vue 3 + Element Plus（CDN 加载）
- **线上地址**：https://wereadwork.site
- **代码仓库**：https://github.com/userWang123541/weRead.git
- **服务器**：腾讯云轻量应用服务器（中国香港，Ubuntu 22.04，2核2G）
- **公网 IP**：43.132.227.67

---

## 部署架构

```
用户浏览器
    ↓
Nginx (80/443 端口，反向代理)
    ↓
Node.js Express (PM2 进程守护，端口 3456)
    ↓
文件存储 (data/ 目录)
    ↓
外部 API（微信读书、SiliconFlow Embedding、小米 MiMo LLM）
```

---

## 一、购买服务器

### 1.1 选择平台

推荐腾讯云或阿里云，购买**轻量应用服务器**。

### 1.2 推荐配置

| 项目 | 选择 |
|---|---|
| 实例类型 | 通用型 |
| CPU/内存 | 2核 2G |
| 系统镜像 | Ubuntu 22.04 LTS |
| 地域 | 中国香港（免备案，买了立刻能用） |
| 付费方式 | 月付试水，满意后年付更划算 |

> **重要提示**：如果选中国大陆地域（上海/北京/广州），域名必须完成 ICP 备案（需 1-2 周），否则无法访问。选香港地域免备案。

### 1.3 购买时的登录方式

选择**自定义密码**，设一个记得住的密码。

---

## 二、配置域名 DNS

### 2.1 购买域名

在腾讯云/阿里云购买域名（本项目使用 `wereadwork.site`）。

### 2.2 添加 DNS 解析记录

以腾讯云为例：

1. 打开 https://console.dnspod.cn/dns/record
2. 找到你的域名，点击进入
3. 点击**添加记录**，添加两条：

| 类型 | 主机记录 | 记录值 |
|---|---|---|
| A | @ | 你的服务器公网 IP |
| A | www | 你的服务器公网 IP |

4. 保存后等待 5-10 分钟 DNS 生效

---

## 三、服务器初始化

### 3.1 SSH 登录服务器

```bash
ssh ubuntu@你的公网IP
```

> 如果是腾讯云 Ubuntu 镜像，默认用户名是 `ubuntu`，不是 `root`。

### 3.2 安装基础软件

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx
```

### 3.3 安装 Node.js 18

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3.4 安装 PM2（进程守护）

```bash
sudo npm install -g pm2
```

---

## 四、部署代码

### 4.1 克隆代码

```bash
sudo mkdir -p /var/www/wereadwork
sudo git clone https://github.com/userWang123541/weRead.git /var/www/wereadwork
cd /var/www/wereadwork
```

> 注意：代码在仓库根目录，不在 `we` 子目录里。

### 4.2 安装依赖

```bash
sudo npm install --production
```

### 4.3 创建 .env 配置文件

```bash
sudo tee .env > /dev/null << 'EOF'
WEREAD_API_KEY=你的微信读书API密钥

LLM_EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1
LLM_EMBEDDING_API_KEY=你的SiliconFlow密钥
LLM_EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5

LLM_CHAT_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
LLM_CHAT_API_KEY=你的小米MiMo密钥
LLM_CHAT_MODEL=mimo-v2.5-pro
EOF
```

### 4.4 创建数据目录

```bash
sudo mkdir -p data logs
```

### 4.5 用 PM2 启动应用

```bash
cd /var/www/wereadwork
sudo pm2 start server.js --name wereadwork
sudo pm2 save
sudo pm2 startup
```

### 4.6 验证应用运行

```bash
curl -s http://localhost:3456 | head -5
```

如果看到 `<!DOCTYPE html>` 说明应用正常。

---

## 五、配置 Nginx 反向代理

### 5.1 创建 Nginx 配置

```bash
sudo tee /etc/nginx/sites-available/wereadwork > /dev/null << 'EOF'
server {
    listen 80;
    server_name wereadwork.site www.wereadwork.site 43.132.227.67;
    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF
```

### 5.2 启用配置

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/wereadwork /etc/nginx/sites-enabled/
sudo nginx -t
```

看到 `test is successful` 后：

```bash
sudo systemctl reload nginx
```

### 5.3 验证

```bash
curl -s -I http://localhost
```

应返回 `HTTP/1.1 200 OK` 和 `X-Powered-By: Express`。

---

## 六、配置防火墙

### 6.1 服务器内部防火墙

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

### 6.2 腾讯云控制台防火墙

1. 轻量应用服务器 → 防火墙
2. 添加规则：放行 TCP **80** 端口
3. 添加规则：放行 TCP **443** 端口

> 两处防火墙都要开放，缺一不可。

---

## 七、配置 HTTPS（可选但推荐）

### 7.1 安装 Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 7.2 申请 SSL 证书

```bash
sudo certbot --nginx -d wereadwork.site -d www.wereadwork.site --non-interactive --agree-tos --email admin@wereadwork.site
```

### 7.3 自动续期

```bash
sudo systemctl enable certbot.timer
```

证书 90 天自动续期。

---

## 八、一键部署脚本

项目根目录的 `deploy.sh` 是一键部署脚本，新服务器上执行：

```bash
curl -fsSL "https://raw.githubusercontent.com/userWang123541/weRead/main/deploy.sh?$(date +%s)" -o deploy.sh && sudo bash deploy.sh
```

脚本会自动完成上述所有步骤。运行过程中需要输入：
- GitHub 仓库地址：`https://github.com/userWang123541/weRead.git`
- 项目子目录：直接回车（代码在根目录）

### 已知问题

- GitHub raw 文件可能有 CDN 缓存，用 `?$(date +%s)` 参数绕过
- 脚本中 `sudo bash` 运行时的 root 用户检查需要移除
- Ubuntu 镜像默认用户是 `ubuntu` 不是 `root`

---

## 九、后续更新代码

每次修改代码推到 GitHub 后，在服务器上执行：

```bash
cd /var/www/wereadwork
sudo git pull
sudo npm install --production
sudo pm2 restart wereadwork
```

---

## 十、常用运维命令

| 命令 | 说明 |
|---|---|
| `sudo pm2 status` | 查看应用状态 |
| `sudo pm2 logs wereadwork` | 查看实时日志 |
| `sudo pm2 restart wereadwork` | 重启应用 |
| `sudo pm2 stop wereadwork` | 停止应用 |
| `sudo systemctl status nginx` | 查看 Nginx 状态 |
| `sudo nginx -t` | 测试 Nginx 配置 |
| `sudo systemctl reload nginx` | 重载 Nginx 配置 |
| `sudo certbot renew` | 手动续期 SSL 证书 |

---

## 十一、踩坑记录

### 11.1 SSH 登录问题

- **现象**：`Permission denied`
- **原因**：腾讯云 Ubuntu 镜像默认用户是 `ubuntu`，不是 `root`
- **解决**：`ssh ubuntu@公网IP`

### 11.2 deploy.sh root 用户检查

- **现象**：`请不要用 root 用户运行此脚本`
- **原因**：`sudo bash deploy.sh` 以 root 身份运行，触发了 root 检查
- **解决**：移除脚本中的 root 用户检查逻辑

### 11.3 GitHub 缓存问题

- **现象**：下载的 deploy.sh 是 HTML 页面或旧版本
- **原因**：GitHub raw CDN 缓存
- **解决**：URL 后加 `?$(date +%s)` 时间戳参数绕过缓存

### 11.4 Nginx 配置写入问题

- **现象**：heredoc (`<< 'EOF'`) 在终端粘贴时命令断开
- **原因**：终端粘贴长命令时格式错乱
- **解决**：用 `echo '...' | sudo tee 文件名` 单行写入，或用 `nano` 编辑器手动编辑

### 11.5 白屏问题

- **现象**：浏览器打开 IP 显示白屏
- **原因**：腾讯云防火墙未放行 80/443 端口
- **解决**：同时在服务器 `ufw` 和腾讯云控制台防火墙两处开放端口

### 11.6 PM2 进程不显示

- **现象**：`pm2 status` 显示空列表
- **原因**：应用以 `sudo`（root）启动，当前 ubuntu 用户的 PM2 daemon 不同
- **解决**：用 `sudo pm2 status` 查看，或用 `sudo pm2 start` 启动

---

## 十二、省钱建议

| 方案 | 说明 |
|---|---|
| 新用户特惠 | 腾讯云/阿里云新用户首购轻量服务器约 50-100 元/年 |
| 年付折扣 | 比月付便宜 3-4 折 |
| 到期换号 | 用家人手机号注册新账号，再买新用户特惠 |
| Oracle Cloud | 永久免费 ARM 服务器（4核24G），但需要信用卡且资源可能抢不到 |
