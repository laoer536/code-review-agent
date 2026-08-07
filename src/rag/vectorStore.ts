import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { load } from 'sqlite-vec';
import { embed, embedBatch } from '../llm/embedding';
import { PROJECT_DATA_DIR } from '../agent/root';

const DB_FILE = join(PROJECT_DATA_DIR, 'vectors.db');

let db: Database | null = null;

function getDb(): Database {
  if (db) return db;

  // 确保数据目录存在
  if (!existsSync(PROJECT_DATA_DIR)) {
    mkdirSync(PROJECT_DATA_DIR, { recursive: true });
  }

  // macOS 需要用系统 SQLite（Bun 内置的不支持扩展加载）
  if (process.platform === 'darwin') {
    try {
      Database.setCustomSQLite('/opt/homebrew/opt/sqlite3/lib/libsqlite3.dylib');
    } catch {
      // fallback: 尝试 Homebrew x86 路径
      Database.setCustomSQLite('/usr/local/opt/sqlite3/lib/libsqlite3.dylib');
    }
  }

  db = new Database(DB_FILE);
  load(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      chunk_index INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_documents USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[384]
    );
  `);

  return db;
}

/**
 * 将文本分块
 */
function chunkText(text: string, maxChars = 1000): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/);

  let current = '';
  for (const p of paragraphs) {
    if (current.length + p.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += p + '\n\n';
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

/**
 * 索引一个文档（文件内容或任意文本）
 */
export async function indexDocument(text: string, source: string): Promise<number> {
  const d = getDb();
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  // 删除同 source 的旧数据
  const oldIds = d.prepare('SELECT id FROM documents WHERE source = ?').all(source) as Array<{ id: number }>;
  if (oldIds.length > 0) {
    d.prepare('DELETE FROM documents WHERE source = ?').run(source);
    const delStmt = d.prepare('DELETE FROM vec_documents WHERE id = ?');
    for (const row of oldIds) {
      delStmt.run(String(row.id));
    }
  }

  // 批量生成 embedding
  const vectors = await embedBatch(chunks);

  // 插入
  const insertDoc = d.prepare('INSERT INTO documents (text, source, chunk_index) VALUES (?, ?, ?)');
  const insertVec = d.prepare('INSERT INTO vec_documents (id, embedding) VALUES (?, ?)');

  for (let i = 0; i < chunks.length; i++) {
    const { lastInsertRowid } = insertDoc.run(chunks[i]!, source, i);
    insertVec.run(String(lastInsertRowid), vectors[i]!);
  }

  return chunks.length;
}

/**
 * 语义搜索
 */
export async function search(query: string, topK = 3): Promise<Array<{ text: string; source: string; score: number }>> {
  const d = getDb();

  const count = (d.prepare('SELECT count(*) as c FROM documents').get() as { c: number }).c;
  if (count === 0) return [];

  const queryVec = await embed(query);

  const rows = d
    .prepare(
      `SELECT d.text, d.source, v.distance
       FROM vec_documents v
       JOIN documents d ON d.id = CAST(v.id AS INTEGER)
       WHERE v.embedding MATCH ? AND k = ?`,
    )
    .all(queryVec, topK) as Array<{ text: string; source: string; distance: number }>;

  return rows.map((r) => ({
    text: r.text,
    source: r.source,
    score: 1 - r.distance, // distance 转 similarity
  }));
}

/**
 * 列出已索引的来源
 */
export async function listSources(): Promise<string[]> {
  const d = getDb();
  const rows = d.prepare('SELECT DISTINCT source FROM documents').all() as Array<{ source: string }>;
  return rows.map((r) => r.source);
}

/**
 * 删除指定来源
 */
export async function removeSource(source: string): Promise<number> {
  const d = getDb();
  const ids = d.prepare('SELECT id FROM documents WHERE source = ?').all(source) as Array<{ id: number }>;
  if (ids.length === 0) return 0;

  d.prepare('DELETE FROM documents WHERE source = ?').run(source);
  const delStmt = d.prepare('DELETE FROM vec_documents WHERE id = ?');
  for (const row of ids) {
    delStmt.run(String(row.id));
  }
  return ids.length;
}
