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
- 初始化 Tauri 2 + Vue 3 + TS 工程脚手架（vue-ts 官方模板手动渲染落地）：Vite 8 / vue-tsc 3 构建链路全绿、`tauri.conf.json`（identifier=com.goodidea.app，窗口 800×600）、src-tauri 薄壳（tauri 2.12 + opener 插件）、前端/后端依赖分别锁定（package-lock.json + Cargo.lock）（@5c61e2d）
- 新增 `README.md`：项目定位、开发命令（dev/build/check/打包）、目录结构、P0 状态说明
- BUGS.md 记录 BUG-006：create-tauri-app `--force` 清空目标目录事故（即使报错退出），脚手架通道改为模板手动渲染（@5c61e2d）

### Changed
- 五面板深色 UI 骨架落地（Vue3 + TS）：文档库 / 智能分析 / 生成工作台 / 实时热点 / 消耗统计 / 设置六视图组件 + 侧栏/顶栏组件；设计稿 CSS（16.8KB）提取为全局样式 `src/assets/main.css`，类名与设计稿对齐；hash 路由 + v-show 视图切换；全部按钮带 toast 反馈（无僵尸按钮）；示例数据渲染并标注（@d543667）
- `index.html`：lang=zh-CN、内联 SVG favicon、标题 Goodidea；`vite.config.ts` base 改相对路径（file:// 可直接打开构建产物，兼容 Tauri 自定义协议）（@d543667）
- 窗口尺寸 800×600 → 1280×800（min 960×640，居中），适配桌面工作台（@d543667）
- 验证：vue-tsc + vite build 全绿；构建产物内联后经 shot.py 双端截图，控制台错误 0 / 溢出 0（@d543667）
- SQLite 接入（tauri-plugin-sql v2 + sqlite feature）：Rust 侧注册插件并内置 Migration v1（documents/chunks 核心表，事务原子、幂等建表）；`tauri.conf.json` 配置 `plugins.sql.preload` 启动即建库；capabilities 授权 `sql:default` + `sql:allow-execute`；数据库文件 `goodidea.db`（AppConfig 目录）（@cf2568b）
- 前端存储封装 `src/lib/db.ts`：惰性连接单例、文档计数 / 表清单 / 连接状态探测，带非 Tauri 环境守卫（file:// 预览不报错）；设置页新增「数据存储」卡展示连接状态与已建表（@cf2568b）
- 验证：cargo check（sqlx/sqlite 编译）与 vue-tsc + vite build 全绿；设置页渲染 0 控制台错误（@cf2568b）
