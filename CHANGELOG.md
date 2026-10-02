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
- 初始化 Tauri 2 + Vue 3 + TS 工程脚手架（vue-ts 官方模板手动渲染落地）：Vite 8 / vue-tsc 3 构建链路全绿、`tauri.conf.json`（identifier=com.goodidea.app，窗口 800×600）、src-tauri 薄壳（tauri 2.12 + opener 插件）、前端/后端依赖分别锁定（package-lock.json + Cargo.lock）（@）
- 新增 `README.md`：项目定位、开发命令（dev/build/check/打包）、目录结构、P0 状态说明
- BUGS.md 记录 BUG-006：create-tauri-app `--force` 清空目标目录事故（即使报错退出），脚手架通道改为模板手动渲染（@）
