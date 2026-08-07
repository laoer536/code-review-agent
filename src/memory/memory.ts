import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { PROJECT_DATA_DIR } from '../agent/root';

const MEMORY_FILE = join(PROJECT_DATA_DIR, 'memory.json');

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
  if (!existsSync(PROJECT_DATA_DIR)) {
    mkdirSync(PROJECT_DATA_DIR, { recursive: true });
  }
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
