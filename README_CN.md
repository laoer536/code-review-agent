# Code Review Agent

基于 AI 的代码审查 Agent，支持自动分析代码变更、语义检索规则知识库、记忆项目技术栈。

[English](./README.md)

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                       Agent Loop                          │
│                                                           │
│  用户提问 → 构建 Prompt → LLM 推理 → 工具调用 → 结果      │
│                ↑                              │           │
│                └──────── 多轮循环 ─────────────┘           │
│                                                           │
│  工具:                                                    │
│    listFiles         查看项目文件结构                       │
│    readFile          读取文件内容                           │
│    gitDiff           查看 git 代码变更                     │
│    saveReview        记住项目技术栈                         │
│    indexDocument     索引规则到知识库                       │
│    searchKnowledge   语义搜索知识库                         │
│    analyzeImpact     影响范围分析（CodeGraph）              │
│    getCallChain      调用链分析（CodeGraph）                │
│                                                           │
│  数据 (.code-review-agent/):                              │
│    memory.json       项目技术栈记忆（JSON）                 │
│    vectors.db        RAG 知识库（SQLite + 向量检索）        │
│                                                           │
│  代码索引 (.codegraph/):                                  │
│    CodeGraph         依赖分析 + 影响分析索引                │
└──────────────────────────────────────────────────────────┘
```

## 快速开始

### 安装

```bash
bun install
```

### 配置环境变量

创建 `.env` 文件：

```bash
# LLM（必填）
DEEPSEEK_API_KEY=sk-xxx

# Review 输出语言（可选，默认中文）
# 支持：中文, English, 日本語, 한국어 等任意语言
REVIEW_LANGUAGE=中文

# MR 目标分支（CI 环境自动读取，本地可手动指定）
# GitHub Actions 自动读取 GITHUB_BASE_REF
# GitLab CI 自动读取 CI_MERGE_REQUEST_TARGET_BRANCH_NAME
# TARGET_BRANCH=main

# 首次下载 embedding 模型需要网络访问 huggingface.co
# 如果网络不通，设置镜像或代理：
HF_ENDPOINT=https://hf-mirror.com
# 或
# https_proxy=http://127.0.0.1:7890
```

### 使用

```bash
# 无参数：自动 review 本次 MR 的变更
bun run src/index.ts

# 自定义 review 任务
bun run src/index.ts "帮我 review 当前项目的代码变更"

# 分析特定目录
bun run src/index.ts "检查 src/agent/ 目录的代码质量"
```

无参数时的优先级：
1. MR 变更（分支 vs 目标分支，从 CI 环境变量读取目标分支）
2. 暂存区变更（`git diff --staged`）
3. 未暂存变更（`git diff`）
4. 最近一次 commit（`git diff HEAD~1`）

## GitLab CI 集成

### 打包 & 发布 CLI

#### 方式一：本地打包

```bash
# 打包当前平台
bun build src/index.ts --compile --outfile dist/code-review

# 打包 Linux CI 用
bun build src/index.ts --compile --target=bun-linux-x64 --outfile dist/code-review-linux-x64

# 打包 macOS
bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile dist/code-review-darwin-arm64
```

#### 方式二：发布到 GitHub Releases

创建 `.github/workflows/release.yml`：

```yaml
name: Release CLI
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: bun-linux-x64
            name: code-review-linux-x64
          - os: macos-latest
            target: bun-darwin-arm64
            name: code-review-darwin-arm64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun build src/index.ts --compile --target=${{ matrix.target }} --outfile dist/${{ matrix.name }}
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/${{ matrix.name }}
```

然后：
```bash
git tag v1.0.0
git push --tags
# 二进制文件自动发布到 GitHub Releases
```

#### 方式三：发布到私有 npm 仓库

```bash
# 打包
bun build src/index.ts --compile --outfile dist/code-review

# package.json 中添加 bin 字段
# "bin": { "code-review": "./dist/code-review" }

# 发布到私有仓库
npm publish --registry https://your-private-registry.com

# CI 中使用
npx --registry https://your-private-registry.com code-review
```

#### 方式四：自托管（GitLab Package Registry / Nexus / Minio）

```bash
# 打包
bun build src/index.ts --compile --target=bun-linux-x64 --outfile code-review-linux-x64

# 上传到 GitLab Generic Packages
curl --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --upload-file code-review-linux-x64 \
  "https://gitlab.com/api/v4/projects/$PROJECT_ID/packages/generic/code-review/v1.0.0/code-review-linux-x64"

# CI 中使用
curl -L -o code-review \
  "https://gitlab.com/api/v4/projects/$PROJECT_ID/packages/generic/code-review/v1.0.0/code-review-linux-x64"
chmod +x code-review
```

#### 方式五：Docker 镜像

```dockerfile
FROM oven/bun:latest AS builder
WORKDIR /app
COPY . .
RUN bun install && bun build src/index.ts --compile --outfile /usr/local/bin/code-review

FROM debian:bookworm-slim
COPY --from=builder /usr/local/bin/code-review /usr/local/bin/code-review
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["code-review"]
```

```bash
# 构建 & 推送
docker build -t your-registry.com/code-review:v1 .
docker push your-registry.com/code-review:v1

# CI 中使用
docker run --rm -e DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY your-registry.com/code-review:v1
```

### 第一步：准备项目

在你的项目仓库中添加 review 规则：

```
your-project/
├── src/
├── .gitlab-ci.yml
└── .code-review/                  # Review 配置 + 规则
    ├── rules/
    │   ├── typescript.md          # 团队 TS 规范
    │   ├── security.md            # 安全规则
    │   └── project-specific.md    # 项目专属规则
```

在 `.gitlab-ci.yml` 中通过环境变量配置：

```yaml
variables:
  RULES_DIR: .code-review/rules      # 规则目录（默认）
  REVIEW_LANGUAGE: 中文               # 输出语言（默认）
```

`.code-review/rules/typescript.md` 示例：

```markdown
# TypeScript 规范

## 必须修复
- 禁止使用 any，用 unknown 或具体类型
- 禁止非空断言 !，用 ?. 和 ??

## 建议修复
- 函数必须显式标注返回类型
- 纯类型导入使用 import type
```

### 第二步：配置 GitLab CI/CD 变量

进入 **Settings → CI/CD → Variables**，添加：

| 变量 | 值 | Protected |
|------|-----|-----------|
| `DEEPSEEK_API_KEY` | `sk-xxx` | Yes |

### 第三步：添加 `.gitlab-ci.yml`

```yaml
code-review:
  stage: test
  image: debian:bookworm-slim
  variables:
    HF_ENDPOINT: https://hf-mirror.com
    REVIEW_LANGUAGE: 中文
  cache:
    key: code-review-agent
    paths:
      - .code-review-agent/          # RAG vectors.db + memory.json
      - .codegraph/                  # CodeGraph 索引（持久化）
      - .cache/huggingface/          # Embedding 模型（缓存）
  before_script:
    - apt-get update && apt-get install -y curl git
    # 下载 CLI 到缓存目录
    - curl -L -o .code-review-cli https://github.com/your-org/code-review-agent/releases/latest/download/code-review-linux-x64
    - chmod +x .code-review-cli
  script:
    - ./.code-review-cli             # 自动检测 MR 变更
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

### 第四步：创建 MR → 自动 Review

创建 Merge Request 后，流水线自动：

```
1. 下载 CLI 二进制文件（缓存）
2. 同步 CodeGraph 索引（缓存）
3. 索引 .code-review/rules/ 中的规则
4. 分析 MR 变更（分支 vs 目标分支）
5. 在流水线日志中输出 review 结果
```

### 规则管理

规则存放在项目仓库中，更新方式：

```bash
# 编辑规则
vim .code-review/rules/typescript.md

# 提交推送
git add .code-review/rules/
git commit -m "chore: 更新 review 规则"
git push
```

下次 MR 会自动使用更新后的规则。

### 完整示例

```
$ code-review

🔍 正在分析...
📊 同步代码图谱...
  ✅ Indexed 45 files — 312 nodes, 589 edges

🔧 [1/20] gitDiff { target: "origin/main" }
🔧 [1/20] readFile { path: "src/auth/login.ts" }
🔧 [2/20] analyzeImpact { symbol: "validateUser" }
🔧 [2/20] getCallChain { symbol: "validateUser", direction: "callers" }
🔧 [3/20] searchKnowledge { query: "认证 安全 best practice" }
🔧 [4/20] saveReview { codeType: "TypeScript+React前端" }

📋 Review 结果:
  🔴 2 个必须修复
  🟡 3 个建议修复
  🟢 1 个可选优化
```

## 项目结构

```
src/
├── index.ts                  # Review CLI 入口
├── indexRules.ts             # 规则索引 CLI 入口
├── agent/
│   ├── agent.ts              # Agent Loop（多轮工具调用）
│   ├── prompt.ts             # System Prompt（审查维度 + 输出格式）
│   └── types.ts              # 类型定义
├── llm/
│   ├── client.ts             # LLM 对话客户端（DeepSeek API）
│   └── embedding.ts          # Embedding 客户端（本地模型 all-MiniLM-L6-v2）
├── rag/
│   ├── vectorStore.ts        # 向量存储（SQLite + sqlite-vec）
│   └── syncRules.ts          # 自动索引规则（内置 + 项目规则）
├── graph/
│   └── sync.ts               # CodeGraph 图谱同步（init/sync）
├── memory/
│   └── memory.ts             # 项目技术栈记忆（JSON 文件）
└── tools/
    ├── index.ts              # 工具注册 + zod 参数校验
    ├── listFiles.ts          # 查看文件列表
    ├── readFile.ts           # 读取文件内容
    ├── gitDiff.ts            # 查看 git diff
    ├── saveReview.ts         # 保存技术栈记忆
    ├── indexDocument.ts      # 索引文档到知识库
    ├── searchKnowledge.ts    # 语义搜索知识库
    ├── analyzeImpact.ts      # 影响范围分析（CodeGraph）
    └── getCallChain.ts       # 调用链分析（CodeGraph）

rules/                        # 示例规则文件（用户可自定义）
├── general.md                # 通用规范
├── typescript.md             # TypeScript 规范
└── security.md               # 安全规范

.code-review-agent/           # 运行时数据（已 gitignore，CI 中需缓存）
├── vectors.db                # RAG 知识库（SQLite + 向量索引）
└── memory.json               # 项目技术栈记忆

.codegraph/                   # CodeGraph 索引（已 gitignore，CI 中需缓存）
```

## 核心模块

### Agent Loop

经典的 ReAct 循环（Reasoning + Acting）：

1. 用户提问 + system prompt → 发送给 LLM
2. LLM 返回 tool_calls → 执行工具 → 结果追加到 messages
3. 重复直到 LLM 返回纯文本（或达到最大 20 轮迭代）

### Memory（记忆）

按项目隔离，记住每个项目的技术栈：

```
.code-review-agent/memory.json
{
  "code-review-agent": {
    "codeType": "TypeScript+Bun CLI工具",
    "lastReviewed": "2026-08-06"
  }
}
```

- 项目名自动从 `git remote` 提取
- review 时自动注入 system prompt

### RAG（知识库）

将规则文档向量化存储，review 时语义检索相关规则：

- **Embedding**: `@huggingface/transformers` + `Xenova/all-MiniLM-L6-v2`（384 维，本地运行）
- **存储**: SQLite + sqlite-vec（cosine 相似度搜索）
- **分块**: 按段落分块，每块不超过 1000 字符

Agent 启动时自动用用户问题搜索知识库，将相关规则注入 system prompt。

### 规则索引优化

规则索引分两部分，采用增量策略避免重复 embedding：

| 规则来源 | 路径 | 索引策略 |
|---------|------|---------|
| 内置规则 | `rules/`（CLI 自带） | 每次运行索引（体积小，几 ms） |
| 项目规则 | `.code-review/rules/` 或 `RULES_DIR` 环境变量 | **增量检测**，仅变更时索引 |

**项目规则增量检测流程：**

```
syncRules 启动
  │
  ├─ 内置规则 → 始终索引
  │
  ├─ .code-review/rules/ 不存在 → 跳过
  │
  └─ git diff --name-only 检测变更
       │
       ├─ MR 环境：git diff ${target}...HEAD（分支所有 commit vs 目标分支）
       │
       └─ 本地环境：git diff HEAD~1 HEAD（最近一次 commit）
            │
            ├─ 规则目录有变更 → 全量索引用户规则
            │
            └─ 无变更 → 跳过，复用已有向量数据
```

**效果：** CI 中连续多次 MR，只要规则文件没改，就不会触发 embedding 调用，节省启动时间。

### 数据持久化

Agent 的运行时数据存储在 `.code-review-agent/` 目录下（已 gitignore）：

```
.code-review-agent/
├── vectors.db      # RAG 向量知识库（SQLite，包含规则的 embedding 向量）
└── memory.json     # 项目技术栈记忆（按项目名隔离的 JSON）
```

- **首次运行**：自动创建目录、初始化数据库、下载 embedding 模型
- **后续运行**：通过 git diff 检测规则变更，无变更则复用已有向量数据
- **CI 缓存**：务必在 CI 中缓存此目录，避免每次重新索引规则和下载模型

### 工具系统

所有工具使用 zod schema 定义参数，自动校验 LLM 传入的参数：

```ts
// 定义 schema
export const readFileSchema = z.object({
  path: z.string().describe("要读取的文件路径"),
});

// 工具函数
export async function readFile(input: { path: string }): Promise<string> {
  // ...
}
```

## 规则知识库管理

用户可以自定义 review 规则，索引到知识库中供 Agent 参考。

### 规则文件格式

在 `rules/` 目录下创建 Markdown 文件：

```
rules/
├── general.md        # 通用规范
├── typescript.md     # TypeScript 规范
├── security.md       # 安全规范
└── react.md          # React 规范（自定义）
```

### 索引规则

```bash
# 索引整个目录
bun run src/indexRules.ts index ./rules

# 索引单个文件
bun run src/indexRules.ts index ./rules/typescript.md
```

### 管理知识库

```bash
# 查看已索引的规则
bun run src/indexRules.ts list

# 删除指定规则
bun run src/indexRules.ts remove typescript.md

# 清空所有规则
bun run src/indexRules.ts clear
```

### 工作流程

```
1. 编写规则文件（Markdown）
2. 运行 index 命令索引到向量库
3. Agent review 时自动检索相关规则
4. 更新规则后重新 index 即可覆盖
```

## Demo

### 带影响分析的 Review（CodeGraph）

对 `src/llm/embedding.ts` 进行跨文件影响分析：

```
$ bun run src/index.ts "review src/llm/embedding.ts，重点关注改动对其他文件的影响"

🔍 正在分析...
📊 同步代码图谱...
  ✅ Indexed 19 files — 136 nodes, 235 edges

🔧 [1/20] gitDiff { file: "src/llm/embedding.ts" }
🔧 [1/20] readFile { path: "src/llm/embedding.ts" }
🔧 [2/20] analyzeImpact { symbol: "embed" }          ← 影响范围分析
🔧 [2/20] analyzeImpact { symbol: "embedBatch" }
🔧 [2/20] getCallChain { symbol: "embed", direction: "callers" }  ← 调用链
🔧 [2/20] getCallChain { symbol: "embedBatch", direction: "callers" }
🔧 [3/20] readFile { path: "src/rag/vectorStore.ts" } ← 读取受影响文件
🔧 [3/20] readFile { path: "src/agent/agent.ts" }
🔧 [3/20] readFile { path: "src/tools/searchKnowledge.ts" }
```

#### 🔴 必须修复 — 通过调用链发现竞态条件

**`getExtractor()` 存在竞态条件** — `buildSystemPrompt → search → embed` 和 `indexRules → indexDocument → embedBatch` 并发调用时，会重复加载模型导致内存泄漏。

```typescript
let extractor: FeatureExtractor | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (extractor) return extractor;          // ← 没有锁
  extractor = await pipeline(...);           // ← 第二个调用者也会进入这里
  return extractor;
}
```

**修复**：缓存 Promise 本身而非 resolved 后的值。

---

#### CodeGraph 识别的影响范围

```
src/llm/embedding.ts
├── embed() ────────► vectorStore.ts:search() ────────► agent.ts:buildSystemPrompt()
│                    │                                  ├── searchKnowledge.ts
│                    │
├── embedBatch() ───► vectorStore.ts:indexDocument() ──► indexDocument.ts
│                                                       └── indexRules.ts
└── getExtractor() — 被 embed() 和 embedBatch() 共享
```

| 严重程度 | 数量 |
|---------|------|
| 🔴 必须修复 | 1（通过调用链发现竞态条件） |
| 🟡 建议修复 | 4 |
| 🟢 可选优化 | 2 |

---

### 基础 Review

不带 CodeGraph 的简单 review：

```
$ bun run src/index.ts "review src/indexRules.ts"

🔧 [1/20] gitDiff { file: "src/indexRules.ts" }
🔧 [1/20] readFile { path: "src/indexRules.ts" }
🔧 [2/20] readFile { path: "src/rag/vectorStore.ts" }
🔧 [3/20] saveReview { codeType: "TypeScript+Bun CLI工具" }
```

| 严重程度 | 数量 |
|---------|------|
| 🔴 必须修复 | 3（非空断言、硬编码路径、裸 catch） |
| 🟡 建议修复 | 2 |
| 🟢 可选优化 | 2 |

## 代码图谱（影响分析）

基于 [CodeGraph](https://github.com/colbymchenry/codegraph)，支持跨文件影响分析和调用链分析。

### 能力

| 工具 | 说明 |
|------|------|
| `analyzeImpact` | 修改某个函数/变量会影响哪些代码 |
| `getCallChain` | 函数调用链（谁调用了它 / 它调用了谁） |

### 工作方式

- **自动同步**：Agent 启动时自动运行 `codegraph sync`（首次 `init`）
- **按项目持久化**：`.codegraph/` 索引存在目标项目下，跨 review 保留
- **CI 友好**：Agent 在目标项目目录运行，自动用 `process.cwd()` 定位项目

### 示例

```
$ npx codegraph impact embed

Impact of changing "embed" — 7 affected symbols:

src/llm/embedding.ts
  function    embed:23

src/rag/vectorStore.ts
  function    search:102

src/agent/agent.ts
  function    buildSystemPrompt:24
```

Agent review 时自动调用这些工具分析影响范围和调用链。

## 审查维度

| 优先级 | 维度 | 示例 |
|--------|------|------|
| 🔴 必须修复 | Bug、安全漏洞 | 空指针、SQL 注入、硬编码密钥 |
| 🟡 建议修复 | 性能、错误处理、规范 | N+1 查询、缺少 try-catch |
| 🟢 可选优化 | 可读性、可维护性 | 复杂逻辑拆分、死代码 |

## 技术栈

- **Runtime**: Bun
- **LLM**: DeepSeek API（通过 OpenAI SDK）
- **Embedding**: `@huggingface/transformers`（本地模型）
- **向量存储**: SQLite + sqlite-vec
- **代码图谱**: CodeGraph（依赖分析 + 影响分析）
- **参数校验**: zod
