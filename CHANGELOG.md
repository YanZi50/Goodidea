# Changelog

本项目所有重要变更记录于此，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
提交规范与哈希回填规则见 `AGENTS.md` §3。

## [Unreleased]

### Added
- 初始化仓库：项目级协作规则 `AGENTS.md`、`.gitignore`、`.env.example`、`CHANGELOG.md`（@7ec57b0）
- 纳入实施计划文档 `implementation-plan.md`（@7ec57b0）
- 新增 `BUGS.md`（记录 BUG-001~004）与 `AGENTS.md` §7 Bug 记录规则（@329a280）
- 实施计划补充开源选型表与环境差距（Rust 工具链缺失）（@f5b8607）
- 环境工具链装齐（Rust 1.99.0 + MSVC Build Tools），BUG-005 提权修复记录（@1e5bc69）
- 新增首版界面设计稿 `ui-mockup/Goodidea-UI设计稿.html`：深色主题五面板原型（文档库 / 智能分析 / 生成工作台 / 实时热点 / 消耗统计 + 设置），内联 CSS/JS、hash 路由、全部交互按钮带 toast 反馈、示例数据并标注；作为 Tauri P0 前端视觉基准（@b3f31cc）
