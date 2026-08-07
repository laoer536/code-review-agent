import { z } from "zod";
import { indexDocument } from "../rag/vectorStore";

export const indexDocumentSchema = z.object({
  text: z.string().describe("要索引的文本内容"),
  source: z.string().describe("来源标识，如文件路径或文档名称"),
});

export async function indexDocumentTool(input: {
  text: string;
  source: string;
}): Promise<string> {
  const count = await indexDocument(input.text, input.source);
  return `已索引 [${input.source}]，共 ${count} 个分块`;
}
