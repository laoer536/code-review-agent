# Code Review Agent

An AI-powered code review agent that supports automatic change analysis, semantic rule retrieval via RAG, and project tech stack memory.

[中文文档](./README_CN.md)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Agent Loop                        │
│                                                      │
│  User Query → Build Prompt → LLM Reasoning → Tools   │
│                ↑                              │      │
│                └──────── Multi-turn Loop ─────┘      │
│                                                      │
│  Tools:                                              │
│    listFiles        Browse project file structure     │
│    readFile         Read file content                 │
│    gitDiff          View git changes                  │
│    saveReview       Remember project tech stack       │
│    indexDocument    Index rules into knowledge base   │
│    searchKnowledge  Semantic search knowledge base    │
│                                                      │
│  Memory:                                             │
│    memory           Project tech stack (JSON)         │
│    RAG              Rule knowledge base (SQLite+vec)  │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### Install

```bash
bun install
```

### Configure Environment

Create a `.env` file:

```bash
# LLM (required)
DEEPSEEK_API_KEY=sk-xxx

# Review output language (optional, default: 中文)
# Supports: 中文, English, 日本語, 한국어, etc.
REVIEW_LANGUAGE=中文

# Embedding model download (first run only, cached afterwards)
# Use mirror for China mainland
HF_ENDPOINT=https://hf-mirror.com
# Or use proxy
# https_proxy=http://127.0.0.1:7890
# http_proxy=http://127.0.0.1:7890

# MR target branch (auto-detected in CI, optional for local)
# GitHub Actions: auto-reads GITHUB_BASE_REF
# GitLab CI: auto-reads CI_MERGE_REQUEST_TARGET_BRANCH_NAME
# TARGET_BRANCH=main
```

### Usage

```bash
# No args: auto-detect MR changes and review
bun run src/index.ts

# Custom review task
bun run src/index.ts "review my code changes"

# Review specific directory
bun run src/index.ts "check code quality in src/agent/"
```

Without arguments, the priority is:
1. MR changes (branch vs target branch via CI env vars)
2. Staged changes (`git diff --staged`)
3. Unstaged changes (`git diff`)
4. Latest commit (`git diff HEAD~1`)

## GitLab CI Integration

### Build & Publish CLI

#### Option 1: Build Locally

```bash
# Build for current platform
bun build src/index.ts --compile --outfile dist/code-review

# Build for Linux CI
bun build src/index.ts --compile --target=bun-linux-x64 --outfile dist/code-review-linux-x64

# Build for macOS
bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile dist/code-review-darwin-arm64
```

#### Option 2: Publish to GitHub Releases

Create `.github/workflows/release.yml`:

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

Then:
```bash
git tag v1.0.0
git push --tags
# Binary auto-published to GitHub Releases
```

#### Option 3: Publish to Private npm Registry

```bash
# Build
bun build src/index.ts --compile --outfile dist/code-review

# Package.json: add bin field
# "bin": { "code-review": "./dist/code-review" }

# Publish to private registry
npm publish --registry https://your-private-registry.com

# CI usage
npx --registry https://your-private-registry.com code-review
```

#### Option 4: Self-Hosted (GitLab Package Registry / Nexus / Minio)

```bash
# Build
bun build src/index.ts --compile --target=bun-linux-x64 --outfile code-review-linux-x64

# Upload to GitLab Generic Packages
curl --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --upload-file code-review-linux-x64 \
  "https://gitlab.com/api/v4/projects/$PROJECT_ID/packages/generic/code-review/v1.0.0/code-review-linux-x64"

# CI usage
curl -L -o code-review \
  "https://gitlab.com/api/v4/projects/$PROJECT_ID/packages/generic/code-review/v1.0.0/code-review-linux-x64"
chmod +x code-review
```

#### Option 5: Docker Image

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
# Build & push
docker build -t your-registry.com/code-review:v1 .
docker push your-registry.com/code-review:v1

# CI usage
docker run --rm -e DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY your-registry.com/code-review:v1
```

### Step 1: Prepare Your Project

Add review rules to your project repository:

```
your-project/
├── src/
├── .gitlab-ci.yml
└── .code-review/                  # Review config + rules
    ├── rules/
    │   ├── typescript.md          # Your team's TS standards
    │   ├── security.md            # Security rules
    │   └── project-specific.md    # Project-specific rules
```

Configure via environment variables in `.gitlab-ci.yml`:

```yaml
variables:
  RULES_DIR: .code-review/rules      # Rules directory (default)
  REVIEW_LANGUAGE: 中文               # Output language (default)
```

Example `.code-review/rules/typescript.md`:

```markdown
# TypeScript Standards

## Must Fix
- No `any` type, use `unknown` or specific types
- No non-null assertion `!`, use `?.` and `??`

## Suggested
- Functions must have explicit return types
- Use `import type` for type-only imports
```

### Step 2: Set Up GitLab CI/CD Variables

Go to **Settings → CI/CD → Variables**, add:

| Variable | Value | Protected |
|----------|-------|-----------|
| `DEEPSEEK_API_KEY` | `sk-xxx` | Yes |

### Step 3: Add `.gitlab-ci.yml`

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
      - .codegraph/                  # CodeGraph index (persistent)
      - .cache/huggingface/          # Embedding model (cached)
  before_script:
    - apt-get update && apt-get install -y curl git
    # Download CLI binary to cached directory
    - curl -L -o .code-review-cli https://github.com/your-org/code-review-agent/releases/latest/download/code-review-linux-x64
    - chmod +x .code-review-cli
  script:
    - ./.code-review-cli             # Auto-detects MR changes
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

### Step 4: Create MR → Auto Review

When you create a Merge Request, the pipeline automatically:

```
1. Downloads CLI binary (cached)
2. Syncs CodeGraph index (cached)
3. Indexes your rules from .code-review/rules/
4. Analyzes MR changes (branch vs target branch)
5. Outputs review results in pipeline logs
```

### Rules Management

Rules live in your project repo. To update:

```bash
# Edit rules
vim .code-review/rules/typescript.md

# Commit and push
git add .code-review/rules/
git commit -m "chore: update review rules"
git push
```

Next MR will automatically use the updated rules.

### Full Example

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

## Project Structure

```
src/
├── index.ts                  # Review CLI entry
├── indexRules.ts             # Rule indexing CLI entry
├── agent/
│   ├── agent.ts              # Agent Loop (multi-turn tool calling)
│   ├── prompt.ts             # System Prompt (review dimensions + output format)
│   └── types.ts              # Type definitions
├── llm/
│   ├── client.ts             # LLM chat client (DeepSeek API)
│   └── embedding.ts          # Embedding client (local model all-MiniLM-L6-v2)
├── rag/
│   └── vectorStore.ts        # Vector store (SQLite + sqlite-vec)
├── memory/
│   └── memory.ts             # Project tech stack memory (JSON file)
└── tools/
    ├── index.ts              # Tool registration + zod validation
    ├── listFiles.ts          # Browse file list
    ├── readFile.ts           # Read file content
    ├── gitDiff.ts            # View git diff
    ├── saveReview.ts         # Save tech stack memory
    ├── indexDocument.ts      # Index document to knowledge base
    └── searchKnowledge.ts    # Semantic search knowledge base

rules/                        # Example rule files (customizable)
├── general.md                # General standards
├── typescript.md             # TypeScript standards
└── security.md               # Security standards
```

## Core Modules

### Agent Loop

Classic ReAct loop (Reasoning + Acting):

1. User query + system prompt → send to LLM
2. LLM returns tool_calls → execute tools → append results to messages
3. Repeat until LLM returns plain text (or max 20 iterations)

### Memory

Isolated by project, remembers each project's tech stack:

```json
{
  "code-review-agent": {
    "codeType": "TypeScript+Bun CLI工具",
    "lastReviewed": "2026-08-06"
  }
}
```

- Project name auto-detected from `git remote`
- Auto-injected into system prompt during review

### RAG (Knowledge Base)

Vectorized rule storage with semantic retrieval:

- **Embedding**: `@huggingface/transformers` + `Xenova/all-MiniLM-L6-v2` (384 dimensions, local)
- **Storage**: SQLite + sqlite-vec (cosine similarity search)
- **Chunking**: Paragraph-based, max 1000 chars per chunk

Agent automatically searches the knowledge base at startup and injects relevant rules into the system prompt.

### Tool System

All tools use zod schema for parameter validation:

```ts
export const readFileSchema = z.object({
  path: z.string().describe("File path to read"),
});

export async function readFile(input: { path: string }): Promise<string> {
  // ...
}
```

## Rule Knowledge Base Management

Users can customize review rules and index them into the knowledge base.

### Rule File Format

Create Markdown files in the `rules/` directory:

```
rules/
├── general.md        # General standards
├── typescript.md     # TypeScript standards
├── security.md       # Security standards
└── react.md          # React standards (custom)
```

### Index Rules

```bash
# Index entire directory
bun run src/indexRules.ts index ./rules

# Index single file
bun run src/indexRules.ts index ./rules/typescript.md
```

### Manage Knowledge Base

```bash
# List indexed rules
bun run src/indexRules.ts list

# Remove specific rule
bun run src/indexRules.ts remove typescript.md

# Clear all rules
bun run src/indexRules.ts clear
```

### Workflow

```
1. Write rule files (Markdown)
2. Run index command to store in vector DB
3. Agent automatically retrieves relevant rules during review
4. Re-index after updating rules
```

## Demo

### With Impact Analysis (CodeGraph)

Review `src/llm/embedding.ts` with cross-file impact analysis:

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

#### 🔴 Must Fix — Race condition found via call chain

**`getExtractor()` has a race condition** — concurrent calls from `buildSystemPrompt → search → embed` and `indexRules → indexDocument → embedBatch` can trigger duplicate model loading.

```typescript
let extractor: FeatureExtractor | null = null;

async function getExtractor(): Promise<FeatureExtractor> {
  if (extractor) return extractor;          // ← no lock
  extractor = await pipeline(...);           // ← second caller also enters here
  return extractor;
}
```

**Fix**: Cache the Promise itself instead of the resolved value.

---

#### Impact scope identified by CodeGraph

```
src/llm/embedding.ts
├── embed() ────────► vectorStore.ts:search() ────────► agent.ts:buildSystemPrompt()
│                    │                                  ├── searchKnowledge.ts
│                    │
├── embedBatch() ───► vectorStore.ts:indexDocument() ──► indexDocument.ts
│                                                       └── indexRules.ts
└── getExtractor() — shared by embed() and embedBatch()
```

| Severity | Count |
|----------|-------|
| 🔴 Must Fix | 1 (race condition via call chain) |
| 🟡 Suggested | 4 |
| 🟢 Optional | 2 |

---

### Basic Review

Simple review without CodeGraph:

```
$ bun run src/index.ts "review src/indexRules.ts"

🔧 [1/20] gitDiff { file: "src/indexRules.ts" }
🔧 [1/20] readFile { path: "src/indexRules.ts" }
🔧 [2/20] readFile { path: "src/rag/vectorStore.ts" }
🔧 [3/20] saveReview { codeType: "TypeScript+Bun CLI工具" }
```

| Severity | Count |
|----------|-------|
| 🔴 Must Fix | 3 (non-null assertion, hardcoded path, bare catch) |
| 🟡 Suggested | 2 |
| 🟢 Optional | 2 |

## Review Dimensions

| Priority | Dimension | Examples |
|----------|-----------|----------|
| 🔴 Must Fix | Bugs, Security | Null pointer, SQL injection, hardcoded secrets |
| 🟡 Suggested | Performance, Error handling | N+1 queries, missing try-catch |
| 🟢 Optional | Readability, Maintainability | Complex logic refactoring, dead code |

## Code Graph (Impact Analysis)

Powered by [CodeGraph](https://github.com/colbymchenry/codegraph), the agent can analyze cross-file impact and call chains.

### Capabilities

| Tool | Description |
|------|-------------|
| `analyzeImpact` | What code is affected by changing a function/variable |
| `getCallChain` | Who calls a function (callers) / what it calls (callees) |

### How It Works

- **Auto-sync**: Agent automatically runs `codegraph sync` (or `init` on first run) at startup
- **Persistent**: `.codegraph/` index is stored in the target project, survives across reviews
- **CI-friendly**: Agent runs from the target project directory, `process.cwd()` is used automatically

### Example

```
$ npx codegraph impact embed

Impact of changing "embed" — 7 affected symbols:

src/llm/embedding.ts
  function    embed:23

src/rag/vectorStore.ts
  function    search:102
  file        vectorStore.ts:1

src/agent/agent.ts
  function    buildSystemPrompt:24
```

The agent automatically uses these tools during review to identify impact scope and call chains.

## Tech Stack

- **Runtime**: Bun
- **LLM**: DeepSeek API (via OpenAI SDK)
- **Embedding**: `@huggingface/transformers` (local model)
- **Vector Store**: SQLite + sqlite-vec
- **Code Graph**: CodeGraph (dependency analysis + impact analysis)
- **Validation**: zod
