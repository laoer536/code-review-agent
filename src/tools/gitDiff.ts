import { z } from "zod";

export const gitDiffSchema = z.object({
  file: z.string().optional().describe("指定文件路径，不传则返回全部变更"),
  staged: z.boolean().optional().default(false).describe("是否查看暂存区变更"),
});

export async function gitDiff(input: { file?: string; staged?: boolean }): Promise<string> {
  const args = ["diff"];
  if (input.staged) args.push("--staged");
  if (input.file) args.push("--", input.file);

  const proc = Bun.$`git ${args}`;
  const output = await proc.text();

  if (!output.trim()) {
    return "没有检测到代码变更";
  }

  return output;
}
