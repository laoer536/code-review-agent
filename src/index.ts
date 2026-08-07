import { runAgent } from "./agent/agent";

const question = process.argv.slice(2).join(" ");

if (!question) {
  console.log(`
🤖 Code Review Agent

用法:
  bun run src/index.ts "review 我的代码"
  bun run src/index.ts "检查 src/ 目录的代码质量"
  bun run src/index.ts "审查最近的 git 变更"

示例:
  bun run src/index.ts "帮我 review 当前项目的代码变更"
`);
  process.exit(0);
}

console.log("🔍 正在分析...\n");

const answer = await runAgent(question);

console.log("\n📋 Review 结果:\n");
console.log(answer);
