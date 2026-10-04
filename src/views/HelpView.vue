<script setup lang="ts">
import { ref } from "vue";

/** 常见问题展开状态（默认展开第一个） */
const openFaq = ref<number>(0);

const faqs: { q: string; a: string }[] = [
  {
    q: "如何配置/切换 AI 模型？",
    a: "设置页「模型接入」新增档案（显示名、模型 ID、Base URL、API Key、思考模式），顶部顶栏下拉一键切换当前模型，设置页会即时同步。密钥只存在本机 SQLite，不会入库、不进 git。首次配置后回到生成工作台即可开始生成。",
  },
  {
    q: "模型价格是怎么算的？",
    a: "设置页「计费价格表」按模型名匹配（包含即命中），单位元/百万 token；保存在 SQLite（billing_rules），未配置时用内置默认价。顶栏「今日消耗」实时累计本次会话的分析 + 生成费用。",
  },
  {
    q: "如何导入素材建立知识库？",
    a: "文档库页「导入」支持 .docx / .md / .txt，也可以直接粘贴文本入库；相同内容（SHA-256）自动去重。导入后可新建分组、批量移组/删除，每个分组互不干涉，「全部」查看所有文档。",
  },
  {
    q: "智能分析和生成工作台的区别？",
    a: "智能分析：对选定范围（全部/未分组/某组/单篇/仅新增）的文档做核心要点提炼与问题诊断；生成工作台：基于 Skill 模板（口播带货/剧情短视频/行情科普/小红书种草）+ 关联素材 + 热点，生成新文案。两者的历史都会自动记录，可在各自工作台的「历史记录」面板回看、回填、复用。",
  },
  {
    q: "热点源为什么是 60s.viki.moe？",
    a: "热榜接入实测发现 vvhan 系列域名在本机网络 DNS 不可达（BUG-013），已切换为主源 60s.viki.moe（抖音/微博/知乎/头条四平台），vvhan 保留为兜底。若换网络环境后主源不可用会自动尝试备用源。",
  },
  {
    q: "如何备份和还原知识库？",
    a: "侧栏「导出」把文档/分组/价格表/模型档案导出为 JSON 备份文件；设置页「还原备份」选择备份文件后重建（模型档案保留不动，防止密钥被旧备份覆盖）。还原由 Rust 单连接事务执行，任一步失败整体回滚并提示具体原因。",
  },
  {
    q: "查重是什么原理？",
    a: "生成工作台输出区「查重」按钮：本地字符 bigram Jaccard 相似度，把当前文案与知识库全部素材 + 生成历史比对（不消耗模型 token、不联网）。相似度 ≥50% 高危建议改写，≥35% 中危检查关键句。",
  },
  {
    q: "界面亮暗怎么切换？",
    a: "侧栏左下角「浅色 / 暗色」按钮切换主题，选择持久化保存，重启应用后保持。",
  },
];
</script>

<template>
  <div>
    <div class="kpis">
      <div class="kpi"><div class="k">首次上手</div><div class="v" style="font-size:17px">4 步</div><div class="d">配置 → 导入 → 分析 → 生成</div></div>
      <div class="kpi"><div class="k">功能模块</div><div class="v" style="font-size:17px">6 个</div><div class="d">文档库/分析/生成/热点/消耗/设置</div></div>
      <div class="kpi"><div class="k">常见问题</div><div class="v" style="font-size:17px">{{ faqs.length }}</div><div class="d">点开即答</div></div>
      <div class="kpi"><div class="k">数据安全</div><div class="v" style="font-size:17px">本地</div><div class="d">SQLite + 备份导出</div></div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-title">快速上手 <span class="hint">4 步跑通全流程</span></div>
      <div class="steps">
        <div class="step"><span class="step-no">1</span><div><div class="step-t">配置模型</div><div class="step-d">设置 → 模型接入 → 「+ 新增模型」，填入 API Key（如 DeepSeek）与模型 ID，自动设为当前</div></div></div>
        <div class="step"><span class="step-no">2</span><div><div class="step-t">导入素材</div><div class="step-d">文档库 → 导入 .docx / .md / .txt 或粘贴文本，自动去重分块；按需新建分组归类</div></div></div>
        <div class="step"><span class="step-no">3</span><div><div class="step-t">智能分析</div><div class="step-d">选范围（全部/分组/单篇/仅新增）→ 开始分析，得到核心要点与问题诊断</div></div></div>
        <div class="step"><span class="step-no">4</span><div><div class="step-t">生成内容</div><div class="step-d">生成工作台选 Skill 模板 + 关联素材 + 可选热点 → 写需求 → 开始生成 → 查重 → 复制/导出分镜表</div></div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-title">功能模块 <span class="hint">左侧导航对应位置</span></div>
      <div class="mods">
        <div class="mod"><div class="mod-t">文档库</div><div class="mod-d">素材沉淀：导入/粘贴入库、SHA-256 去重、分组管理、批量删除/移组、单篇分析入口</div></div>
        <div class="mod"><div class="mod-t">智能分析</div><div class="mod-d">核心要点 + 指出问题（矛盾/缺口/低质段落），支持全部/未分组/按组/单篇/仅新增五种范围</div></div>
        <div class="mod"><div class="mod-t">生成工作台</div><div class="mod-d">口播带货/剧情短视频/行情科普/小红书种草模板，关联素材自动检索，热点一键接入，输出流式渲染 + 查重 + 导出分镜表 + 历史回填</div></div>
        <div class="mod"><div class="mod-t">实时热点</div><div class="mod-d">抖音/微博/知乎/头条四平台热榜，行业关键词标记，条目「生成」图标一键接入生成工作台</div></div>
        <div class="mod"><div class="mod-t">消耗统计</div><div class="mod-d">按模型分组统计今日费用，含 token 明细，价格表可维护</div></div>
        <div class="mod"><div class="mod-t">设置</div><div class="mod-d">模型档案多份管理、数据存储与备份还原、计费价格表维护</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">常见问题 <span class="hint">点击展开</span></div>
      <div v-for="(f, i) in faqs" :key="i" class="faq-item" @click="openFaq = openFaq === i ? -1 : i">
        <div class="faq-q">{{ f.q }} <svg class="chev" viewBox="0 0 24 24" :style="{ transform: openFaq === i ? 'rotate(180deg)' : '' }"><path d="M6 9l6 6 6-6" /></svg></div>
        <div v-if="openFaq === i" class="faq-a">{{ f.a }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.steps { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.step { display: flex; gap: 10px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius); }
.step-no { width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; background: var(--accent); color: #000; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.step-t { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 3px; }
.step-d { font-size: 12.5px; color: var(--text-muted); line-height: 1.55; }
.mods { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.mod { padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); }
.mod-t { font-size: 14px; font-weight: 600; color: var(--accent); margin-bottom: 5px; }
.mod-d { font-size: 12.5px; color: var(--text-muted); line-height: 1.55; }
.faq-item { border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; overflow: hidden; }
.faq-q { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; font-size: 13.5px; color: var(--text); cursor: pointer; background: var(--surface-2); }
.faq-q .chev { width: 16px; height: 16px; fill: none; stroke: var(--text-muted); transition: transform .15s; }
.faq-a { padding: 10px 14px; font-size: 12.5px; color: var(--text-muted); line-height: 1.65; border-top: 1px solid var(--border); }
@media (max-width: 900px) { .steps, .mods { grid-template-columns: 1fr; } }
</style>
