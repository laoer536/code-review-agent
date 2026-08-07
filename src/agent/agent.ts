import { chat } from '../llm/client';
import { systemPrompt } from './prompt';
import { tools, toolDefinitions, validateToolArgs } from '../tools';
import { getProjectName, getCodeType } from '../memory/memory';
import { search } from '../rag/vectorStore';
import { syncGraph } from '../graph/sync';
import { syncRules } from '../graph/syncRules';
import type { ChatCompletionMessageParam } from './types';

const MAX_ITERATIONS = 20;

type ToolRegistry = typeof tools;
type ToolName = keyof ToolRegistry;

function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const validated = validateToolArgs(name, args);
  const toolFn = tools[name as ToolName];

  if (!toolFn) {
    return Promise.reject(new Error(`未知工具: ${name}`));
  }

  return (toolFn as (input: typeof validated) => Promise<string>)(validated);
}

async function buildSystemPrompt(project: string, question: string): Promise<string> {
  let prompt = systemPrompt;

  // 注入技术栈记忆
  const codeType = await getCodeType(project);
  if (codeType) {
    prompt += `\n\n## 项目记忆\n当前项目 [${project}] 的技术栈：${codeType}。请用该技术栈的最佳实践和常见问题来审查。`;
  }

  // RAG：检索相关知识
  try {
    const results = await search(question, 3);
    if (results.length > 0) {
      const knowledge = results.map((r) => `- [${r.source}] ${r.text}`).join('\n');
      prompt += `\n\n## 参考知识\n以下是与本次 review 相关的知识库内容，请参考：\n${knowledge}`;
    }
  } catch {
    // 知识库为空或未初始化，忽略
  }

  return prompt;
}

export async function runAgent(question: string): Promise<string> {
  if (!question?.trim()) {
    return '请提供要审查的内容';
  }

  const project = await getProjectName();

  // 同步 CodeGraph 索引（首次 init，后续 sync）
  console.log('📊 同步代码图谱...');
  const graphResult = await syncGraph(process.cwd());
  console.log(graphResult);

  // 索引目标项目的规则文件
  console.log('📚 索引规则...');
  const rulesResult = await syncRules(process.cwd());
  console.log(rulesResult);

  const system = await buildSystemPrompt(project, question);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    { role: 'user', content: question },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await chat(messages, toolDefinitions);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      return response.content ?? '';
    }

    messages.push(response as ChatCompletionMessageParam);

    for (const call of response.tool_calls) {
      if (call.type !== 'function') continue;

      const name = call.function.name;
      let rawArgs: Record<string, unknown>;

      try {
        rawArgs = JSON.parse(call.function.arguments);
      } catch {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `参数解析失败: ${call.function.arguments}`,
        });
        continue;
      }

      // 自动注入 projectPath
      if (name === 'analyzeImpact' || name === 'getCallChain') {
        rawArgs.projectPath = rawArgs.projectPath || process.cwd();
      }

      console.log(`🔧 [${i + 1}/${MAX_ITERATIONS}] 调用工具: ${name}`, rawArgs);

      try {
        const result = await callTool(name, rawArgs);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ 工具调用失败: ${name}`, errorMsg);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `工具调用出错: ${errorMsg}`,
        });
      }
    }
  }

  return '达到最大迭代次数，停止分析';
}
