import { Glob } from 'bun';
import { z } from 'zod';

export const listFilesSchema = z.object({
  path: z.string().default('.').describe('要扫描的目录路径'),
});

export async function listFiles(input: { path?: string }): Promise<string> {
  const path = input.path ?? '.';
  const glob = new Glob('**/*');

  const files: string[] = [];

  for await (const file of glob.scan({
    cwd: path,
    onlyFiles: true,
  })) {
    files.push(file);
  }

  return files.join('\n');
}
