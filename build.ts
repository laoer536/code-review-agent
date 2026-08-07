/**
 * CLI 打包脚本
 * bun run build.ts [--target=bun-linux-x64] [--outfile=dist/code-review]
 */
import { parseArgs } from 'util';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    target: { type: 'string', default: `bun-${process.platform}-${process.arch === 'arm64' ? 'arm64' : 'x64'}` },
    outfile: { type: 'string', default: 'dist/code-review' },
  },
});

const target = values.target!;
const outfile = values.outfile!;
const outDir = join(outfile, '..');

console.log(`🔨 打包 CLI → ${outfile} (${target})`);

// 1. 编译 binary
const result = await Bun.build({
  entrypoints: ['src/index.ts'],
  outdir: outDir,
  target: 'bun',
  compile: {
    target: target as any,
    outfile: outfile,
  },
});

if (!result.success) {
  console.error('❌ 编译失败:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// 2. 复制内置规则到 binary 旁边
const rulesSrc = join(import.meta.dir, 'rules');
const rulesDest = join(outDir, 'rules');
if (existsSync(rulesSrc)) {
  cpSync(rulesSrc, rulesDest, { recursive: true });
  console.log(`📋 内置规则 → ${rulesDest}`);
}

console.log(`✅ 打包完成: ${outfile}`);
console.log(`\n使用方式:`);
console.log(`  # 直接运行`);
console.log(`  ${outfile}`);
console.log(`\n  # CI 中使用`);
console.log(`  AGENT_ROOT=${outDir} ${outfile}`);
