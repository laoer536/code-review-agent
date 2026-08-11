import { chat } from '../llm/client';
import { tools, toolDefinitions, validateToolArgs } from '../tools';
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

/**
 * 纯 Agent 推理循环
 * 接收已组装好的 system prompt 和用户消息，执行 LLM + 工具调用循环
 * 不负责初始化（syncGraph、syncRules 等由 Workflow Step 处理）
 */
export async function runAgentLoop(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
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
