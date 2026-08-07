import { runAgent } from './agent/agent';

/**
 * 获取 MR 目标分支
 * 优先从 CI 环境变量读取，其次检测 origin/main 或 origin/master
 */
async function getTargetBranch(): Promise<string | null> {
  // CI 环境变量
  const ciTarget =
    process.env.GITHUB_BASE_REF || // GitHub Actions
    process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME || // GitLab CI
    process.env.TARGET_BRANCH || // 通用
    null;

  if (ciTarget) return ciTarget;

  // 本地：检测 origin/main 或 origin/master
  for (const branch of ['origin/main', 'origin/master']) {
    try {
      await Bun.$`git rev-parse ${branch}`.quiet();
      return branch;
    } catch {}
  }

  return null;
}

/**
 * 获取 MR 变更（当前分支 vs 目标分支）
 */
async function getMRChanges(): Promise<string | null> {
  try {
    const branch = (await Bun.$`git rev-parse --abbrev-ref HEAD`.text()).trim();
    const target = await getTargetBranch();

    if (!target) {
      // 没有目标分支，看最近一次 commit
      const diff = await Bun.$`git diff HEAD~1 HEAD --stat`.text();
      return diff.trim() || null;
    }

    // 在目标分支上，看最近一次 commit
    if (branch === target.replace('origin/', '')) {
      const diff = await Bun.$`git diff HEAD~1 HEAD --stat`.text();
      return diff.trim() || null;
    }

    // 在 feature 分支上，看相对于目标分支的变更
    const diff = await Bun.$`git diff ${target}...HEAD --stat`.text();
    return diff.trim() || null;
  } catch {
    return null;
  }
}

async function getStagedChanges(): Promise<string | null> {
  try {
    const diff = await Bun.$`git diff --staged --stat`.text();
    return diff.trim() || null;
  } catch {
    return null;
  }
}

async function getUnstagedChanges(): Promise<string | null> {
  try {
    const diff = await Bun.$`git diff --stat`.text();
    return diff.trim() || null;
  } catch {
    return null;
  }
}

async function buildDefaultQuestion(): Promise<string | null> {
  const mr = await getMRChanges();
  if (mr) return `请 review 本次 MR 的代码变更：\n\n${mr}`;

  const staged = await getStagedChanges();
  if (staged) return `请 review 暂存区的代码变更：\n\n${staged}`;

  const unstaged = await getUnstagedChanges();
  if (unstaged) return `请 review 未暂存的代码变更：\n\n${unstaged}`;

  return null;
}

const args = process.argv.slice(2).join(' ');
const question = args || (await buildDefaultQuestion());

if (!question) {
  console.log(`
🤖 Code Review Agent

用法:
  bun run src/index.ts                        自动 review 本次 MR 的变更
  bun run src/index.ts "review 我的代码"       自定义 review 任务
  bun run src/index.ts "检查 src/ 目录的代码质量"

示例:
  bun run src/index.ts                        # 审查本次 MR 变更（分支 vs 目标分支）
  bun run src/index.ts "帮我 review 当前项目的代码变更"
`);
  process.exit(0);
}

console.log('🔍 正在分析...\n');

const answer = await runAgent(question);

console.log('\n📋 Review 结果:\n');
console.log(answer);
