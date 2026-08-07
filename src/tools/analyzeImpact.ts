import { z } from 'zod';

export const analyzeImpactSchema = z.object({
  symbol: z.string().describe('函数名、类名或变量名，如 runAgent、embed、readFile'),
  projectPath: z.string().describe('目标项目根目录的绝对路径'),
});

export async function analyzeImpact(input: { symbol: string; projectPath: string }): Promise<string> {
  try {
    const proc = Bun.$`npx codegraph impact ${input.symbol}`.cwd(input.projectPath);
    const output = await proc.text();

    if (!output.trim() || output.includes('not found')) {
      return `未找到符号 "${input.symbol}"，请检查拼写或确认该符号已导出`;
    }

    return output.trim();
  } catch (err) {
    return `分析失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}
