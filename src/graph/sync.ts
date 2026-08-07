import { existsSync } from "fs";
import { join } from "path";

/**
 * 同步目标项目的 CodeGraph 索引
 * - 首次：codegraph init（全量构建）
 * - 后续：codegraph sync（增量更新）
 */
export async function syncGraph(projectPath: string): Promise<string> {
  const graphDir = join(projectPath, ".codegraph");

  try {
    if (existsSync(graphDir)) {
      // 已有索引，增量同步
      const proc = Bun.$`npx codegraph sync`.cwd(projectPath);
      const output = await proc.text();
      return output.trim();
    } else {
      // 首次，全量初始化
      const proc = Bun.$`npx codegraph init`.cwd(projectPath);
      const output = await proc.text();
      return output.trim();
    }
  } catch (err) {
    return `CodeGraph 同步失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}
