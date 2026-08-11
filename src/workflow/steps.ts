/**
 * Workflow Steps
 *
 * 确定性 Step + Agent Step，按顺序组成 Review 流程
 */

import { syncGraph as syncGraphFn } from '../graph/sync';
import { syncRules as syncRulesFn } from '../rag/syncRules';
import { systemPrompt } from '../agent/prompt';
import { getCodeType } from '../memory/memory';
import { search } from '../rag/vectorStore';
import { runAgentLoop } from '../agent/agent';
import type { WorkflowStep } from './engine';

// ---- 确定性 Step ----

/** Step 1: 同步 CodeGraph 索引 */
export const stepSyncGraph: WorkflowStep = async (ctx) => {
  console.log('📊 同步代码图谱...');
  try {
    const status = await syncGraphFn(ctx.projectPath);
    console.log(status);
    return { ...ctx, graphStatus: status };
  } catch (err) {
    console.warn('⚠️ CodeGraph 同步失败，跳过图谱功能:', err);
    return ctx;
  }
};

/** Step 2: 索引规则文件 */
export const stepSyncRules: WorkflowStep = async (ctx) => {
  console.log('📚 索引规则...');
  try {
    const status = await syncRulesFn(ctx.projectPath);
    console.log(status);
    return { ...ctx, rulesStatus: status };
  } catch (err) {
    console.warn('⚠️ 规则索引失败，跳过规则功能:', err);
    return ctx;
  }
};

/** Step 3: 构建 system prompt */
export const stepBuildPrompt: WorkflowStep = async (ctx) => {
  let prompt = systemPrompt;

  // 注入技术栈记忆
  const codeType = await getCodeType(ctx.projectName);
  if (codeType) {
    prompt += `\n\n## 项目记忆\n当前项目 [${ctx.projectName}] 的技术栈：${codeType}。请用该技术栈的最佳实践和常见问题来审查。`;
  }

  // 注入代码图谱状态
  if (ctx.graphStatus) {
    prompt += `\n\n## 代码图谱\n${ctx.graphStatus}\n代码图谱已就绪，你可以使用 analyzeImpact 分析修改的影响范围，使用 getCallChain 查看函数调用链。`;
  }

  // 注入可用规则
  if (ctx.rulesStatus) {
    prompt += `\n\n## 可用规则\n${ctx.rulesStatus}\n规则已索引，你可以用 searchKnowledge 搜索相关规则作为审查参考。`;
  }

  // RAG：检索相关知识
  try {
    const results = await search(ctx.question, 3);
    if (results.length > 0) {
      const knowledge = results.map((r) => `- [${r.source}] ${r.text}`).join('\n');
      prompt += `\n\n## 参考知识\n以下是与本次 review 相关的知识库内容，请参考：\n${knowledge}`;
    }
  } catch {
    // 知识库为空或未初始化，忽略
  }

  return { ...ctx, systemPrompt: prompt };
};

// ---- Agent Step ----

/** Step 4: Agent 推理 + 工具调用（LLM 驱动） */
export const stepAgentReview: WorkflowStep = async (ctx) => {
  if (!ctx.systemPrompt) {
    return { ...ctx, review: '错误：system prompt 未构建' };
  }

  const review = await runAgentLoop(ctx.systemPrompt, ctx.question);
  return { ...ctx, review };
};
