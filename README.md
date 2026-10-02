# Goodidea

开源桌面应用：个人文档知识库 + AI 分析/生成工作台。

上传 `.txt` / `.md` / `.docx` 文档入库 → 大模型分析全库（浓缩 / 指出问题）→ 基于你的素材与热点生成新内容（短视频脚本、文案等）。

## 技术栈

- 桌面壳：Tauri 2（Rust 薄壳，仅官方插件）
- 前端：Vue 3 + TypeScript + Vite
- 存储：SQLite（tauri-plugin-sql）
- AI 接入：Vercel AI SDK 多厂商（豆包/OpenAI 兼容等）

## 开发

前置要求：Node ≥ 20、Rust stable（含 MSVC Build Tools）、WebView2（Windows）。

```bash
npm install        # 安装前端依赖
npm run tauri dev  # 启动开发模式（Vite 1420 + 桌面窗口）
npm run build      # 前端类型检查 + 构建
cd src-tauri && cargo check   # Rust 侧检查
npm run tauri build           # 打包安装包
```

## 目录结构

```
src/             Vue 前端（五面板：文档库/智能分析/生成工作台/实时热点/消耗统计）
src-tauri/       Rust 壳（窗口、插件注册、SQLite）
ui-mockup/       界面设计稿（视觉基准，深色主题）
implementation-plan.md   实施计划（P0–P4 阶段、SQLite 表草案、开源选型）
AGENTS.md        仓库协作规则（提交/测试/CHANGELOG/BUG 记录）
CHANGELOG.md     变更日志（每次提交同步更新）
BUGS.md          问题档案（先记录、再修复）
```

## 状态

P0（骨架）进行中：工程初始化已就绪，五面板 UI 骨架与 SQLite 接入为当前阶段。详见 `implementation-plan.md`。
