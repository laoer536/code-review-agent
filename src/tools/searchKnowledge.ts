import { z } from 'zod';
import { search } from '../rag/vectorStore';

export const searchKnowledgeSchema = z.object({
  query: z.string().describe('搜索内容，用自然语言描述你想找的规则或知识'),
  topK: z.number().optional().default(3).describe('返回结果数量，默认 3'),
});

export async function searchKnowledge(input: { query: string; topK?: number }): Promise<string> {
  const results = await search(input.query, input.topK ?? 3);

  if (results.length === 0) {
    return '知识库中没有找到相关内容';
  }

  return results
    .map((r, i) => `### 结果 ${i + 1}（来源: ${r.source}，相似度: ${r.score.toFixed(2)}）\n${r.text}`)
    .join('\n\n---\n\n');
}
