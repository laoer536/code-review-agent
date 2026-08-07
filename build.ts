/**
 * CLI 打包脚本 — 源码包
 * bun run build.ts [--outfile=dist/code-review-agent]
 */
import { parseArgs } from 'util';
import { cpSync, mkdirSync, existsSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    outfile: { type: 'string', default: 'dist/code-review-agent' },
  },
});

const outfile = values.outfile!;

console.log(`🔨 打包 CLI → ${outfile}`);

if (!existsSync(outfile)) {
  mkdirSync(outfile, { recursive: true });
}

// 1. 复制源码 + 规则 + 配置
const files = ['src', 'rules', 'package.json', 'bun.lock'];
for (const file of files) {
  const src = join(import.meta.dir, file);
  if (existsSync(src)) {
    cpSync(src, join(outfile, file), { recursive: true });
    console.log(`📋 ${file}`);
  }
}

// 2. 创建启动脚本
const wrapper = `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
CALLER_DIR="$(pwd)"

# 首次运行自动安装依赖
if [ ! -d "\${DIR}/node_modules" ]; then
  echo "📦 首次运行，安装依赖..."
  (cd "\${DIR}" && bun install)
fi

# 在调用者目录运行 review
cd "\${CALLER_DIR}"
exec bun run "\${DIR}/src/index.ts" "$@"
`;
const wrapperPath = join(outfile, 'run.sh');
writeFileSync(wrapperPath, wrapper);
chmodSync(wrapperPath, 0o755);
console.log(`🚀 启动脚本 → ${wrapperPath}`);

console.log(`\n✅ 打包完成: ${outfile}`);
console.log(`\n使用方式:`);
console.log(`  ${outfile}/run.sh                          # 自动 review MR 变更`);
console.log(`  ${outfile}/run.sh "审查 src/auth.ts"        # 自定义 review`);
