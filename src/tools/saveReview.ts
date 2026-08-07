import { z } from "zod";
import { getProjectName, saveCodeType } from "../memory/memory";

export const saveReviewSchema = z.object({
  codeType: z
    .string()
    .describe(
      "技术栈描述，格式：语言+场景+框架（如有）。示例：TypeScript+React前端、TypeScript+Bun CLI脚本、Java+Spring后端。TypeScript 必须标注使用场景"
    ),
});

export async function saveReview(input: { codeType: string }): Promise<string> {
  const project = await getProjectName();
  await saveCodeType(project, input.codeType);
  return `已记住项目 [${project}] 的技术栈: ${input.codeType}`;
}
