import { Glob } from 'bun';
import { join } from 'path';
import { existsSync } from 'fs';
import { indexDocument } from '../rag/vectorStore';

const AGENT_ROOT = join(import.meta.dir, '../..');
const BUILTIN_RULES_DIR = join(AGENT_ROOT, 'rules');

/**
 * 索引单个目录下的规则文件
 */
async function indexRulesDir(dirPath: string, prefix: string): Promise<{ count: number; total: number }> {
  if (!existsSync(dirPath)) return { count: 0, total: 0 };

  const glob = new Glob('**/*.{md,txt,json,yaml,yml}');
  let total = 0;
  let count = 0;

  for await (const file of glob.scan({ cwd: dirPath, onlyFiles: true })) {
    const fullPath = join(dirPath, file);
    const text = await Bun.file(fullPath).text();
    const source = prefix ? `${prefix}/${file}` : file;
    const chunks = await indexDocument(text, source);
    total += chunks;
    count++;
  }

  return { count, total };
}

/**
 * 自动索引规则文件
 * 1. 内置规则（CLI 自带的通用规则）
 * 2. 用户项目规则（.code-review/rules/ 或 RULES_DIR 环境变量）
 */
export async function syncRules(projectPath: string): Promise<string> {
  try {
    const results: string[] = [];

    // 内置规则
    const builtin = await indexRulesDir(BUILTIN_RULES_DIR, 'builtin');
    if (builtin.count > 0) {
      results.push(`内置规则: ${builtin.count} 个文件, ${builtin.total} 个分块`);
    }

    // 用户项目规则
    const userRulesDir = join(projectPath, process.env.RULES_DIR || '.code-review/rules');
    const user = await indexRulesDir(userRulesDir, '');
    if (user.count > 0) {
      results.push(`项目规则: ${user.count} 个文件, ${user.total} 个分块`);
    } else {
      results.push(`未找到项目规则 (${userRulesDir})，仅使用内置规则`);
    }

    return results.join(' | ');
  } catch (err) {
    return `规则索引失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}
