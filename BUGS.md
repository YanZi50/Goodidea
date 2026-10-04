# BUGS.md — Bug 记录与解决方案

> 目的：记录本项目开发过程中出现的问题（症状、根因、解决、预防），防止 Bug 复现与功能模块冲突。
> 规则见 `AGENTS.md` §7。每个条目包含：日期、关联 commit、所属模块、症状、根因、解决、预防。

---

## BUG-001：git push 反复 "Permission denied (publickey)"

- **日期**：2026-10-02
- **关联 commit**：`7ec57b0`（初始化仓库，推送时触发）
- **所属模块**：仓库/认证（GitHub SSH）
- **症状**：`git push -u origin main` 报 `git@github.com: Permission denied (publickey)`；`ssh -T -v` 显示 `Server accepts key`（服务器验签通过）但随后拒绝。
- **根因**：同一把公钥（`~/.ssh/id_ed25519`，注释 `codex-github`）被注册在**多个 GitHub 账号**下。GitHub 对歧义映射一律拒绝，即使密钥本身合法。诊断关键：强制单密钥 `ssh -T -i <key>` 仍拿不到账号问候（正常应返回 `Hi <username>!`）。
- **解决**：生成一把新专用密钥 `~/.ssh/id_ed25519_goodidea`，仅注册到 YanZi50 账号；仓库级配置 `git config core.sshCommand "ssh -i C:/Users/admin/.ssh/id_ed25519_goodidea -o IdentitiesOnly=yes"`。认证确认：`Hi YanZi50! You've successfully authenticated`。
- **预防**：① 同一把公钥**不得**注册到多个 GitHub 账号；② 新项目用专用密钥而非复用旧 key；③ 认证失败先看 `ssh -T -v` 是否有 `Server accepts key`，区分"密钥非法"与"账号映射歧义"。

---

## BUG-002：core.sshCommand 中 Windows 反斜杠路径被 git 内部 sh 吃掉

- **日期**：2026-10-02
- **关联 commit**：`7ec57b0`（推送阶段）
- **所属模块**：仓库/SSH 配置
- **症状**：配置 `core.sshCommand "ssh -i C:\Users\admin\.ssh\id_ed25519_goodidea ..."` 后推送失败，日志：`Warning: Identity file C:Usersadmin.sshid_ed25519_goodidea not accessible`（反斜杠全部消失）。
- **根因**：git 通过 shell（MSYS sh）执行 `core.sshCommand`，未加引号的 `C:\Users\...` 在 sh 解析时反斜杠被当作转义符吞掉。
- **解决**：路径改用正斜杠：`git config core.sshCommand "ssh -i C:/Users/admin/.ssh/id_ed25519_goodidea -o IdentitiesOnly=yes"`。
- **预防**：git 配置中出现 Windows 路径时一律用**正斜杠**或双引号包裹；推送失败先看完整 stderr 而非只读 "Permission denied"。

---

## BUG-003：PowerShell 吞掉 ssh/git 的错误输出（本环境特有）

- **日期**：2026-10-02
- **关联 commit**：无（工具链问题）
- **所属模块**：开发环境/工具链
- **症状**：`ssh -T git@github.com`、`git push` 等命令在 PowerShell 中报错时，stdout/stderr 经常显示为空（exit code 非 0 但无输出），导致无法定位原因。
- **根因**：PowerShell 对原生命令 stderr 的包装行为 + 本工具链输出截断的综合现象。
- **解决**：用 `cmd /c "命令 > 文件 2>&1"` 把输出重定向到文件，再用 Read 工具读取。
- **预防**：涉及 ssh/git/原生命令的错误诊断，默认走"文件重定向 + Read"通道，不要依赖终端回显。

---

## BUG-004：PowerShell 吞掉 `-N ""` 空字符串参数（ssh-keygen 报错）

- **日期**：2026-10-02
- **关联 commit**：无（工具链问题）
- **所属模块**：开发环境/工具链
- **症状**：`ssh-keygen ... -N ""` 报 `option requires an argument -- N`，密钥生成失败。
- **根因**：PowerShell 向原生命令传递空字符串参数时被吞掉，`-N` 后没有参数。
- **解决**：用 `cmd /c 'ssh-keygen ... -N ""'` 包裹执行。
- **预防**：PowerShell 传空字符串/特殊字符给原生命令时，优先用 `cmd /c` 包裹或写脚本文件。

---

## BUG-005：VS 安装器静默 modify 因非提权返回 5007，且退出码被分发器掩盖

- **日期**：2026-10-02
- **关联 commit**：`1e5bc69`（环境就绪记录）
- **所属模块**：开发环境/VS Build Tools 安装
- **症状**：`vs_installer.exe modify --quiet --add Microsoft.VisualStudio.Workload.VCTools ...` 返回 0 但组件未安装（link.exe 缺失、vswhere 查不到 VC.Tools）。
- **根因**：① `vs_installer.exe` 是分发器，立即返回 0，真实安装发生在子进程 `setup.exe`，其退出码被掩盖；② 真实日志显示 `Commands with --quiet or --passive should be run elevated from the beginning`（退出码 5007）——非提权进程执行静默修改被 VS 安装器拒绝；③ 附带坑：`--log` 不是 `setup.exe modify` 的合法参数（引导器专属），会报"选项'log'未知"（退出码 87）。
- **解决**：用 `Start-Process -Verb RunAs` 提权执行 `vs_installer.exe modify --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet --norestart`，成功（退出码 3010＝成功需重启）；验证 link.exe 存在、`rustc` 编译链接冒烟测试通过。
- **预防**：VS 组件安装/修改必须提权运行（`Start-Process -Verb RunAs` 或 winget 自动提权）；`vs_installer.exe` 退出码不可信，以组件实际存在（link.exe/vswhere）为准；VS 安装器日志在 `%TEMP%\dd_installer_*.log`。

---

## BUG-006：create-tauri-app --force 静默清空目标目录全部文件（即使后续报错退出）

- **日期**：2026-10-02
- **关联 commit**：`5c61e2d`（工程初始化，事故发生于脚手架阶段）
- **所属模块**：工程脚手架/工具链
- **症状**：在已有 git 仓库根目录运行 `create-tauri-app . --force --yes ...`，命令最终以 `os error 32`（文件被占用）失败退出，但**仓库根目录被清空**：AGENTS.md、.gitignore、CHANGELOG.md、BUGS.md、.env.example、implementation-plan.md、ui-mockup/Goodidea-UI设计稿.html 全部消失；`git status` 显示大面积 `D`（deleted）。
- **根因**：`create-tauri-app 4.x` 的 `--force` 语义 = "目标目录非空时**先清空目录内容再写模板**"。该清理动作在报错（本项目环境里 NAPI-RS 原生模块加载/执行被占用，os error 32）之前就已执行；此外本环境 `create-tauri-app` 的二进制始终无法完成 scaffold（--version 正常、scaffold 必报 32），工具在本机不可用。
- **解决**：`git checkout -- .` 从 HEAD 恢复全部被删文件（git 历史完好无损）；脚手架改用"从官方仓库 `templates/` 目录手动渲染模板"通道完成（占位符 `{% %}` 替换 + `%(v2)%` 文件名裁剪 + 二进制 icons 直接复制）。
- **预防**：① **严禁**在含未提交/自有文件的目录对脚手架工具使用 `--force`；② 工程初始化前先确认仓库干净并做好全量备份；③ create-tauri-app 类工具异常退出（尤其 os error 32）不代表"没有副作用"，事后必须 `git status` 核查；④ 本机脚手架通道固定为"模板仓库手动渲染"。

---

## BUG-007：inline_dist.py 的 `</body>` replace 被构建产物字面量劫持，注入脚本插入 JS 中间破坏语法

- **日期**：2026-10-03
- **关联 commit**：（修复中，见 @hash）
- **所属模块**：验证通道（ui-mockup/_shots/tpl/inline_dist.py）
- **症状**：引入 marked + dompurify 后，shot.py 渲染 inline 产物全部报 `Uncaught SyntaxError: Unexpected end of input`（consoleErrors=1，双端一致）。
- **根因**：dompurify 产物中含 `"<head></head><body>"` / `"</body>"` 字面量（其 DOM 解析探测逻辑）。inline_dist.py 用 `html.replace("</body>", "<script>location.hash='...';</script></body>")` 注入 hash 脚本，`str.replace` 替换**第一个**出现处——命中了主 JS 内部的 `</body>` 字符串，注入脚本被插进 JS 字符串字面量中间 → 脚本块被提前截断/语法破坏。
- **解决**：注入锚点从 `</body>` 改为 `<script type="module">`（内联后该字符串在文件中唯一），注入脚本置于 module script 之前执行（`html.replace('<script type="module">', '<script>location.hash=...;</script><script type="module">', 1)`），不再依赖 HTML 结构字符串。
- **预防**：① inline 工具注入点必须选择内联后**唯一且不属于 JS 内容**的锚点（`<script type="module">`）；② 引入新依赖后必须重跑 shot.py 全量验证，不能假设旧产物行为不变；③ 依赖产物可能含任意 HTML 结构字面量（`</body>`/`</head>`/`<script>`），一切 `replace` 注入都要规避 JS 内部命中。

---

## BUG-008：vite rolldown 分包后 file:// 内联验证法失效（chunk 相对 import 被 CORS 拦）

- **日期**：2026-10-03
- **关联 commit**：（修复中，见 @hash）
- **所属模块**：验证通道（ui-mockup/_shots/tpl/inline_dist.py）
- **症状**：加入 manualChunks 分包后，inline_dist.py 生成的内联单文件在 file:// 下渲染，全部 chunk 报 `Access to script at 'file:///.../vendor-*.js' has been blocked by CORS policy`（modulepreload 链接与 chunk 相对 import 均被拦，consoleErrors 高达 20）。
- **根因**：① rolldown 产物在 index.html 中输出 `<link rel="modulepreload">` 预加载链接，file:// origin null 下被 CORS 拦截；删除后仍有 `dist/rolldown-runtime-*.js` 等**无 assets/ 前缀的相对 import**（chunk 间引用），内联单文件无法覆盖；② 此前单 chunk 产物无 modulepreload、无 chunk 相对引用，内联法才可用。
- **解决**：验证通道切换为「本机 HTTP 服务 + shot.py URL 模式」：`python -m http.server 8765 --directory dist` 后台起服 → `shot.py "http://127.0.0.1:8765/index.html#<frag>"`（输出到 `%TEMP%\..\_shots` 即 D:\Myfolder\doubao\_shots，注意 outdir 与 file:// 模式不同）。HTTP 通道下 chunk 加载正常，Tauri 真机（自定义协议加载 dist）同样无此问题。
- **预防**：① 引入任何 chunk 化（manualChunks / dynamic import）后，file:// 内联验证法不再可靠，统一走 HTTP 通道；② 渲染产物多 chunk 时不要尝试修补 inline 工具适配 chunk（代价高且脆），直接换通道；③ 本机 HTTP 服务端口 8765 固定用于验证（脚本模式记录在 tpl 目录注释）。

---

## BUG-009：DeepSeek V4 默认思考模式吃光 max_tokens，正文输出为空（且偏慢偏贵）

- **日期**：2026-10-03
- **关联 commit**：@584c9db
- **所属模块**：AI 接入（src/lib/ai.ts + 设置页思考模式开关）
- **症状**：实测 `deepseek-v4-flash` 默认请求（不传思考参数）下 `max_tokens=300` 时，usage 输出 300 tokens **全部为 reasoning_tokens，正文为空**；此前实测 750 输出中 695 为 reasoning（按输出价计费、偏慢偏贵）。用户在默认思考模式下可能遇到「分析结果空白 / 内容很短」且费用偏高。
- **根因**：DeepSeek V4 默认启用思考模式（官方文档确认 "enabled by default"），reasoning 与正文**共享 max_tokens 配额**；小 max_tokens 下 reasoning 先吃掉配额，正文无剩余。
- **解决**：新增「思考模式」开关（设置 → 模型接入，默认**关闭**）。关闭时经 `providerOptions.openai.reasoningEffort = "none"` 透传（DeepSeek Chat Completions 官方支持 none 关闭思考）；开启时传 `"high"`。仅对 model 含 deepseek 生效，其他兼容端点不传以免未知参数。实测 none：in=26/out=100/reasoning=0、正文完整、费用约为思考模式 1/3；high：out=300 全 reasoning 正文为空（复现原问题）。另：开启思考时应用侧需注意 max_tokens 需 ≥2048（官方建议）。
- **预防**：① 新增模型默认值优先「非思考」或提供开关，避免 reasoning 配额抢占；② 模型行为变化需真机/直连实测（tpl/thinking_probe.mjs 已留存），不依赖假设；③ 思考模式下 max_tokens 配额共享，小配额 = 正文为空，UI 需提示或自动加大。

---

## BUG-010：shot.py chrome_cli 降级模式截图视图错位（SPA hash 路由）

- **日期**：2026-10-03
- **关联 commit**：@234f3ed
- **所属模块**：验证工具链（html skill scripts/shot.py）
- **症状**：`shot.py` 在 playwright 缺失的降级模式（chrome_cli + CDP，本环境实际用 Edge）下，对带 hash 的 URL（`index.html#analysis / #hotspot / #library`）截图，渲染结果一律显示「生成工作台」，与请求视图不符；此前 playwright 模式截图正常。
- **根因**：降级模式 CDP 截图流程对 SPA hash 路由的渲染时机/状态处理与 playwright 路径不一致（疑似稳态判定提前或注入副作用），**非应用路由 bug**——用系统 Edge headless 直连同一 URL（`msedge --headless=new --disable-gpu --no-sandbox --window-size=1440,900 --virtual-time-budget=6000 --screenshot=<out> "<url>"`）验证：`#analysis` 正确显示智能分析页、`#hotspot` 正确显示实时热点页、左下角亮度滑块均正常渲染。
- **解决**：验证通道调整为「**Edge headless 直连截图做视觉核对**（`--virtual-time-budget=6000` 保证 Vue mount）+ shot.py 报告（consoleErrors / horizontalOverflow lint）做错误核对」；shot.py 截图仅作辅助，发现与请求视图不符时以 Edge 直连为准。
- **预防**：涉及 hash 路由的 SPA 截图验证，优先用 Edge headless 直连；发现 shot.py 降级截图可疑时先 Edge 直连复核，勿据此误判应用 bug（本次曾险些误判 hash 路由失效）。

---

## BUG-011：左下角亮暗滑块拖动无反应（inject ref 模板解包失效）

- **日期**：2026-10-03
- **关联 commit**：@e5f28de
- **所属模块**：UI（src/components/Sidebar.vue + src/App.vue 亮度注入）
- **症状**：用户反馈左下角滑块拖动无反应，页面明暗不变化；滑块元素本身渲染正常。
- **根因**：Sidebar 中 `const brightness = inject("brightness") as { value: number }`，模板绑定 `v-model.number="brightness.value"`。Vue 3 script setup 对顶层 ref 变量在模板中**自动解包**：`brightness` 在模板中已被解包为 `number`，再访问 `.value` 得到 `undefined`，v-model 的赋值也写不到 ref 上——滑块与页面亮度失去连接。
- **解决**：Sidebar 改为 `const brightness = inject<Ref<number>>("brightness") ?? ref(1)`，模板直接用 `v-model.number="brightness"`（顶层 ref 自动解包 + 赋值写 `.value`），App 侧 `filter: brightness()` 随 ref 更新。
- **预防**：模板中**不要**对 inject/provide 来的 ref 写 `xxx.value`（自动解包会先解包成值）；inject ref 统一用 `inject<Ref<T>>("key")` 类型标注并在模板直接绑定变量名。涉及响应式绑定的 UI 改动需真机或交互验证，headless 截图只能证明渲染存在、不能证明交互生效。

---

## BUG-012：searchMaterialChunks SQL 参数错位（id NOT IN 占位符与实参不匹配）

- **日期**：2026-10-04
- **关联 commit**：@759ce7d
- **所属模块**：数据库检索（src/lib/db.ts，生成工作台素材接通新增）
- **症状**：素材检索函数 `searchMaterialChunks` 中「文件名命中补充查询」的 `id NOT IN (...)` 占位符按 `seen` 文档数生成，但实参只传了关键词数组——当命中文档数（seen）与关键词数（like）不等时（几乎必然），`$N` 缺参数，SQL 执行报错，素材检索静默失败。
- **根因**：构造 SQL 时占位符数量按一组变量（seen）计算、实参却按另一组（like）传参，两处数量口径不一致。
- **解决**：合并传参 `[...like, ...seenIds]`，`id NOT IN` 占位符从 `$${i + like.length + 1}` 起编号，与合并后的实参顺序对齐；`seen` 为空时退化为 `IN (0)`。
- **预防**：手写带占位符 SQL 时，占位符编号与实参数组**同一处定义、逐一核对**；多组参数拼接后立即检查编号连续性与数量一致（参数编号从 1 递增、实参顺序对应）。

---

## BUG-013：热榜主源 vvhan 在本机网络 DNS 不可达（热点页一直报错）

- **日期**：2026-10-04
- **关联 commit**：@e633613
- **所属模块**：实时热点（src/lib/hotlist.ts + capabilities 白名单）
- **症状**：热点页无论 Tauri 真机还是浏览器预览均报「热榜接口暂不可用（Failed to fetch）」；代码链路完整（Tauri HTTP 插件 + 白名单 + 解析）却拿不到数据。
- **根因**：**本机网络 DNS 无法解析 `api.vvhan.com`**（实测 `getaddrinfo failed`；同批 api.pearktrue.cn / api-hot.imsyy.top / dailyhotapi.com 同样 DNS 失败，api.oioweb.cn 证书自签名被拒）——是数据源域名不可达，不是接入代码问题。唯一实测可达的热榜源为 **60s.viki.moe**（开源 60s-api，HTTP 200、带 CORS、douyin/weibo/zhihu/toutiao 四平台）。
- **解决**：主源切换为 `https://60s.viki.moe/v2/{douyin|weibo|zhihu|toutiao}`（解析 `hot_value / hot_value_desc` 归一热度、`link` 作原文链接；百度平台 60s 无端点 → 头条热榜替代）；vvhan 降为兜底（DNS 恢复时自动可用）；capabilities 白名单补 `https://60s.viki.moe/*`。
- **预防**：接入任何外部 API 前先在本机实测 DNS + HTTP（tpl/probe_hotapi.py 已留存）；多源热榜保留 fallback 链（主源失败自动切备源），不要把单一不可达域名当主源写死。

---

## BUG-014：备份还原失败——tauri-plugin-sql 连接池下 last_insert_rowid() 跨连接取错

- **日期**：2026-10-04
- **关联 commit**：@47a0c9d（引入）、@18d7262（显式 id 缓解）、@2d37721（根治）
- **所属模块**：知识库备份还原（src/lib/db.ts importBackupData + src-tauri/src/lib.rs import_backup）
- **症状**：真机「还原备份」失败（导入计数异常或 chunks.doc_id 指向不存在的文档，文档可导入但分块错位；后续版本表现为 toast「还原失败（数据库不可用）」且库内无数据写入）。
- **根因**：两层问题。① tauri-plugin-sql 内部为连接池（r2d2/sqlx），`d.execute(INSERT)` 与随后 `SELECT last_insert_rowid()` 可能命中**不同连接**，返回的不是本次 INSERT 的自增 id（跨连接读不到/读错）；② 连接池下 `BEGIN / DELETE / INSERT / COMMIT` 各语句同样可能落在不同连接，事务语义完全失效（BEGIN 连接 A 上开了空事务，写入在连接 B/C 上 autocommit），前端无法保证原子还原；且原实现对错误只 console.error 后返回 null，界面误报「数据库不可用」，看不到真实 SQLite 错误。
- **解决**：还原整体下沉 Rust——新增 `import_backup(app, json)` 命令（rusqlite bundled），单连接上执行 `PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE; → DELETE/INSERT（参数绑定）→ COMMIT`，任一步失败整体 ROLLBACK；解析失败/非法备份/执行失败均返回具体错误字符串，前端 invoke reject 后 toast 透传真实原因。导出仍为前端生成 JSON（只读，无事务风险）。
- **预防**：连接池环境下禁止依赖跨语句事务与 `last_insert_rowid()`；需要多语句原子操作时下沉 Rust 单连接（rusqlite/sqlx Connection 而非 Pool）；前端收到 null/失败时把底层错误透传给用户，不吞错。代码注释已标注（db.ts importBackupData、lib.rs import_backup）。

---

## BUG-015：AI 请求被 WebView2 CORS 拦截——中转类兼容端点（无 ACAO 头）一律 Failed to fetch

- **日期**：2026-10-04
- **关联 commit**：@2d37721
- **所属模块**：AI 请求通道（src/lib/ai.ts providerFor + src-tauri/capabilities/default.json）
- **症状**：设置页「测试」与生成/分析均报 `Failed to fetch`，但 DeepSeek 官方档案正常；用同一 key 在本机 python 直连该端点（aigd.top，OpenAI 兼容中转）HTTP 200 正常返回，应用内却必失败。
- **根因**：AI 请求此前走 WebView2 **原生 fetch**，受浏览器 CORS 模型约束——跨域请求要求响应携带 `Access-Control-Allow-Origin`。DeepSeek/火山官方端点带 ACAO 放行；aigd.top 这类中转站响应**无 ACAO 头** → WebView 拦截 → 报 Failed to fetch（网络层错误，掩盖了真实 HTTP 状态）。capabilities 的 http:default 白名单此前只放行热点域名，且前端热点模块已走 Rust 通道（hotlist.ts 用 plugin-http fetch），AI 通道未接入，两端行为不一致。
- **解决**：AI 请求在 Tauri 运行时统一改走 Rust 网络栈——`providerFor()` 给 createOpenAI 注入 `fetch: isTauriRuntime() ? tauriFetch : undefined`（@tauri-apps/plugin-http，reqwest 实现，无 CORS 概念）；capabilities http:default allow 放宽为 `https://**` + `http://**`（产品定位"任意 OpenAI 兼容端点"，含局域网自建端点），deny 留空。web 预览无插件仍走原生 fetch（浏览器 CORS 无法绕过，失败时提示改用桌面应用）。
- **预防**：应用内任何外部 HTTP 一律走 plugin-http Rust 通道（与热点模块一致）；接新端点若 Failed to fetch，先区分 CORS（无 ACAO 头）与账号问题（403 billing_error）——见 probe_aigd.py/probe_cors.py 留存脚本。代码注释已标注（ai.ts providerFor）。

---

## BUG-016：消耗统计恒为 0——计费按档案 label 匹配价格表，与模型名永远不命中

- **日期**：2026-10-04
- **关联 commit**：@643b2fc
- **所属模块**：消耗统计（src/lib/ai.ts priceFor + StudioView/AnalysisView/UsageView 调用点）
- **症状**：真实调用模型后 DeepSeek 官网有消耗，应用内「今日消耗 ¥0.00」、消耗统计页按模型无金额；反复生成也不累计。
- **根因**：`calcCost(modelLabel, usage)` 的 `priceFor` 用 `modelLabel.includes(priceKey)` 匹配价格表（PRICE_TABLE / billing_rules，key 为**模型名**如 deepseek-v4-flash）；而三个调用点传入的是**档案 label**（如 "Deepseek"）——档案名与价格表 key 无包含关系，永不命中 → 返回 `{in:0,out:0}` → amount 恒 0，`addCost` 累加 0。多档案体系引入 label 后调用点未同步改传模型名。
- **解决**：调用点统一改传 `cfg.model`（模型名）→ `calcCost(cfg.model, usage)` / `addCost(cfg.model, amount)`；统计 key 与价格表 key 一致（模型名）；UsageView 对未收录模型显示「未收录单价（可在设置→价格表添加）」替代误导性的 ¥0/1M。
- **预防**：价格匹配、统计 key、价格表 key 三者必须同构（统一模型名）；改动档案体系字段后全局搜索其调用点核对参数语义，不只查类型（label/model 均为 string，类型检查查不出）。代码注释已标注（ai.ts priceFor/calcCost）。

---

## BUG-017：备份还原后分组全部丢失、已分组文档成孤儿隐身——groups 还原未保留 id，group_id 引用断裂

- **日期**：2026-10-04
- **关联 commit**：@待回填
- **所属模块**：备份还原（src-tauri/src/lib.rs import_backup + src/lib/db.ts exportBackupData）
- **症状**：用户还原备份后文档库「分组」面板显示 0 个组，「未分组」只剩 25 篇，其余 62 篇在列表、统计、分析中全部「消失」；库内 `documents.group_id` 指向已不存在的分组 id（1814/1815/1817/1818/650），groups 表为空。删除分组行为本身正常（deleteGroup 先置 NULL 再删组，自引入起正确）。
- **根因**：`import_backup` 重建分组时执行 `INSERT INTO groups (name, created_at)`——**不插入备份中的原始 id**，SQLite 按自增序列重新分配新 id；而 documents 插入用的是备份里的**原始 group_id**。旧库 group_id 是 1000+ 的大 id，重建后 groups 新 id 从 1（或自增序列末值）起，两者永不对应 → 已分组文档全部成为孤儿（LEFT JOIN 不显示、COUNT(group_id IS NULL) 不计入）→ 分组 0 个 + 未分组只剩备份时本来就未分组的文档。根源是备份格式 v1 的 groups 未携带 id，还原时 id 语义丢失。
- **解决**：① 立即修复存量数据——`UPDATE documents SET group_id=NULL WHERE group_id NOT IN (SELECT id FROM groups)`，62 篇孤儿归回未分组（文档未删，可逆）；② 备份格式升 v2——导出 `groups` 携带 `id`，`BackupGroup.id: Option<i64>` 兼容旧备份；还原时新备份（全部带 id）按原始 id 插 groups、documents 原样带 group_id，归属完全一致；旧备份（无 id）组按自增重建、文档 group_id 一律归 NULL（宁可见全不隐身，杜绝孤儿）。
- **预防**：① 备份还原必须保留外键引用语义（groups.id → documents.group_id），重建时不能丢弃原始 id；② 涉及引用完整性重建的导入逻辑，还原后必须自查 `documents.group_id NOT IN (SELECT id FROM groups)` 是否为 0；③ 备份格式变更需向前兼容（Option 字段 + version 标记），旧备份走降级路径而不是报错。代码注释已标注（lib.rs import_backup、db.ts exportBackupData）。

## 记录约定

- 新 Bug 出现时：**先记录、再修复**（记录时间、症状、当时的 commit），修复后补根因与预防。
- 每个 Bug 条目关联其修复 commit 的短哈希（@hash）。
- 预防措施写进相关文档或代码注释，不只是留在 BUGS.md。
