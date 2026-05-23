# 微读 Read

> 将微信读书的阅读数据转化为个人知识体系，让阅读有迹可循。

一款专为微信读书用户打造的阅读数据管理与知识沉淀工具。通过同步你的阅读笔记、划线和书架数据，借助 AI 智能分类，帮你构建结构化的个人知识库。

## 功能特性

### 书架管理
浏览并管理你的微信读书书架，查看每本书的阅读进度和笔记数量。

### 知识卡片
将书中的划线和笔记转化为独立的知识卡片，支持标签、搜索和筛选。

### AI 智能分类
基于 OpenAI Embedding，自动对知识卡片进行语义分类，构建你的知识图谱。

### 分类管理
自定义知识分类体系，灵活调整分类结构，打造专属的知识树。

### 关联分析
发现不同书籍、笔记之间的隐藏关联，挖掘跨领域的知识连接。

### 阅读报告
AI 生成个性化的阅读分析报告，回顾你的阅读历程与收获。

### 话题雷达
可视化展示你的阅读偏好分布，发现阅读盲区。

### 时间线
按时间轴回顾阅读历程，重温每一次阅读灵感。

### 知识导出
支持将笔记、卡片、报告导出为 Markdown，方便归档和二次创作。

### 复习与回忆
基于遗忘曲线的复习功能，定期唤醒沉睡的知识点。

## 技术栈

**前端**
- Vue 3 + Vue Router
- Element Plus
- marked (Markdown 渲染)

**后端**
- Node.js + Express
- OpenAI API (Embedding + GPT)

**设计风格**
- A4 文艺杂志风
- 奶油米白色调
- 极简黑白灰 + 金色点缀
- 衬线与无衬线字体混排

## 快速开始

### 前置要求

- Node.js >= 18
- 微信读书账号 Cookie
- OpenAI API Key

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/weread-read.git
cd weread-read

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的配置
```

### 配置

在 `.env` 文件中配置：

```env
# 微信读书 Cookie（从浏览器获取）
WEREAD_COOKIE=your_cookie_here

# OpenAI API Key
OPENAI_API_KEY=your_api_key_here

# 可选：自定义 API 地址
OPENAI_BASE_URL=https://api.openai.com/v1
```

### 运行

```bash
# 同步微信读书数据
npm run sync

# 启动服务
npm start

# 访问 http://localhost:3000
```

## 项目结构

```
├── src/
│   ├── pages/          # 页面组件
│   ├── components/     # 公共组件
│   ├── styles.css      # 全局样式
│   ├── router.js       # 路由配置
│   └── store.js        # 状态管理
├── lib/
│   ├── weread-service.js   # 微信读书 API
│   ├── card-engine.js      # 卡片生成引擎
│   ├── classifier.js       # AI 分类器
│   └── report-engine.js    # 报告生成引擎
├── data/               # 数据存储
├── config/             # 配置文件
└── server.js           # Express 服务
```

## 使用说明

1. **同步数据**：首次使用需同步微信读书数据，点击「同步」按钮或运行 `npm run sync`
2. **浏览书架**：在书架页面查看所有已同步的书籍
3. **查看卡片**：每本书的笔记会自动转化为知识卡片
4. **智能分类**：系统会自动对卡片进行 AI 分类，你也可以手动调整
5. **生成报告**：选择时间范围，一键生成阅读分析报告
6. **导出笔记**：支持批量导出为 Markdown 文件

## 许可证

MIT

---

<p align="center">
  <sub>让每一次阅读，都成为知识的积累。</sub>
</p>
