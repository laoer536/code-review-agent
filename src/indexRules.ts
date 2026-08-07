import { Glob } from "bun";
import { indexDocument, listSources, removeSource } from "./rag/vectorStore";

const args = process.argv.slice(2);
const command = args[0];
const target = args[1];

function usage() {
  console.log(`
📚 规则知识库管理

用法:
  bun run src/indexRules.ts index <文件或目录>   索引规则文件
  bun run src/indexRules.ts list                 查看已索引来源
  bun run src/indexRules.ts remove <来源>        删除指定来源
  bun run src/indexRules.ts clear                清空所有索引

示例:
  bun run src/indexRules.ts index ./rules                索引整个目录
  bun run src/indexRules.ts index ./rules/typescript.md  索引单个文件
  bun run src/indexRules.ts remove typescript.md         删除指定规则
`);
}

async function indexFile(filePath: string): Promise<void> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return;
  }
  const text = await file.text();
  const name = filePath.split("/").pop()!;
  const count = await indexDocument(text, name);
  console.log(`✅ 索引 ${name} → ${count} 个分块`);
}

async function indexDir(dirPath: string): Promise<void> {
  const glob = new Glob("**/*.{md,txt,json,yaml,yml}");
  let total = 0;

  for await (const file of glob.scan({ cwd: dirPath, onlyFiles: true })) {
    const fullPath = `${dirPath}/${file}`;
    const text = await Bun.file(fullPath).text();
    const count = await indexDocument(text, file);
    console.log(`  ✅ ${file} → ${count} 个分块`);
    total += count;
  }

  console.log(`\n📚 共索引 ${total} 个分块`);
}

// 首次加载 embedding 模型
console.log("⏳ 加载 embedding 模型...\n");

switch (command) {
  case "index": {
    if (!target) {
      console.error("❌ 请指定文件或目录路径");
      process.exit(1);
    }
    // 判断是文件还是目录
    try {
      const stat = await import("fs/promises").then(fs => fs.stat(target));
      if (stat.isDirectory()) {
        await indexDir(target);
      } else {
        await indexFile(target);
      }
    } catch {
      console.error(`❌ 路径不存在: ${target}`);
      process.exit(1);
    }
    break;
  }
  case "list": {
    const sources = await listSources();
    if (sources.length === 0) {
      console.log("📭 知识库为空");
    } else {
      console.log(`📚 已索引 ${sources.length} 个来源:`);
      for (const s of sources) {
        console.log(`  - ${s}`);
      }
    }
    break;
  }
  case "remove": {
    if (!target) {
      console.error("❌ 请指定要删除的来源");
      process.exit(1);
    }
    const count = await removeSource(target);
    console.log(`🗑️  已删除 ${count} 条记录`);
    break;
  }
  case "clear": {
    const sources = await listSources();
    for (const s of sources) {
      await removeSource(s);
    }
    console.log(`🗑️  已清空 ${sources.length} 个来源`);
    break;
  }
  default:
    usage();
}
