import { join, dirname } from 'path';

/**
 * 解析 Agent 根目录
 * - 编译后：binary 所在目录
 * - 源码运行：项目根目录（src/ 的上两级）
 */
function resolveAgentRoot(): string {
  // 环境变量优先（CI 中可手动指定）
  if (process.env.AGENT_ROOT) return process.env.AGENT_ROOT;

  // 编译后的 binary：argv[0] 是 binary 路径
  if (process.argv[0] && !process.argv[0].includes('bun')) {
    return dirname(process.argv[0]);
  }

  // 源码运行：当前文件在 src/agent/root.ts，根目录是 ../..
  return join(import.meta.dir, '../..');
}

/** Agent 根目录（rules/ 所在位置） */
export const AGENT_ROOT = resolveAgentRoot();

/** 内置规则目录 */
export const BUILTIN_RULES_DIR = join(AGENT_ROOT, 'rules');

/** 项目运行时数据目录（cwd 下） */
export const PROJECT_DATA_DIR = join(process.cwd(), '.code-review-agent');
