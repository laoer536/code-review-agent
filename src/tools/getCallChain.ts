import { z } from 'zod';

export const getCallChainSchema = z.object({
  symbol: z.string().describe('函数名或方法名，如 runAgent、embed、readFile'),
  direction: z
    .enum(['callers', 'callees'])
    .optional()
    .default('callers')
    .describe('callers=谁调用了它，callees=它调用了谁'),
  projectPath: z.string().describe('目标项目根目录的绝对路径'),
});

export async function getCallChain(input: {
  symbol: string;
  direction?: 'callers' | 'callees';
  projectPath: string;
}): Promise<string> {
  try {
    const dir = input.direction ?? 'callers';
    const proc = Bun.$`npx codegraph ${dir} ${input.symbol}`.cwd(input.projectPath);
    const output = await proc.text();

    if (!output.trim() || output.includes('not found')) {
      return `未找到符号 "${input.symbol}"，请检查拼写或确认该符号已导出`;
    }

    return output.trim();
  } catch (err) {
    return `查询失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}
