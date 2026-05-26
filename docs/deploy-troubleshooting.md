# 微读 Read 线上部署问题排查与修复记录

> 记录 2026 年 5 月 26 日实际部署过程中遇到的所有问题及解决方案。

---

## 项目部署信息

| 项目 | 值 |
|---|---|
| 域名 | wereadwork.site |
| 服务器 | 腾讯云轻量应用服务器（中国香港，Ubuntu 22.04，2核2G，2Mbps） |
| 公网 IP | 43.132.227.67 |
| 代码目录 | /var/www/wereadwork |
| 应用端口 | 3456 (Node.js Express) |
| 进程管理 | PM2 |
| 反向代理 | Nginx |

---

## 问题一：SSH 连接失败（Connection timed out / Permission denied）

### 现象

- `ssh ubuntu@43.132.227.67` 连接超时
- 输入密码后 `Permission denied`

### 原因

1. **腾讯云安全组**未放行 TCP 22 端口（不同于防火墙，安全组是另一层规则）
2. Ubuntu 镜像默认用户是 `ubuntu`，不是 `root`

### 解决方案

1. 腾讯云控制台 → 轻量应用服务器 → 实例 → **安全组** → 添加入站规则：
   - TCP 22 端口，来源 0.0.0.0/0，策略允许
2. 使用 `ssh ubuntu@IP` 登录（不是 root）

### 关键概念

腾讯云有**两层网络防护**：
- **安全组**：在实例级别控制，需要单独放行端口
- **防火墙**：在轻量应用服务器级别控制

两处都需要放行对应端口，缺一不可。

---

## 问题二：deploy.sh 脚本执行失败

### 现象 1：请不要用 root 用户运行此脚本

```
[FAIL] 请不要用 root 用户运行此脚本，使用普通用户 + sudo
```

### 原因

`sudo bash deploy.sh` 以 root 身份运行脚本，触发了 root 用户检查。

### 解决方案

移除脚本中的 root 用户检查逻辑：
```bash
# 删除这几行
if [ "$(id -u)" -eq 0 ]; then
  fail "请不要用 root 用户运行此脚本，使用普通用户 + sudo"
fi
```

### 现象 2：GitHub 缓存导致下载旧版本

下载的 deploy.sh 仍然是旧版本（包含已删除的 root 检查）。

### 解决方案

URL 后加时间戳参数绕过 CDN 缓存：
```bash
curl -fsSL "https://raw.githubusercontent.com/user/repo/main/deploy.sh?$(date +%s)" -o deploy.sh
```

### 现象 3：下载到 HTML 页面而非脚本

### 原因

GitHub 仓库是**私有的**，raw URL 返回 404 页面（HTML 格式）。

### 解决方案

将仓库设置为**公开**：GitHub → 仓库 → Settings → Change visibility → Public

---

## 问题三：VNC 终端粘贴长命令失败

### 现象

- heredoc (`<< 'EOF'`) 在 VNC 终端中无法正常工作
- 长命令粘贴后格式错乱，导致语法错误
- 多行 Python 代码出现 `IndentationError`

### 原因

VNC 终端对粘贴内容的处理有限制，长命令和多行内容会被自动换行或添加缩进。

### 解决方案

1. **单行命令**：将多行配置压缩成一行
2. **Python 脚本**：用 `sudo python3 -c "..."` 写文件
3. **远程脚本**：将脚本推到 GitHub，服务器上下载执行
4. **避免 heredoc**：用 `echo '...' | sudo tee 文件` 或 `sudo cp` 替代

---

## 问题四：Nginx 配置反复失败

### 现象

- `sudo tee /etc/nginx/sites-available/wereadwork` 报 `Permission denied`
- sed 命令将 nginx.conf 搞坏（`gzip_min_length` 放错位置）
- heredoc 在 VNC 中无法正常结束

### 根本原因

VNC 终端粘贴 + 权限 + sed 正则匹配错误的组合问题。

### 最终解决方案

创建修复脚本 `fix-nginx.sh`，推到 GitHub，服务器上下载执行：

```bash
curl -fsSL "https://raw.githubusercontent.com/userWang123541/weRead/main/fix-nginx.sh?$(date +%s)" -o fix-nginx.sh && sudo bash fix-nginx.sh
```

脚本内容要点：
1. 备份 nginx.conf
2. 用 sed 清理所有错误的 gzip 配置行
3. 用 heredoc 写入正确的站点配置（脚本内执行，避免 VNC 粘贴问题）
4. 测试并重载 nginx

### 最终 Nginx 配置

```nginx
server {
    listen 80;
    server_name wereadwork.site www.wereadwork.site 43.132.227.67;

    gzip on;
    gzip_types text/css application/javascript text/javascript;
    gzip_min_length 1024;

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
```

---

## 问题五：页面加载极慢 + 白屏（核心问题）

### 现象

- 首页加载需要 2 分钟以上
- `bundle.js`（1.4MB）一直挂起（pending）
- 进入页面后白屏，Vue 组件不渲染
- 浏览器报 `Vue is not defined` 错误

### 原因分析

#### 原因 1：2Mbps 带宽瓶颈

服务器带宽仅 2Mbps（250KB/s），但实际传输速度更低：
- `bundle.js`（gzip 后 507KB）耗时 2.1 分钟
- 实际速度约 4KB/s，远低于理论值

#### 原因 2：浏览器并发连接限制

浏览器对同一域名最多 6 个并发连接。10+ 个 JS/CSS 文件排队加载，后面的文件一直挂起等待。

#### 原因 3：Node.js 处理大文件超时

Express 通过 `express.static()` 服务静态文件时，1MB+ 的文件会超时或极慢。

#### 原因 4：Element Plus 全量引入

Element Plus 全量包 1MB，项目只用了 6-7 个组件（Button、Input、Select、Tree、Segmented），但 CDN 全局引入模式无法按需加载。

### 尝试过的方案

| 方案 | 结果 | 原因 |
|---|---|---|
| unpkg.com | 慢（4s+/文件） | 美国 CDN，国内访问慢 |
| cdn.jsdelivr.net | 慢（4s+/文件） | 同上 |
| unpkg.zhimg.com | 403 错误 | 知乎镜像被封 |
| cdnjs.cloudflare.com | 2-4s/文件 | Cloudflare 在中国不稳定 |
| ByteCDN（字节 CDN） | 0.3s/文件 | Vue 包 404，只有 Element Plus 和 Vue Router |
| BootCDN | Vue/Router 1-2s，Element Plus 8s | 国内 CDN，可用但 Element Plus 慢 |
| self-hosted（vendor/ 目录） | 2 分钟+/文件 | 2Mbps 带宽瓶颈 |
| self-hosted + gzip | 仍超时 | 带宽瓶颈无法解决 |
| self-hosted + Nginx 直接服务 | 仍超时 | 同上 |
| 合并为 bundle.js | 仍超时 | 1.4MB 在 2Mbps 上传输太慢 |

### 最终解决方案

**使用 BootCDN（国内 CDN）**，放弃自托管方案：

```html
<link rel="stylesheet" href="https://cdn.bootcdn.net/ajax/libs/element-plus/2.9.1/index.css">
<script src="https://cdn.bootcdn.net/ajax/libs/vue/3.5.13/vue.global.prod.min.js"></script>
<script src="https://cdn.bootcdn.net/ajax/libs/vue-router/4.4.5/vue-router.global.prod.min.js"></script>
<script src="https://cdn.bootcdn.net/ajax/libs/element-plus/2.9.1/index.full.min.js"></script>
<script src="https://cdn.bootcdn.net/ajax/libs/element-plus/2.9.1/icons-vue.min.js"></script>
<script src="https://cdn.bootcdn.net/ajax/libs/marked/12.0.0/marked.min.js"></script>
```

BootCDN 是国内 CDN，国内用户访问速度快（Vue 2s，Vue Router 1.3s，Marked 0.9s），且文件会被浏览器缓存，后续访问秒开。

---

## 问题六：Express Gzip 压缩配置

### 尝试过程

1. 安装 `compression` 中间件 → 大文件压缩时卡住
2. 排除 `/vendor/` 路径 → 仍有问题
3. 改用 Nginx gzip → sed 命令将配置搞坏

### 最终方案

在 Nginx 层面开启 gzip（而非 Node.js）：

```nginx
gzip on;
gzip_types text/css application/javascript text/javascript;
gzip_min_length 1024;
```

同时在 Express 中为 vendor 文件跳过 compression：

```javascript
app.use(compression({
  filter: (req, res) => {
    if (req.path.startsWith('/vendor/')) return false;
    return compression.filter(req, res);
  },
}));
```

---

## 问题七：LCP（最大内容绘制）9.21 秒

### 现象

PageSpeed 显示 LCP 9.21 秒，页面加载体验差。

### 原因

所有 JS 脚本都是同步加载（无 `defer`），浏览器必须按顺序下载完所有脚本才开始渲染：
- Vue（2s）→ Vue Router（1.3s）→ Element Plus（8s）→ Icons → Marked
- 总计约 13 秒后才开始渲染页面

### 解决方案

**1. preconnect + preload 提前建立连接和下载关键资源：**

```html
<link rel="preconnect" href="https://cdn.bootcdn.net" crossorigin>
<link rel="preload" as="script" href="https://cdn.bootcdn.net/ajax/libs/vue/3.5.13/vue.global.prod.min.js">
<link rel="preload" as="script" href="https://cdn.bootcdn.net/ajax/libs/vue-router/4.4.5/vue-router.global.prod.min.js">
```

**2. defer 异步加载非关键脚本：**

```html
<!-- Vue/Vue Router 同步加载（Element Plus 依赖它们） -->
<script src="https://cdn.bootcdn.net/ajax/libs/vue/3.5.13/vue.global.prod.min.js"></script>
<script src="https://cdn.bootcdn.net/ajax/libs/vue-router/4.4.5/vue-router.global.prod.min.js"></script>

<!-- Element Plus/Icons/Marked 延迟加载 -->
<script defer src="https://cdn.bootcdn.net/ajax/libs/element-plus/2.9.1/index.full.min.js"></script>
<script defer src="https://cdn.bootcdn.net/ajax/libs/element-plus-icons-vue/2.3.2/index.iife.min.js"></script>
<script defer src="https://cdn.bootcdn.net/ajax/libs/marked/12.0.0/marked.min.js"></script>
```

**3. 添加 loading 动画（CSS 内联，不依赖外部资源）：**

```html
<style>
  #app:empty { display:flex; align-items:center; justify-content:center; height:100vh; }
  #app:empty::after { content:''; width:32px; height:32px; border:3px solid #e5e5e5; border-top-color:#409eff; border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg) } }
</style>
```

**4. main.js 等待 Element Plus 加载完成后再挂载：**

```javascript
function mountApp() {
  const app = createApp(App);
  app.use(router);
  app.use(ElementPlus);
  // ...
  app.mount('#app');
}

if (typeof ElementPlus !== 'undefined') {
  mountApp();
} else {
  const scripts = document.querySelectorAll('script[src*="element-plus"]');
  let loaded = 0;
  scripts.forEach(s => s.addEventListener('load', () => {
    if (++loaded >= scripts.length) mountApp();
  }));
}
```

### 优化效果

| 指标 | 优化前 | 优化后 |
|---|---|---|
| Vue 加载 | 阻塞 | 1.5 秒（preload 加速） |
| Element Plus | 阻塞渲染 8 秒 | defer 异步，不阻塞 |
| CSS 缓存 | 无 | disk cache，0ms |
| 用户感知 | 白屏 9+ 秒 | 立即显示 loading 动画 |

---

## 问题八：BootCDN icons-vue 路径 404

### 现象

```
GET https://cdn.bootcdn.net/ajax/libs/element-plus/2.9.1/icons-vue.min.js → 404
```

### 原因

BootCDN 上 `@element-plus/icons-vue` 是独立包，不在 `element-plus` 路径下。

### 正确路径

```html
<!-- 错误 -->
<script src="https://cdn.bootcdn.net/ajax/libs/element-plus/2.9.1/icons-vue.min.js"></script>

<!-- 正确 -->
<script src="https://cdn.bootcdn.net/ajax/libs/element-plus-icons-vue/2.3.2/index.iife.min.js"></script>
```

---

## 问题九：API 数据同步超时 / Failed to fetch

### 现象

页面加载后同步数据时显示 `Failed to fetch`，等待时间极长。

### 原因

API 返回数据量巨大（约 5MB JSON），2Mbps 带宽传输需要 20 秒以上，浏览器请求超时。

### 排查过程

1. 服务器本地测试 API：`curl http://localhost:3456/api/data` → 0.12 秒（正常）
2. 通过 Nginx 代理测试：`curl http://localhost/api/data` → 0.12 秒（正常）
3. 检查响应大小：`curl http://localhost/api/data | wc -c` → **4,939,985 字节（约 5MB）**
4. 根因：5MB 数据在 2Mbps 带宽上传输需 20 秒+

### 解决方案

Express 的 `compression` 中间件已自动压缩 JSON 响应：

```bash
curl -s -H "Accept-Encoding: gzip" http://localhost/api/data | wc -c
# 结果：1,083,803 字节（约 1MB，压缩率 78%）
```

5MB → 1MB，传输时间从 20 秒降到约 4 秒。

### Nginx gzip 配置补充

Nginx 的 gzip_types 默认只包含 `text/css` 和 `application/javascript`，需要添加 `application/json`：

```nginx
gzip_types text/css application/javascript text/javascript application/json text/html;
```

> 注意：由于 Express 已经在应用层压缩了 JSON，Nginx 层的配置是额外保障。
> 在 VNC 终端中执行 sed 替换长命令容易断行，建议用修复脚本处理。

### 长期优化建议

- **升级带宽**：从 2Mbps 升到 5Mbps+（腾讯云控制台可操作）
- **API 分页**：改造代码，只返回当前页面需要的数据，不一次性返回全部
- **数据缓存**：前端缓存已同步的数据，避免重复请求

---

## 经验总结

### 服务器选择

- 2Mbps 带宽对于需要加载 1MB+ 前端库的项目**严重不足**
- 建议至少 5Mbps 带宽，或使用 CDN 分担静态资源流量
- 香港服务器国内访问延迟约 3 秒，需要 CDN 加速

### CDN 选择（国内用户）

- **推荐**：BootCDN（cdn.bootcdn.net）— 国内节点，速度快
- **备选**：ByteCDN（lf26-cdn-tos.bytecdntp.com）— 字节跳动 CDN，但包覆盖不全
- **避免**：unpkg.com、jsdelivr — 国内访问慢
- **避免**：unpkg.zhimg.com — 不稳定，可能 403

### 部署工具

- SSH 比 VNC 终端好用得多（支持复制粘贴、多行命令）
- 安全组和防火墙是两层防护，都需要配置
- 复杂配置用脚本推到 GitHub 下载执行，避免 VNC 粘贴问题
- 长命令用 `echo '...' | sudo tee` 或 `python3 -c` 写文件

### 前端优化

- 避免全量引入大型 UI 库（Element Plus 1MB）
- 优先使用 CDN 加载前端库，不要自托管在低带宽服务器
- 静态资源文件由 Nginx 直接服务，不经过 Node.js
- 开启 gzip 压缩可减少 60-80% 传输量
