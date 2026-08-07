import { z } from 'zod';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

import { listFiles, listFilesSchema } from './listFiles';
import { readFile, readFileSchema } from './readFile';
import { gitDiff, gitDiffSchema } from './gitDiff';
import { saveReview, saveReviewSchema } from './saveReview';
import { indexDocumentTool, indexDocumentSchema } from './indexDocument';
import { searchKnowledge, searchKnowledgeSchema } from './searchKnowledge';
import { analyzeImpact, analyzeImpactSchema } from './analyzeImpact';
import { getCallChain, getCallChainSchema } from './getCallChain';

// 工具注册表
export const tools = {
  listFiles,
  readFile,
  gitDiff,
  saveReview,
  indexDocument: indexDocumentTool,
  searchKnowledge,
  analyzeImpact,
  getCallChain,
};

// zod schema 注册表（用于参数校验）
export const toolSchemas = {
  listFiles: listFilesSchema,
  readFile: readFileSchema,
  gitDiff: gitDiffSchema,
  saveReview: saveReviewSchema,
  indexDocument: indexDocumentSchema,
  searchKnowledge: searchKnowledgeSchema,
  analyzeImpact: analyzeImpactSchema,
  getCallChain: getCallChainSchema,
};

// 工具描述
const toolDescriptions: Record<string, string> = {
  listFiles: '查看项目文件列表，返回目录下所有文件路径',
  readFile: '读取指定文件的完整内容',
  gitDiff: '查看 git 代码变更，用于了解本次修改了哪些内容',
  saveReview: '记住本次 review 的代码类型，方便下次更精准地审查',
  indexDocument: '将文本或文件内容索引到知识库，支持后续语义搜索',
  searchKnowledge: '从知识库中语义搜索相关规则和知识，用于 review 参考',
  analyzeImpact: '分析修改某个函数/变量会影响哪些其他代码（影响范围分析）',
  getCallChain: '查看函数的调用链——谁调用了它（callers）或它调用了谁（callees）',
};

// 从 zod schema 生成 OpenAI tool definitions
function buildToolDefinitions(): ChatCompletionTool[] {
  return Object.entries(toolSchemas).map(([name, schema]) => ({
    type: 'function' as const,
    function: {
      name,
      description: toolDescriptions[name] ?? name,
      parameters: z.toJSONSchema(schema),
    },
  }));
}

export const toolDefinitions = buildToolDefinitions();

// 参数校验函数
export function validateToolArgs(name: string, args: Record<string, unknown>) {
  const schema = toolSchemas[name as keyof typeof toolSchemas];
  if (!schema) {
    throw new Error(`未知工具: ${name}`);
  }
  return schema.parse(args);
}
