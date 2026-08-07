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
