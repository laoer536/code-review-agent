import { join } from 'path';

// 存到 agent 项目自身目录下，不是用户的 cwd
const AGENT_ROOT = join(import.meta.dir, '../..');
const MEMORY_DIR = join(AGENT_ROOT, '.code-review-agent');
const MEMORY_FILE = join(MEMORY_DIR, 'memory.json');

interface ProjectMemory {
  codeType: string;
  lastReviewed: string;
}

type MemoryData = Record<string, ProjectMemory>;

async function load(): Promise<MemoryData> {
  const file = Bun.file(MEMORY_FILE);
  if (await file.exists()) {
    return JSON.parse(await file.text());
  }
  return {};
}

async function save(data: MemoryData): Promise<void> {
  await Bun.$`mkdir -p ${MEMORY_DIR}`;
  await Bun.write(MEMORY_FILE, JSON.stringify(data, null, 2));
}

/** 获取当前项目名称（优先 git 仓库名） */
export async function getProjectName(): Promise<string> {
  try {
    const remote = await Bun.$`git remote get-url origin`.text();
    // git@github.com:user/repo.git → repo
    // https://github.com/user/repo.git → repo
    const match = remote.match(/\/([^/]+?)(?:\.git)?\s*$/);
    if (match?.[1]) return match[1];
  } catch {}

  // fallback: 当前目录名
  return process.cwd().split('/').pop() ?? 'unknown';
}

/** 获取项目的技术栈记忆 */
export async function getCodeType(project: string): Promise<string | undefined> {
  const data = await load();
  return data[project]?.codeType;
}

/** 保存项目的技术栈 */
export async function saveCodeType(project: string, codeType: string): Promise<void> {
  const data = await load();
  data[project] = {
    codeType,
    lastReviewed: new Date().toISOString(),
  };
  await save(data);
}
