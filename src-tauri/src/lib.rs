// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Deserialize;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// 备份导出：写 JSON 文件到指定路径
#[tauri::command]
fn save_backup(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// 备份还原：读取指定路径的 JSON 备份内容
#[tauri::command]
fn read_backup(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// ---- 备份还原（Rust 单连接事务，规避 tauri-plugin-sql 连接池下跨语句事务失效 BUG-014） ----
#[derive(Deserialize)]
struct BackupDoc {
    id: i64,
    filename: String,
    file_type: String,
    file_hash: Option<String>,
    size: Option<i64>,
    group_id: Option<i64>,
    created_at: String,
}
#[derive(Deserialize)]
struct BackupChunk {
    doc_id: i64,
    seq: i64,
    content: String,
    token_count: Option<i64>,
}
#[derive(Deserialize)]
struct BackupGroup {
    /// 新备份带 id；旧备份（无 id 字段）为 None → 还原时文档 group_id 归 NULL，防孤儿
    id: Option<i64>,
    name: String,
    created_at: String,
}
#[derive(Deserialize)]
struct BackupRule {
    model: String,
    input_price: f64,
    output_price: f64,
    updated_at: String,
}
#[derive(Deserialize)]
struct BackupPayload {
    app: String,
    documents: Vec<BackupDoc>,
    chunks: Vec<BackupChunk>,
    groups: Vec<BackupGroup>,
    billing_rules: Vec<BackupRule>,
}

/// 还原备份：解析 JSON → 单连接事务重建 documents/chunks/groups/billing_rules（模型档案保留不动）。
/// 返回导入计数 JSON；任一步失败整体回滚。
#[tauri::command]
fn import_backup(app: tauri::AppHandle, json: String) -> Result<String, String> {
    use rusqlite::{params, Connection};
    let payload: BackupPayload = serde_json::from_str(&json).map_err(|e| format!("备份文件解析失败：{e}"))?;
    if payload.app != "goodidea" {
        return Err("不是有效的 Goodidea 备份文件".into());
    }
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录：{e}"))?;
    let db_path = dir.join("goodidea.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("打开数据库失败：{e}"))?;
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| format!("设置 busy_timeout 失败：{e}"))?;
    conn.execute_batch("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;")
        .map_err(|e| format!("开启事务失败：{e}"))?;
    let run = (|| -> Result<(), String> {
        conn.execute("DELETE FROM chunks", []).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM documents", []).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM groups", []).map_err(|e| e.to_string())?;
        // 新备份（v2 起）：groups 带原始 id，文档 group_id 原样还原，分组归属完全一致；
        // 旧备份（无 id 字段）：组按自增重建、文档 group_id 归 NULL——宁可见全不隐身，杜绝孤儿引用（BUG-017）
        let has_group_ids = !payload.groups.is_empty() && payload.groups.iter().all(|g| g.id.is_some());
        {
            let mut st = if has_group_ids {
                conn.prepare("INSERT INTO groups (id, name, created_at) VALUES (?1, ?2, ?3)")
                    .map_err(|e| e.to_string())?
            } else {
                conn.prepare("INSERT INTO groups (name, created_at) VALUES (?1, ?2)")
                    .map_err(|e| e.to_string())?
            };
            for g in &payload.groups {
                if has_group_ids {
                    st.execute(params![g.id.unwrap(), g.name, g.created_at]).map_err(|e| e.to_string())?;
                } else {
                    st.execute(params![g.name, g.created_at]).map_err(|e| e.to_string())?;
                }
            }
        }
        {
            let mut st = conn
                .prepare("INSERT INTO documents (id, filename, file_type, file_hash, size, group_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
                .map_err(|e| e.to_string())?;
            for d in &payload.documents {
                let gid = if has_group_ids { d.group_id } else { None };
                st.execute(params![d.id, d.filename, d.file_type, d.file_hash, d.size, gid, d.created_at])
                    .map_err(|e| e.to_string())?;
            }
        }
        // 兜底清理：无论备份格式/历史脏数据，还原后不允许孤儿引用（group_id 指向不存在的组一律归 NULL）——BUG-017 二次防御
        conn.execute(
            "UPDATE documents SET group_id = NULL WHERE group_id IS NOT NULL AND group_id NOT IN (SELECT id FROM groups)",
            [],
        )
        .map_err(|e| e.to_string())?;
        {
            let mut st = conn
                .prepare("INSERT INTO chunks (doc_id, seq, content, token_count) VALUES (?1, ?2, ?3, ?4)")
                .map_err(|e| e.to_string())?;
            for c in &payload.chunks {
                st.execute(params![c.doc_id, c.seq, c.content, c.token_count])
                    .map_err(|e| e.to_string())?;
            }
        }
        {
            let mut st = conn
                .prepare(
                    "INSERT INTO billing_rules (model, input_price, output_price, updated_at) VALUES (?1, ?2, ?3, ?4) \
                     ON CONFLICT(model) DO UPDATE SET input_price = ?2, output_price = ?3, updated_at = ?4",
                )
                .map_err(|e| e.to_string())?;
            for r in &payload.billing_rules {
                st.execute(params![r.model, r.input_price, r.output_price, r.updated_at])
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })();
    match run {
        Ok(()) => {
            conn.execute_batch("COMMIT;")
                .map_err(|e| format!("提交事务失败：{e}"))?;
            let counts = serde_json::json!({
                "documents": payload.documents.len(),
                "chunks": payload.chunks.len(),
                "groups": payload.groups.len(),
                "rules": payload.billing_rules.len(),
            });
            Ok(counts.to_string())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(format!("还原失败：{e}"))
        }
    }
}

pub fn run() {
    // P0：核心表 documents/chunks；analyses/generations/hotspot_snapshots/billing_rules 随 P1+ 递增版本迁移
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_documents_and_chunks",
            sql: "CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                file_type TEXT NOT NULL,
                file_hash TEXT UNIQUE,
                size INTEGER,
                tags TEXT,
                created_at TEXT NOT NULL
              );
              CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                seq INTEGER NOT NULL,
                content TEXT NOT NULL,
                token_count INTEGER
              );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_groups_and_add_group_id",
            sql: "CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
              );
              ALTER TABLE documents ADD COLUMN group_id INTEGER;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_billing_rules",
            sql: "CREATE TABLE IF NOT EXISTS billing_rules (
                model TEXT PRIMARY KEY,
                input_price REAL NOT NULL,
                output_price REAL NOT NULL,
                updated_at TEXT NOT NULL
              );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_ai_profiles",
            sql: "CREATE TABLE IF NOT EXISTS ai_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                base_url TEXT NOT NULL,
                model TEXT NOT NULL,
                api_key TEXT NOT NULL,
                thinking INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
              );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_histories",
            sql: "CREATE TABLE IF NOT EXISTS histories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                prompt TEXT NOT NULL,
                output TEXT NOT NULL,
                meta TEXT,
                created_at TEXT NOT NULL
              );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_app_settings",
            sql: "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
              );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_skills",
            sql: "CREATE TABLE IF NOT EXISTS skills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                instruction TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
              );",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:goodidea.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet, save_backup, read_backup, import_backup])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
