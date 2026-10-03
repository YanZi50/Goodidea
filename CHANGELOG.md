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

### Added（P1 核心闭环）
- 文档摄取闭环：拖拽 / 文件选择双通道导入 `.txt` / `.md` / `.docx`（mammoth 解析）；SHA-256 内容哈希去重（重复文件跳过并提示）；段落边界分块（超长段按句子硬切，≤1500 字符/块）；写入 `documents` + `chunks`；文档列表 / 分块总数 / 最近入库全部改为 SQLite 真实数据，空态引导文案；删除文档显式级联清理 chunks（不依赖 SQLite 外键默认关闭行为）；窗口 `dragDropEnabled: false` 启用 WebView 原生拖拽（@b60dc50）
- 验证：vue-tsc + vite build 全绿（含 mammoth 类型）；cargo check 通过；文档库空态渲染 0 控制台错误（@b60dc50）
- AI 接入（Vercel AI SDK v7 + @ai-sdk/openai 4.x，OpenAI 兼容，默认指向火山方舟 `/api/v3`）：设置页「模型接入」表单（显示名 / 模型 ID / Base URL / API Key，密钥仅存本机 localStorage，不入库）；全库分析（读取前 60 块 → 浓缩要点 + 指出问题，Markdown 输出）；生成工作台真实流式生成（textStream 逐段渲染 + 光标 + 完成统计）；消耗模块（常量价格表按模型计价，当日 / 近 7 日 / 近 30 日 / 按模型累计持久化到 localStorage，UsageView 全部真实化）；未配置模型时界面明确引导（@e1c79d5）
- 已知优化项（非阻塞）：引入 AI SDK 后前端 bundle ≈ 995KB（minify），vite 警告 >500KB；P2 按视图 dynamic import 分包（@e1c79d5）
- 验证：vue-tsc + vite build 全绿（389 模块）；设置页 / 工作台渲染 0 控制台错误（@e1c79d5）

### Changed（UX 优化，用户真机反馈）
- 长内容统一「限高 + 右侧滚动条」：新增通用类 `.scroll-limit` / `.scroll-limit-sm`（桌面 460px / 320px，移动端按比例降低，含自定义滚动条样式），应用到文档库表格、智能分析结果、生成工作台输出区；后续所有长内容展示沿用同一模式（@85547a7）
- 智能分析结果 Markdown 渲染：引入 `marked` + `dompurify`，AI 输出的 `##` / `-` / `**` 等符号渲染为排版友好的标题、列表、强调、引用块（输出先经 DOMPurify 消毒，防 AI 注入 HTML/脚本）；生成工作台输出区同样受益（@85547a7）
- 顶栏真实化：移除骨架示例值——模型徽标改读实际配置（未配置时显示「未配置模型」+ 红点），今日消耗改读 `todayCost()` 实时值（5s 轮询刷新）；移除「P0 骨架·全部为示例数据」横幅（真实数据已上线）（@85547a7）
- 验证：vue-tsc + vite build 全绿（391 模块）；文档库 / 智能分析渲染 0 控制台错误；Markdown 样例（h2/列表/强调/引用/分隔线）渲染截图核对通过，无符号残留（@85547a7）

### Fixed（Bug 记录）
- BUG-007：验证通道 inline_dist.py 用 `</body>` 做注入锚点，被 dompurify 构建产物内的 `</body>` 字面量劫持，hash 注入脚本插入 JS 字符串中间破坏语法（渲染全部报 `Unexpected end of input`）；锚点改为内联后唯一的 `<script type="module">`，并明确"注入锚点必须规避 JS 内容字面量"预防规则（@3944871）

### Added（P2 实时热点 + 构建优化）
- 实时热点模块真实化（原为设计稿示例数据）：接入 vvhan 免费热榜 API（抖音热榜 / 微博热搜 / 知乎热榜 / 百度热点 四个源）；`tauri-plugin-http` 插件走 Rust 侧请求绕过 CORS（capabilities 白名单 vvhan 等 5 个热点 API 域名）；行业关键词标记——名表 / 包袋 / 回收 / 奢侈品等 23 词命中条目高亮「行业相关」标签，支持「只看行业相关」筛选；点击条目经 opener 在浏览器打开原文；接口不可用显示错误态 + 手动输入话题兜底（@c9253ee）
- bundle 分包：vite rolldown manualChunks 将 AI SDK（vendor-ai）、文档解析 mammoth（vendor-doc）、Markdown（vendor-md）、Vue 运行时（vendor-vue）拆为独立 chunk，主包 1068KB → 42KB，缓存复用提升；vendor-ai 583KB 为 AI SDK 固有体积，警告保留，彻底方案（视图级 dynamic import）留待后续（@c9253ee）
- 验证：vue-tsc + vite build 全绿（396 模块）；cargo check 通过（tauri-plugin-http 2.8.0）；热点页经 HTTP 通道渲染 0 JS 错误（vvhan 在本验证环境不可达属预期，错误态正常显示）（@c9253ee）
- BUG-008：vite rolldown 分包后 file:// 内联验证法失效（modulepreload 链接与 chunk 相对 import 被 CORS 拦截）；验证通道切换为本机 HTTP 服务（127.0.0.1:8765）+ shot.py URL 模式，与 Tauri 真机自定义协议加载行为一致（@0667bf5）
- 价格表收录 DeepSeek：`deepseek-v4-flash`（1元/2元 每百万 tokens）、`deepseek-v4-pro`（3元/6元），`deepseek-chat` 旧名兼容映射（官方 2026-07-24 弃用后等价 v4-flash 非思考模式）；接入方式不变——设置页填 `https://api.deepseek.com` + API Key 即可（OpenAI 兼容）。价格以官方定价页为准，峰谷/优惠时段可能有差异（@78e6559）
