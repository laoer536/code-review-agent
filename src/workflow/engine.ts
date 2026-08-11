/**
 * Workflow 引擎
 *
 * Workflow = 确定性流程编排
 * Agent = LLM 驱动的推理 + 工具调用循环
 *
 * 方案 A：Workflow 内嵌 Agent Step
 */

/** Review 上下文，每个 step 读写 */
export interface ReviewContext {
  /** 用户问题或 review 指令 */
  question: string;
  /** 目标项目路径 */
  projectPath: string;
  /** 项目名称（git remote 推断） */
  projectName: string;

  /** syncGraph 结果 */
  graphStatus?: string;
  /** syncRules 结果 */
  rulesStatus?: string;
  /** git diff 内容 */
  diff?: string;
  /** 组装好的 system prompt */
  systemPrompt?: string;
  /** Agent 最终 review 结果 */
  review?: string;
}

/** Workflow Step：接收 context，返回更新后的 context */
export type WorkflowStep = (ctx: ReviewContext) => Promise<ReviewContext>;

/**
 * 顺序执行 workflow steps
 * 每个 step 接收上一步的输出，返回更新后的 context
 */
export async function runWorkflow(
  steps: WorkflowStep[],
  init: ReviewContext,
): Promise<ReviewContext> {
  let ctx = init;
  for (const step of steps) {
    ctx = await step(ctx);
  }
  return ctx;
}
