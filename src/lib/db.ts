import Database from "@tauri-apps/plugin-sql";

// Goodidea 本地存储封装（tauri-plugin-sql / SQLite）
// 数据库文件：<AppConfig>/goodidea.db（tauri-plugin-sql 相对路径解析到 AppConfig 目录）
// 表结构由 Rust 侧 Migration 管理（见 src-tauri/src/lib.rs），前端不做 DDL。

export interface DocumentRow {
  id: number;
  filename: string;
  file_type: string;
  file_hash: string | null;
  size: number | null;
  tags: string | null;
  created_at: string;
}

const DB_PATH = "sqlite:goodidea.db";
let db: Database | null = null;

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}

export async function getDb(): Promise<Database> {
  if (!isTauriRuntime()) {
    throw new Error("非 Tauri 运行环境（浏览器/构建产物预览），无法连接 SQLite");
  }
  if (!db) {
    db = await Database.load(DB_PATH);
  }
  return db;
}

/** 文档总数（P0 验证用） */
export async function countDocuments(): Promise<number | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    const rows = await d.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM documents");
    return rows[0]?.n ?? 0;
  } catch (err) {
    console.error("[db] countDocuments failed", err);
    return null;
  }
}

/** 已建立的业务表清单（读取 sqlite_master，验证迁移是否生效） */
export async function listTables(): Promise<string[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    const rows = await d.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    return rows.map((r) => r.name);
  } catch (err) {
    console.error("[db] listTables failed", err);
    return null;
  }
}

/** 连接就绪性探测：能执行 SELECT 即认为已连接（迁移由 preload / load 自动应用） */
export async function dbStatus(): Promise<{
  connected: boolean;
  tables: string[];
  documents: number;
  error?: string;
}> {
  if (!isTauriRuntime()) {
    return { connected: false, tables: [], documents: 0, error: "非 Tauri 运行环境" };
  }
  try {
    const tables = (await listTables()) ?? [];
    const documents = (await countDocuments()) ?? 0;
    return { connected: true, tables, documents };
  } catch (err) {
    return {
      connected: false,
      tables: [],
      documents: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------- P1：文档 CRUD ----------

/** 文档列表（按入库时间倒序） */
export async function listDocuments(): Promise<DocumentRow[]> {
  if (!isTauriRuntime()) return [];
  try {
    const d = await getDb();
    const rows = await d.select<DocumentRow[]>(
      "SELECT id, filename, file_type, file_hash, size, tags, created_at FROM documents ORDER BY created_at DESC, id DESC"
    );
    return rows ?? [];
  } catch (err) {
    console.error("[db] listDocuments failed", err);
    return [];
  }
}

/** 按内容哈希查文档（去重用） */
export async function findDocumentByHash(hash: string): Promise<DocumentRow | null> {
  const d = await getDb();
  const rows = await d.select<DocumentRow[]>(
    "SELECT id, filename, file_type, file_hash, size, tags, created_at FROM documents WHERE file_hash = $1 LIMIT 1",
    [hash]
  );
  return rows[0] ?? null;
}

/** 插入文档，返回自增 id */
export async function insertDocument(doc: {
  filename: string;
  file_type: string;
  file_hash: string;
  size: number;
  tags: string;
}): Promise<number> {
  const d = await getDb();
  await d.execute(
    "INSERT INTO documents (filename, file_type, file_hash, size, tags, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [doc.filename, doc.file_type, doc.file_hash, doc.size, doc.tags, new Date().toISOString().slice(0, 19).replace("T", " ")]
  );
  const rows = await d.select<{ id: number }[]>("SELECT last_insert_rowid() AS id");
  return rows[0].id;
}

/** 插入文档块 */
export async function insertChunk(c: { doc_id: number; seq: number; content: string; token_count: number }): Promise<void> {
  const d = await getDb();
  await d.execute("INSERT INTO chunks (doc_id, seq, content, token_count) VALUES ($1, $2, $3, $4)", [
    c.doc_id,
    c.seq,
    c.content,
    c.token_count,
  ]);
}

/** 文档分块总数 */
export async function countChunks(): Promise<number | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    const rows = await d.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM chunks");
    return rows[0]?.n ?? 0;
  } catch (err) {
    console.error("[db] countChunks failed", err);
    return null;
  }
}

/** 删除文档（chunks 显式级联删除；SQLite 外键约束默认不启用，不依赖 ON DELETE CASCADE） */
export async function deleteDocument(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM chunks WHERE doc_id = $1", [id]);
  await d.execute("DELETE FROM documents WHERE id = $1", [id]);
}

/** 全库内容（按文档/块序拼接，供全库分析；limit 截断防止超长 prompt） */
export async function listAllChunkContent(limit = 60): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  try {
    const d = await getDb();
    const rows = await d.select<{ content: string }[]>(
      "SELECT content FROM chunks ORDER BY doc_id, seq LIMIT $1",
      [limit]
    );
    return rows.map((r) => r.content);
  } catch (err) {
    console.error("[db] listAllChunkContent failed", err);
    return [];
  }
}
