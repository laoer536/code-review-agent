import { z } from "zod";

export const readFileSchema = z.object({
  path: z.string().describe("要读取的文件路径"),
});

export async function readFile(input: { path: string }): Promise<string> {
  const file = Bun.file(input.path);

  if (!(await file.exists())) {
    return `文件不存在: ${input.path}`;
  }

  return await file.text();
}
