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

## 记录约定

- 新 Bug 出现时：**先记录、再修复**（记录时间、症状、当时的 commit），修复后补根因与预防。
- 每个 Bug 条目关联其修复 commit 的短哈希（@hash）。
- 预防措施写进相关文档或代码注释，不只是留在 BUGS.md。
