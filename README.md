# MADAO CHAT — AI 面试助手

基于 **RAG（检索增强生成）** 与 **LangGraph 多智能体** 的全栈 AI 面试辅助系统。支持面试官与面试者两种角色，可上传简历、GitHub 仓库构建知识库，通过向量检索 + LLM 生成高质量面试问答，并具备 TTS 语音播报能力。

***

## 功能特性

- **多角色面试** — 支持面试官（提问方）与面试者（回答方）两种模式，通过邀请码机制关联双方
- **RAG 向量检索** — 简历 / GitHub 仓库文档上传后自动分块向量化存入 Milvus，面试时精准检索相关知识
- **LangGraph 多智能体编排** — 意图路由 → 问题拆解 → 多轮向量检索 → Agentic 回答生成，含联网搜索回退
- **流式对话** — 基于 SSE 的实时流式响应，前端逐字渲染 Markdown（代码高亮、Mermaid 图表）
- **TTS 语音播报** — 集成腾讯云 TTS，支持 AI 回答实时语音合成与前端直接合成两种模式
- **语音输入** — 集成腾讯云 ASR，支持语音转文字输入
- **AI 总结生成** — 所有子问题回答完毕后自动生成结构化面试总结，候选人第一人称口吻可直接展示
- **简历智能解析** — 上传 PDF/Word 简历，AI 自动分割为 6 个模块并向量化存储
- **GitHub 知识库** — 输入 GitHub 用户名批量拉取仓库 README 并向量化索引
- **像素风 UI** — 基于 PxlKit + Tailwind CSS 的复古像素风格界面
- **会话记忆** — 基于 Redis checkpoint 的 LangGraph 状态持久化，刷新页面后可恢复对话

***

## 技术栈

### 前端 (`offer-app`)

| 技术            | 版本    | 用途             |
| ------------- | ----- | -------------- |
| React         | ^19   | UI 框架          |
| TypeScript    | \~6.0 | 类型安全           |
| Vite          | ^8.0  | 构建工具           |
| Tailwind CSS  | ^4.2  | 原子化 CSS        |
| React Router  | ^7.15 | 前端路由           |
| Vercel AI SDK | ^6.0  | 流式聊天（useChat）  |
| Streamdown    | ^2.5  | 流式 Markdown 渲染 |
| PxlKit        | ^1.2  | 像素风 UI 组件库     |
| Axios         | ^1.16 | HTTP 客户端       |

### 后端 (`offer-server`)

| 技术          | 版本    | 用途               |
| ----------- | ----- | ---------------- |
| NestJS      | ^11   | 后端框架             |
| TypeScript  | ^5.7  | 类型安全             |
| TypeORM     | ^0.3  | ORM              |
| MySQL       | —     | 业务数据库            |
| Redis       | ^5.12 | 缓存 + checkpoint  |
| Milvus      | —     | 向量数据库            |
| LangChain   | ^1.3  | LLM 编排           |
| LangGraph   | ^1.2  | 多智能体状态图          |
| OpenAI      | —     | LLM + Embeddings |
| 腾讯云 ASR/TTS | —     | 语音服务             |
| Nodemailer  | ^8.0  | 邮件验证码            |

***

## 项目结构

```
offer-in-hard/
├── offer-app/                    # 前端 React + Vite 应用
│   ├── src/
│   │   ├── main.tsx              # React 入口
│   │   ├── App.tsx               # 路由配置
│   │   ├── index.css             # 全局样式（像素风主题）
│   │   ├── api/
│   │   │   ├── interfaces.ts     # API 函数与类型定义
│   │   │   └── request.ts        # Axios 实例（token 管理/自动刷新）
│   │   ├── components/
│   │   │   ├── Chat/             # 主聊天组件
│   │   │   │   ├── GithubProjectPanel/  # GitHub 项目侧栏
│   │   │   │   ├── MessagePart/         # 消息分块渲染
│   │   │   │   ├── StreamdownText/      # 流式 Markdown 渲染
│   │   │   │   ├── ToolMessagePart/     # 工具消息渲染
│   │   │   │   ├── VoiceInput/          # 语音输入
│   │   │   │   └── ParticleBackground/  # 粒子背景
│   │   │   ├── Layout/           # 布局组件（导航 + 用户菜单）
│   │   │   ├── UpdateInfoModal/  # 修改信息弹窗
│   │   │   ├── UploadResumeModal/ # 上传简历弹窗
│   │   │   └── UploadGithubModal/ # 上传 GitHub 弹窗
│   │   ├── pages/
│   │   │   ├── Login/            # 登录页
│   │   │   ├── Register/         # 注册页
│   │   │   └── ForgotPassword/   # 忘记密码页
│   │   ├── context/
│   │   │   └── AuthContext.tsx    # 认证上下文
│   │   ├── hooks/
│   │   │   └── useTtsWebSocket.ts # TTS WebSocket 钩子
│   │   └── type/                 # 全局类型定义
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
└── offer-server/                 # 后端 NestJS 服务
    ├── src/
    │   ├── main.ts               # 应用入口 + WebSocket 启动
    │   ├── app.module.ts         # 根模块
    │   ├── auth/                 # 认证模块（JWT + RBAC）
    │   │   ├── entities/         # User / Role / Permission
    │   │   └── dto/              # 请求 DTO
    │   ├── ai/                   # AI 核心模块
    │   │   ├── langgraph/        # LangGraph 多智能体编排
    │   │   │   ├── graph.service.ts    # 状态图定义与执行
    │   │   │   ├── graph-type.ts       # 状态类型
    │   │   │   └── nodes/              # 节点实现
    │   │   │       ├── intent.route.node.ts    # 意图路由
    │   │   │       ├── decompose.node.ts       # 问题拆解
    │   │   │       ├── retrieve.node.ts        # 向量检索
    │   │   │       ├── planRetrieval.node.ts   # 检索规划
    │   │   │       ├── answer.node.ts          # 回答生成
    │   │   │       ├── generate.node.ts        # 通用生成
    │   │   │       ├── inviteCodeCheck.node.ts # 邀请码检查
    │   │   │       ├── inviteCodeQuery.node.ts # 邀请码验证
    │   │   │       ├── webSearch.node.ts       # 联网搜索
    │   │   │       ├── message.node.ts         # 消息节点
    │   │   │       ├── notAvailable.node.ts    # 不可用提示
    │   │   │       └── clearSession.node.ts    # 会话清理
    │   │   └── entities/         # UploadFile 实体
    │   ├── github/               # GitHub 知识库模块
    │   ├── redis/                # Redis 模块
    │   ├── email/                # 邮件模块
    │   ├── speech/               # 语音模块（ASR + TTS）
    │   ├── tool/                 # 工具模块
    │   │   ├── chatModel.service.ts    # OpenAI Chat Model
    │   │   ├── embeddings.service.ts   # OpenAI Embeddings
    │   │   ├── milvus.service.ts       # Milvus 向量数据库
    │   │   ├── documentLoad.service.ts # 文档加载器
    │   │   ├── webSearch.service.ts    # 联网搜索（Bocha）
    │   │   ├── github.service.ts       # GitHub API 封装
    │   │   └── message.service.ts      # 消息工具
    │   └── common/               # 公共定义
    └── package.json
```

***

## 快速开始

### 环境要求

- **Node.js** >= 22
- **MySQL** 数据库
- **Redis** 服务
- **Milvus** 向量数据库（支持 Milvus Standalone 或 Zilliz Cloud）
- **OpenAI API** 兼容的 API Key（或其他兼容的 LLM 服务）

### 1. 克隆项目

```bash
git clone <repo-url>
cd offer-in-hard
```

### 2. 配置后端

```bash
cd offer-server

# 创建环境变量文件
cp src/.env.example src/.env
```

编辑 `offer-server/src/.env`，填入以下配置：

```env
# ---------- 服务器 ----------
PORT=3000

# ---------- MySQL ----------
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_NAME=offer_db

# ---------- Redis ----------
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# ---------- OpenAI ----------
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4o
EMBEDDINGS_MODEL_NAME=text-embedding-3-small
VECTOR_DIM=1536

# ---------- Milvus ----------
MILVUS_URL=localhost:19530
MILVUS_DATABASE=default
MILVUS_COLLECTION_NAME=offer_collection
MILVUS_USERNAME=
MILVUS_PASSWORD=
MILVUS_METRIC_TYPE=COSINE

# ---------- JWT ----------
JWT_SECRET=your_jwt_secret_key

# ---------- 邮件 ----------
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your_email@example.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=your_email@example.com

# ---------- 腾讯云（语音服务） ----------
SECRET_ID=
SECRET_KEY=
APP_ID=
TTS_VOICE_TYPE=101001

# ---------- 联网搜索 ----------
BOCHA_API_KEY=sk-xxxxxxxxxxxxxxxx
```

安装依赖并启动：

```bash
npm install
npm run start:dev
```

### 3. 配置前端

```bash
cd ../offer-app
npm install
npm run dev
```

前端开发服务器默认运行在 `http://localhost:5173`，后端 API 默认代理到 `http://localhost:3000`。

***

## 使用指南

### 注册与登录

1. 访问 `http://localhost:5173`，自动跳转到登录页
2. 点击"注册"创建账号（系统自动生成 UUID 邀请码）
3. 登录后进入聊天主界面

### 面试官模式

1. 登录后进入聊天页，默认为面试官模式
2. 上传简历（PDF/Word）作为面试者的知识库
3. 输入或粘贴面试者的邀请码，开始针对性提问
4. 系统基于简历内容生成专业面试问题
5. 可通过地址栏 `?invite=<邀请码>` 直接进入面试

### 面试者模式

暂无

### 面试总结

- 所有子问题回答完毕后，系统自动生成结构化面试总结
- 总结以候选人第一人称口吻呈现，可直接展示给面试官
- 总结仅基于实际问答生成，严禁编造

### 思考过程

- 每个 AI 回复均带"思考过程"折叠栏，默认展开
- 展开可查看问题拆解、向量检索和回答推理详情

### GitHub 知识库

1. 点击导航栏用户菜单 → "上传 GitHub"
2. 输入你的 GitHub 用户名，选择要索引的仓库
3. 系统自动拉取仓库 README 并向量化存储
4. 面试时可通过项目面板选择注入的仓库上下文

### 语音功能

- **语音输入**：点击聊天框旁的话筒按钮开始录音
- **语音播报**：AI 回答会自动通过 TTS 合成语音播放
- 语音功能依赖腾讯云 ASR/TTS 配置

***

## API 概览

### 认证

| 方法   | 路径                      | 说明       |
| ---- | ----------------------- | -------- |
| POST | `/auth/login`           | 登录       |
| POST | `/auth/register`        | 注册       |
| POST | `/auth/refresh`         | 刷新 Token |
| POST | `/auth/forgot-password` | 忘记密码     |
| POST | `/auth/send-captcha`    | 发送邮箱验证码  |

### AI 对话

| 方法   | 路径                     | 说明             |
| ---- | ---------------------- | -------------- |
| POST | `/ai/agui/stream`      | 流式 RAG 对话（SSE） |
| GET  | `/ai/memory/:threadId` | 获取会话记忆         |

### 文件管理

| 方法     | 路径                       | 说明           |
| ------ | ------------------------ | ------------ |
| POST   | `/ai/upload/resume`      | 上传简历（SSE 进度） |
| POST   | `/ai/upload/document`    | 上传通用文档       |
| GET    | `/ai/upload/list`        | 文件列表         |
| GET    | `/ai/upload/preview/:id` | 文件预览         |
| DELETE | `/ai/upload/:id`         | 删除文件         |

### GitHub

| 方法   | 路径                        | 说明       |
| ---- | ------------------------- | -------- |
| GET  | `/github/repos/:username` | 获取用户仓库列表 |
| POST | `/github/ingest`          | 索引仓库知识库  |
| GET  | `/github/ingested`        | 已索引仓库列表  |

### 语音

| 方法   | 路径               | 说明            |
| ---- | ---------------- | ------------- |
| POST | `/speech/asr`    | 语音识别          |
| WS   | `/speech/tts/ws` | TTS WebSocket |

***

## 核心架构

```
用户 → Chat UI (useChat SSE) → POST /ai/agui/stream
  → AiController → GraphService.run()
  → StateGraph (LangGraph)
    ├── intentRouteNode     → 意图分类（面试官/面试者/闲聊/结束）
    ├── inviteCodeCheck     → 提取检查邀请码
    ├── inviteCodeQuery     → 验证邀请码 + Redis 缓存
    ├── decomposeNode       → 问题拆解为独立子问题
    ├── retrieveNode        → Milvus 向量检索 Top-K（简历+GitHub联合检索）
    ├── planRetrievalNode   → 检索质量评估与补充检索规划
    ├── answerNode          → Agentic 回答生成（含联网搜索回退）
    ├── summarizeNode       → 全子问题回答完毕后生成面试总结（候选人第一人称）
    └── clearSessionNode    → 清理会话缓存
  → SSE Stream → 前端渲染 + TTS 语音播报
```

**Checkpoint 机制**：通过 `RedisSaver` 持久化 LangGraph 状态，支持中断恢复和对话历史记忆，TTL 2 小时。

***

## 常见问题

### Milvus 连接失败

确保 Milvus 服务已启动，检查 `.env` 中 `MILVUS_URL` 配置是否正确。如使用 Zilliz Cloud，需填写对应的云端地址和认证信息。

### 语音功能不可用

语音功能需要配置腾讯云 `SECRET_ID`、`SECRET_KEY`、`APP_ID`。如不需要语音功能，可忽略相关配置，不影响核心对话功能。

### OpenAI API 调用失败

检查 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL` 是否正确。支持任意 OpenAI 兼容的 API 服务（如 Azure OpenAI、本地 Ollama 等）。

***

## License

UNLICENSED — 私有项目，保留所有权利。
