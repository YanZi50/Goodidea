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
