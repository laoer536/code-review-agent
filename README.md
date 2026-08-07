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

Real review output for `src/indexRules.ts`:

```
$ bun run src/index.ts "review src/indexRules.ts"

🔍 Analyzing...

🔧 [1/20] Tool: gitDiff { file: "src/indexRules.ts", staged: false }
🔧 [1/20] Tool: readFile { path: "src/indexRules.ts" }
🔧 [2/20] Tool: readFile { path: "src/rag/vectorStore.ts" }
🔧 [2/20] Tool: readFile { path: "src/llm/embedding.ts" }
🔧 [3/20] Tool: saveReview { codeType: "TypeScript+Bun CLI工具" }

📋 Review Result:
```

### 🔴 Must Fix

**1. `indexFile:38` — Non-null assertion `!` violates TypeScript standards**

```typescript
const name = filePath.split("/").pop()!;
```

Use `path.basename()` instead for cross-platform safety.

---

**2. `indexDir:48` — Hardcoded `/` in path concatenation**

```typescript
const fullPath = `${dirPath}/${file}`;
```

Use `path.join()` for cross-platform compatibility.

---

**3. `index case:68-73` — Bare catch swallows all exceptions**

```typescript
try {
  const stat = await import("fs/promises").then(fs => fs.stat(target));
} catch {
  console.error(`❌ Path not found: ${target}`);
}
```

All failures show "path not found" regardless of actual cause. Use static import and detailed error handling.

---

### 🟡 Suggested Fix

**4. `indexDir:49` — No per-file error tolerance**

```typescript
const text = await Bun.file(fullPath).text();  // No check
```

One file failure breaks the entire loop. Add try-catch per file.

---

**5. Line 59 — Misleading log for non-embedding commands**

```typescript
console.log("⏳ Loading embedding model...\n");
```

`list`, `remove`, `clear` commands don't need embedding but still print this.

---

### 🟢 Optional Optimization

**6. `embedBatch` is serial, not truly batch**

Function name suggests batch processing but runs sequentially.

---

**7. Missing `--help` / `-h` flag support**

---

| Severity | Count |
|----------|-------|
| 🔴 Must Fix | 3 |
| 🟡 Suggested | 2 |
| 🟢 Optional | 2 |

## Review Dimensions

| Priority | Dimension | Examples |
|----------|-----------|----------|
| 🔴 Must Fix | Bugs, Security | Null pointer, SQL injection, hardcoded secrets |
| 🟡 Suggested | Performance, Error handling | N+1 queries, missing try-catch |
| 🟢 Optional | Readability, Maintainability | Complex logic refactoring, dead code |

## Tech Stack

- **Runtime**: Bun
- **LLM**: DeepSeek API (via OpenAI SDK)
- **Embedding**: `@huggingface/transformers` (local model)
- **Vector Store**: SQLite + sqlite-vec
- **Validation**: zod
