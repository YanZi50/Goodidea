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
  group_id: number | null;
  created_at: string;
}

export interface GroupRow {
  id: number;
  name: string;
  created_at: string;
  doc_count: number;
}

const DB_PATH = "sqlite:goodidea.db";
let db: Database | null = null;

// ---- 通用设置（app_settings，v6）：行业背景等全局配置；web 预览降级 localStorage ----
const SETTING_PREFIX = "goodidea.appsetting.v1.";

/** 默认行业背景：未配置时的兜底文案（生成/分析注入模型角色） */
export const DEFAULT_INDUSTRY_CONTEXT =
  "我从事奢侈品回收行业（名表、包袋等全品类），主打高价回收、先打款后收货；目标用户是希望把闲置名表、包袋快速变现的人。";

export async function getAppSetting(key: string): Promise<string | null> {
  if (!isTauriRuntime()) return localStorage.getItem(SETTING_PREFIX + key);
  try {
    const d = await getDb();
    const rows = await d.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [key]
    );
    return rows[0]?.value ?? null;
  } catch (err) {
    console.error("[db] getAppSetting failed", err);
    return null;
  }
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  if (!isTauriRuntime()) {
    localStorage.setItem(SETTING_PREFIX + key, value);
    return;
  }
  try {
    const d = await getDb();
    await d.execute(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3",
      [key, value, new Date().toISOString()]
    );
  } catch (err) {
    console.error("[db] setAppSetting failed", err);
  }
}

/** 读取行业背景：未配置或空 → 内置默认文案 */
export async function loadIndustryContext(): Promise<string> {
  const v = await getAppSetting("industry_context");
  return v && v.trim() ? v : DEFAULT_INDUSTRY_CONTEXT;
}

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
      "SELECT id, filename, file_type, file_hash, size, tags, group_id, created_at FROM documents ORDER BY created_at DESC, id DESC"
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
    "SELECT id, filename, file_type, file_hash, size, tags, group_id, created_at FROM documents WHERE file_hash = $1 LIMIT 1",
    [hash]
  );
  return rows[0] ?? null;
}

/** 插入文档，返回自增 id；groupId 为空时归入未分组 */
export async function insertDocument(doc: {
  filename: string;
  file_type: string;
  file_hash: string;
  size: number;
  tags: string;
  group_id?: number | null;
}): Promise<number> {
  const d = await getDb();
  await d.execute(
    "INSERT INTO documents (filename, file_type, file_hash, size, tags, group_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [doc.filename, doc.file_type, doc.file_hash, doc.size, doc.tags, doc.group_id ?? null, new Date().toISOString().slice(0, 19).replace("T", " ")]
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

/** 文档分块总数（可选按文档范围） */
export async function countChunks(docIds?: number[]): Promise<number | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    let sql = "SELECT COUNT(*) AS n FROM chunks";
    const params: unknown[] = [];
    if (docIds && docIds.length > 0) {
      sql += ` WHERE doc_id IN (${docIds.map((_, i) => `$${i + 1}`).join(",")})`;
      params.push(...docIds);
    }
    const rows = await d.select<{ n: number }[]>(sql, params);
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

/** 批量删除文档（chunks 级联 + 文档，单事务语义：先删块再删文档） */
export async function deleteDocuments(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  const ph = ids.map((_, i) => `$${i + 1}`).join(",");
  await d.execute(`DELETE FROM chunks WHERE doc_id IN (${ph})`, ids);
  await d.execute(`DELETE FROM documents WHERE id IN (${ph})`, ids);
}

/** 更新文档分组标签（tags 存 JSON 数组字符串，如 ["抖音","名表"]；已由 group_id 取代 UI 使用，保留兼容） */
export async function updateDocumentTags(id: number, tags: string[]): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE documents SET tags = $1 WHERE id = $2", [JSON.stringify(tags), id]);
}

/** 解析 tags 字段（null / 空 / 非法 JSON → 空数组） */
export function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    const v = JSON.parse(tags);
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// ---------- P2c：分组（groups 表 + documents.group_id，组间互不干涉） ----------

/** 全部组（含文档数），按创建时间正序 */
export async function listGroups(): Promise<GroupRow[]> {
  if (!isTauriRuntime()) return [];
  try {
    const d = await getDb();
    const rows = await d.select<GroupRow[]>(
      `SELECT g.id, g.name, g.created_at, COUNT(d.id) AS doc_count
       FROM groups g LEFT JOIN documents d ON d.group_id = g.id
       GROUP BY g.id, g.name, g.created_at ORDER BY g.created_at ASC, g.id ASC`
    );
    return rows ?? [];
  } catch (err) {
    console.error("[db] listGroups failed", err);
    return [];
  }
}

/** 创建组（重名抛错），返回自增 id */
export async function createGroup(name: string): Promise<number> {
  const d = await getDb();
  const dup = await d.select<{ id: number }[]>("SELECT id FROM groups WHERE name = $1 LIMIT 1", [name]);
  if (dup.length > 0) throw new Error(`分组「${name}」已存在`);
  await d.execute("INSERT INTO groups (name, created_at) VALUES ($1, $2)", [
    name,
    new Date().toISOString().slice(0, 19).replace("T", " "),
  ]);
  const rows = await d.select<{ id: number }[]>("SELECT last_insert_rowid() AS id");
  return rows[0].id;
}

/** 删除组：组内文档移回未分组，再删组本身 */
export async function deleteGroup(id: number): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE documents SET group_id = NULL WHERE group_id = $1", [id]);
  await d.execute("DELETE FROM groups WHERE id = $1", [id]);
}

/** 单篇文档移入组（groupId 为 null = 移出分组） */
export async function setDocumentGroup(id: number, groupId: number | null): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE documents SET group_id = $1 WHERE id = $2", [groupId, id]);
}

/** 批量移动文档到组（groupId 为 null = 批量移出分组） */
export async function setDocumentsGroup(ids: number[], groupId: number | null): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  const ph = ids.map((_, i) => `$${i + 1}`).join(",");
  await d.execute(`UPDATE documents SET group_id = $${ids.length + 1} WHERE id IN (${ph})`, [...ids, groupId]);
}

/** 全库内容（可选按文档范围；按文档/块序拼接，limit 截断防止超长 prompt） */
export async function listAllChunkContent(limit = 60, docIds?: number[]): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  try {
    const d = await getDb();
    let sql = "SELECT content FROM chunks";
    const params: unknown[] = [];
    if (docIds && docIds.length > 0) {
      sql += ` WHERE doc_id IN (${docIds.map((_, i) => `$${i + 1}`).join(",")})`;
      params.push(...docIds);
      sql += ` ORDER BY doc_id, seq LIMIT $${docIds.length + 1}`;
      params.push(limit);
    } else {
      sql += " ORDER BY doc_id, seq LIMIT $1";
      params.push(limit);
    }
    const rows = await d.select<{ content: string }[]>(sql, params);
    return rows.map((r) => r.content);
  } catch (err) {
    console.error("[db] listAllChunkContent failed", err);
    return [];
  }
}

/** 全量分块（含文档名归属），供查重/素材检索等需要溯源的能力使用 */
export async function listChunksWithDoc(limit = 3000): Promise<{ doc: string; content: string }[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    const rows = await d.select<{ doc: string; content: string }[]>(
      "SELECT d.filename AS doc, c.content AS content FROM chunks c JOIN documents d ON d.id = c.doc_id ORDER BY c.doc_id, c.seq LIMIT $1",
      [limit]
    );
    return rows;
  } catch (err) {
    console.error("[db] listChunksWithDoc failed", err);
    return null;
  }
}

/** 素材检索：按关键词匹配文档文件名或分块内容，返回命中文档的分块（生成工作台关联素材用） */
export async function searchMaterialChunks(
  keywords: string[],
  chunkLimit = 24
): Promise<{ docCount: number; chunks: { doc: string; content: string }[] }> {
  if (!isTauriRuntime()) return { docCount: 0, chunks: [] };
  try {
    const d = await getDb();
    const like = keywords.filter((k) => k.length > 0);
    if (like.length === 0) return { docCount: 0, chunks: [] };
    const or = like.map((_, i) => `content LIKE '%' || $${i + 1} || '%'`).join(" OR ");
    const rows = await d.select<{ doc_id: number; filename: string; content: string }[]>(
      `SELECT c.doc_id, doc.filename, c.content FROM chunks c
       JOIN documents doc ON doc.id = c.doc_id
       WHERE ${or}
       ORDER BY c.doc_id, c.seq
       LIMIT ${chunkLimit}`,
      like
    );
    const seen = new Set<number>();
    const chunks = rows.map((r) => {
      seen.add(r.doc_id);
      return { doc: r.filename, content: r.content };
    });
    // 文件名命中但无内容命中的文档也尽量覆盖：文件关键词匹配
    const seenIds = [...seen];
    const fnLike = like.map((_, i) => `filename LIKE '%' || $${i + 1} || '%'`).join(" OR ");
    const inPh = seenIds.length > 0 ? seenIds.map((_, i) => `$${i + like.length + 1}`).join(",") : "0";
    const fnRows = await d.select<{ id: number; filename: string }[]>(
      `SELECT id, filename FROM documents WHERE ${fnLike} AND id NOT IN (${inPh}) LIMIT 8`,
      [...like, ...seenIds]
    );
    let extra = 0;
    for (const f of fnRows) {
      if (extra >= 6) break;
      const cs = await d.select<{ content: string }[]>(
        "SELECT content FROM chunks WHERE doc_id = $1 ORDER BY seq LIMIT 3",
        [f.id]
      );
      for (const c of cs) {
        chunks.push({ doc: f.filename, content: c.content });
        extra++;
      }
      seen.add(f.id);
    }
    return { docCount: seen.size, chunks };
  } catch (err) {
    console.error("[db] searchMaterialChunks failed", err);
    return { docCount: 0, chunks: [] };
  }
}

// ---- 价格表（billing_rules，v3） ----
export interface BillingRule {
  model: string;
  input_price: number;
  output_price: number;
  updated_at: string;
}

/** 读取全部价格规则；web 预览或 db 不可用时返回 null */
export async function listBillingRules(): Promise<BillingRule[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    return await d.select<BillingRule[]>("SELECT model, input_price, output_price, updated_at FROM billing_rules ORDER BY model");
  } catch (err) {
    console.error("[db] listBillingRules failed", err);
    return null;
  }
}

/** 写入（存在则更新）一条价格规则 */
export async function upsertBillingRule(model: string, inputPrice: number, outputPrice: number): Promise<void> {
  if (!isTauriRuntime()) return;
  const d = await getDb();
  await d.execute(
    "INSERT INTO billing_rules (model, input_price, output_price, updated_at) VALUES ($1, $2, $3, $4) " +
      "ON CONFLICT(model) DO UPDATE SET input_price = $2, output_price = $3, updated_at = $4",
    [model, inputPrice, outputPrice, new Date().toISOString()]
  );
}

// ---- AI 模型档案（ai_profiles，v4）：多模型接入 + 一键切换 ----
export interface AIProfile {
  id: number;
  label: string;
  base_url: string;
  model: string;
  api_key: string;
  thinking: number; // 0/1
  is_active: number; // 0/1
  created_at: string;
  updated_at: string;
}

/** 读取全部模型档案；web 预览返回 null */
export async function listProfiles(): Promise<AIProfile[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    return await d.select<AIProfile[]>(
      "SELECT id, label, base_url, model, api_key, thinking, is_active, created_at, updated_at FROM ai_profiles ORDER BY is_active DESC, updated_at DESC"
    );
  } catch (err) {
    console.error("[db] listProfiles failed", err);
    return null;
  }
}

/** 新增档案（若库中无任何档案则自动设为当前） */
export async function createProfile(p: {
  label: string;
  base_url: string;
  model: string;
  api_key: string;
  thinking: boolean;
}): Promise<number | null> {
  if (!isTauriRuntime()) return null;
  const d = await getDb();
  const [{ c }] = await d.select<{ c: number }[]>("SELECT COUNT(*) AS c FROM ai_profiles");
  const isActive = c === 0 ? 1 : 0;
  const now = new Date().toISOString();
  await d.execute(
    "INSERT INTO ai_profiles (label, base_url, model, api_key, thinking, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
    [p.label, p.base_url, p.model, p.api_key, p.thinking ? 1 : 0, isActive, now]
  );
  const [{ id }] = await d.select<{ id: number }[]>("SELECT last_insert_rowid() AS id");
  return id;
}

/** 更新档案字段 */
export async function updateProfile(
  id: number,
  p: { label?: string; base_url?: string; model?: string; api_key?: string; thinking?: boolean }
): Promise<void> {
  if (!isTauriRuntime()) return;
  const d = await getDb();
  const sets: string[] = [];
  const args: unknown[] = [];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = $${sets.length + 1}`);
    args.push(v);
  };
  if (p.label !== undefined) push("label", p.label);
  if (p.base_url !== undefined) push("base_url", p.base_url);
  if (p.model !== undefined) push("model", p.model);
  if (p.api_key !== undefined) push("api_key", p.api_key);
  if (p.thinking !== undefined) push("thinking", p.thinking ? 1 : 0);
  if (sets.length === 0) return;
  sets.push(`updated_at = $${sets.length + 1}`);
  args.push(new Date().toISOString());
  args.push(id);
  await d.execute(`UPDATE ai_profiles SET ${sets.join(", ")} WHERE id = $${args.length}`, args);
}

/** 删除档案；若删除的是当前模型，把剩余第一份（或空表）设为当前 */
export async function deleteProfile(id: number): Promise<void> {
  if (!isTauriRuntime()) return;
  const d = await getDb();
  const [{ wasActive }] = await d.select<{ wasActive: number }[]>(
    "SELECT is_active AS wasActive FROM ai_profiles WHERE id = $1",
    [id]
  );
  await d.execute("DELETE FROM ai_profiles WHERE id = $1", [id]);
  if (wasActive === 1) {
    const rows = await d.select<{ id: number }[]>("SELECT id FROM ai_profiles ORDER BY updated_at DESC LIMIT 1");
    if (rows.length > 0) {
      await d.execute("UPDATE ai_profiles SET is_active = 1, updated_at = $2 WHERE id = $1", [rows[0].id, new Date().toISOString()]);
    }
  }
}

/** 设为当前模型（同库内仅此一份 is_active=1） */
export async function setActiveProfile(id: number): Promise<void> {
  if (!isTauriRuntime()) return;
  const d = await getDb();
  await d.execute("UPDATE ai_profiles SET is_active = 0");
  await d.execute("UPDATE ai_profiles SET is_active = 1, updated_at = $2 WHERE id = $1", [id, new Date().toISOString()]);
}

/** 读取当前模型档案；无档案返回 null */
export async function getActiveProfile(): Promise<AIProfile | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    const rows = await d.select<AIProfile[]>(
      "SELECT id, label, base_url, model, api_key, thinking, is_active, created_at, updated_at FROM ai_profiles WHERE is_active = 1 LIMIT 1"
    );
    return rows[0] ?? null;
  } catch (err) {
    console.error("[db] getActiveProfile failed", err);
    return null;
  }
}

/** 旧版 localStorage 单配置 → 一次性迁移为第一份档案（仅当 SQLite 无任何档案时执行） */
export async function migrateLegacyConfig(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const d = await getDb();
    const [{ c }] = await d.select<{ c: number }[]>("SELECT COUNT(*) AS c FROM ai_profiles");
    if (c > 0) return;
    const raw = localStorage.getItem("goodidea.ai.config.v1");
    if (!raw) return;
    const old = JSON.parse(raw) as { label?: string; baseURL?: string; model?: string; apiKey?: string; thinking?: boolean };
    if (!old.apiKey || !old.model) return;
    const now = new Date().toISOString();
    await d.execute(
      "INSERT INTO ai_profiles (label, base_url, model, api_key, thinking, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 1, $6, $6)",
      [old.label?.trim() || "我的模型", old.baseURL || "", old.model, old.apiKey, old.thinking ? 1 : 0, now]
    );
    localStorage.removeItem("goodidea.ai.config.v1");
  } catch (err) {
    console.error("[db] migrateLegacyConfig failed", err);
  }
}

// ---- 生成/分析历史（histories，v5）：回看 + 一键复用 ----
export interface HistoryRow {
  id: number;
  kind: string; // generation / analysis
  title: string;
  prompt: string;
  output: string;
  meta: string | null;
  created_at: string;
}

/** 写入一条历史；kind: "generation" | "analysis" */
export async function recordHistory(p: { kind: string; title: string; prompt: string; output: string; meta?: string }): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const d = await getDb();
    await d.execute(
      "INSERT INTO histories (kind, title, prompt, output, meta, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [p.kind, p.title, p.prompt, p.output, p.meta ?? null, new Date().toISOString()]
    );
  } catch (err) {
    console.error("[db] recordHistory failed", err);
  }
}

/** 最近历史（默认 20 条，按时间倒序） */
export async function listHistories(limit = 20, kind?: string): Promise<HistoryRow[] | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    const rows = kind
      ? await d.select<HistoryRow[]>(
          "SELECT id, kind, title, prompt, output, meta, created_at FROM histories WHERE kind = $1 ORDER BY id DESC LIMIT $2",
          [kind, limit]
        )
      : await d.select<HistoryRow[]>(
          "SELECT id, kind, title, prompt, output, meta, created_at FROM histories ORDER BY id DESC LIMIT $1",
          [limit]
        );
    return rows;
  } catch (err) {
    console.error("[db] listHistories failed", err);
    return null;
  }
}

/** 删除单条历史 */
export async function deleteHistory(id: number): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const d = await getDb();
    await d.execute("DELETE FROM histories WHERE id = $1", [id]);
  } catch (err) {
    console.error("[db] deleteHistory failed", err);
  }
}

/** 清空某类历史（或全部） */
export async function clearHistories(kind?: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const d = await getDb();
    await d.execute(kind ? "DELETE FROM histories WHERE kind = $1" : "DELETE FROM histories", kind ? [kind] : []);
  } catch (err) {
    console.error("[db] clearHistories failed", err);
  }
}

// ---- 知识库备份导出（JSON 全量，供还原） ----
export interface BackupPayload {
  app: string;
  version: number;
  exportedAt: string;
  documents: { id: number; filename: string; file_type: string; file_hash: string | null; size: number | null; group_id: number | null; created_at: string }[];
  chunks: { doc_id: number; seq: number; content: string; token_count: number | null }[];
  groups: { name: string; created_at: string }[];
  billing_rules: { model: string; input_price: number; output_price: number; updated_at: string }[];
  ai_profiles: { label: string; base_url: string; model: string; api_key: string; thinking: number; is_active: number; created_at: string; updated_at: string }[];
}

/** 全量导出（不含 histories，历史属过程数据） */
export async function exportBackupData(): Promise<BackupPayload | null> {
  if (!isTauriRuntime()) return null;
  try {
    const d = await getDb();
    const [documents, chunks, groups, billing_rules, ai_profiles] = await Promise.all([
      d.select<BackupPayload["documents"]>("SELECT id, filename, file_type, file_hash, size, group_id, created_at FROM documents ORDER BY id"),
      d.select<BackupPayload["chunks"]>("SELECT doc_id, seq, content, token_count FROM chunks ORDER BY doc_id, seq"),
      d.select<BackupPayload["groups"]>("SELECT name, created_at FROM groups ORDER BY id"),
      d.select<BackupPayload["billing_rules"]>("SELECT model, input_price, output_price, updated_at FROM billing_rules"),
      d.select<BackupPayload["ai_profiles"]>("SELECT label, base_url, model, api_key, thinking, is_active, created_at, updated_at FROM ai_profiles"),
    ]);
    return {
      app: "goodidea",
      version: 1,
      exportedAt: new Date().toISOString(),
      documents,
      chunks,
      groups,
      billing_rules,
      ai_profiles,
    };
  } catch (err) {
    console.error("[db] exportBackupData failed", err);
    return null;
  }
}

/** 还原备份：交给 Rust 单连接事务重建（文档/分块/分组/价格表，模型档案保留不动），返回导入计数。
 *  web 环境降级 null。连接池下前端逐条 execute 事务不可靠（BUG-014），故整体下沉 Rust。 */
export async function importBackupData(backup: BackupPayload): Promise<{ documents: number; chunks: number; groups: number; rules: number } | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const r = await invoke<string>("import_backup", { json: JSON.stringify(backup) });
    return JSON.parse(r) as { documents: number; chunks: number; groups: number; rules: number };
  } catch (err) {
    console.error("[db] importBackupData failed", err);
    return null;
  }
}
