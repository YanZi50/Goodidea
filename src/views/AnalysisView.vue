<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, inject } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { listDocuments, countChunks, listAllChunkContent, listGroups } from "../lib/db";
import { onDataChanged, onAnalyzeDocRequest } from "../lib/bus";
import {
  loadAIConfig,
  runGeneration,
  calcCost,
  addCost,
  todayCost,
} from "../lib/ai";

const toast = inject("toast") as (msg: string) => void;

const docCount = ref(0);
const chunkCount = ref(0);
const today = ref(0);
const modelLabel = ref("");
const analyzing = ref(false);
const result = ref("");
const lastMeta = ref<{ tokens: string; cost: string; at: string } | null>(null);

// ---- 分析范围：全部 / 未分组 / 按组 / 单篇 ----
const groups = ref<{ id: number; name: string; doc_count: number }[]>([]);
const scope = ref<"all" | "none" | number>("all"); // all=全部 / none=未分组 / number=组 id
const docScope = ref<number | null>(null); // 单篇分析（与 scope 互斥）
const scopeLabel = computed(() => {
  if (docScope.value !== null) {
    const d = docsCache.value.find((x) => x.id === docScope.value);
    return `单篇「${d?.filename ?? `#${docScope.value}`}」`;
  }
  return scope.value === "none" ? "未分组文档" : typeof scope.value === "number" ? `分组「${groupName(scope.value)}」` : "全部文档";
});

// 增量分析基准（localStorage 记上次分析时刻；文档 created_at 晚于基准者视为新增）
const LAST_AT_KEY = "goodidea.lastAnalysisAt.v1";
const incrOnly = ref(false);
function lastAnalysisAt(): number {
  return Number(localStorage.getItem(LAST_AT_KEY) ?? "0") || 0;
}
function markAnalyzed(): void {
  localStorage.setItem(LAST_AT_KEY, String(Date.now()));
}

function groupName(id: number): string {
  return groups.value.find((g) => g.id === id)?.name ?? `#${id}`;
}

/** 当前范围内的文档 id（单篇/按组/增量过滤）；undefined = 全部 */
function scopeDocIds(): number[] | undefined {
  if (docScope.value !== null) return [docScope.value];
  let ids: number[] | undefined;
  if (scope.value === "all") ids = undefined;
  else
    ids = docsCache.value
      .filter((d) => (scope.value === "none" ? d.group_id === null : d.group_id === scope.value))
      .map((d) => d.id);
  if (incrOnly.value) {
    const base = lastAnalysisAt();
    const fresh = docsCache.value.filter((d) => base > 0 && new Date(d.created_at).getTime() > base).map((d) => d.id);
    ids = ids === undefined ? fresh : ids.filter((id) => fresh.includes(id));
  }
  return ids && ids.length > 0 ? ids : undefined;
}
const docsCache = ref<{ id: number; group_id: number | null; filename: string; created_at: string }[]>([]);

async function refresh() {
  docsCache.value = await listDocuments();
  groups.value = await listGroups();
  if (typeof scope.value === "number" && !groups.value.some((g) => g.id === scope.value)) scope.value = "all";
  if (docScope.value !== null && !docsCache.value.some((d) => d.id === docScope.value)) docScope.value = null;
  await refreshScopeStats();
  today.value = todayCost();
  modelLabel.value = loadAIConfig()?.label ?? "";
}

async function refreshScopeStats() {
  const ids = scopeDocIds();
  docCount.value = ids === undefined ? docsCache.value.length : ids.length;
  chunkCount.value = (await countChunks(ids)) ?? 0;
}

onMounted(() => {
  refresh();
  // 文档库数据变更（建组/删组/移组/导入/删除）实时同步本页分组与统计，无需手动刷新
  const off = onDataChanged(() => void refresh());
  // 文档库行内「分析」→ 本页单篇分析
  const offDoc = onAnalyzeDocRequest((id) => {
    scope.value = "all";
    docScope.value = id;
    incrOnly.value = false;
    void refreshScopeStats();
  });
  onUnmounted(() => {
    off();
    offDoc();
  });
});

/** AI 输出（Markdown）→ 消毒后的 HTML */
const renderedResult = computed(() => {
  if (!result.value) return "";
  return DOMPurify.sanitize(marked.parse(result.value, { async: false }) as string);
});

// ---- 问题/建议分离：渲染后把「指出问题」诊断表拆成左右两栏（问题红 / 建议绿） ----
const mdBox = ref<HTMLElement | null>(null);

/** 表头定位列序（不依赖固定列位置，模型列序变化也能适配） */
function colIndex(heads: string[], names: string[]): number {
  return heads.findIndex((h) => names.some((n) => h.includes(n)));
}

function splitIssueTable(tbl: HTMLTableElement) {
  const heads = Array.from(tbl.querySelectorAll("thead th")).map((th) =>
    (th.textContent ?? "").replace(/[⚠✓\s]/g, "")
  );
  const iPri = colIndex(heads, ["优先级"]);
  const iType = colIndex(heads, ["问题类型"]);
  const iProb = colIndex(heads, ["具体问题", "问题"]);
  const iFix = colIndex(heads, ["改进建议", "建议"]);
  if (iProb < 0 || iFix < 0) return; // 非诊断表结构，保持原样

  const wrap = document.createElement("div");
  wrap.className = "issue-split";
  const hdr = document.createElement("div");
  hdr.className = "issue-colh";
  const hL = document.createElement("div");
  hL.className = "issue-h issue-h-prob";
  hL.textContent = "⚠ 具体问题";
  const hR = document.createElement("div");
  hR.className = "issue-h issue-h-fix";
  hR.textContent = "✓ 改进建议";
  hdr.append(hL, hR);
  wrap.append(hdr);

  tbl.querySelectorAll("tbody tr").forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    const row = document.createElement("div");
    row.className = "issue-row";
    const left = document.createElement("div");
    left.className = "issue-cell issue-cell-prob";
    if (iPri >= 0 && tds[iPri]) {
      const p = document.createElement("span");
      p.className = "issue-pri";
      p.textContent = (tds[iPri].textContent ?? "").trim();
      left.append(p);
    }
    if (iType >= 0 && tds[iType]) {
      const t = document.createElement("span");
      t.className = "issue-type";
      t.textContent = (tds[iType].textContent ?? "").trim();
      left.append(t);
    }
    if (iProb >= 0 && tds[iProb]) left.append(...Array.from(tds[iProb].childNodes).map((n) => n.cloneNode(true)));
    const right = document.createElement("div");
    right.className = "issue-cell issue-cell-fix";
    if (iFix >= 0 && tds[iFix]) right.append(...Array.from(tds[iFix].childNodes).map((n) => n.cloneNode(true)));
    row.append(left, right);
    wrap.append(row);
  });
  tbl.replaceWith(wrap);
}

// renderedResult 变化后（nextTick 等 DOM 更新完）对容器内诊断表做拆分
watch(renderedResult, async () => {
  await nextTick();
  if (!mdBox.value) return;
  const tbl = mdBox.value.querySelector("table");
  if (!tbl) return;
  try {
    splitIssueTable(tbl);
  } catch (err) {
    console.error("[analysis] splitIssueTable failed", err);
  }
});

async function runAnalysis() {
  const cfg = loadAIConfig();
  if (!cfg) {
    toast("请先到「设置 → 模型接入」配置 API Key 与模型 ID");
    return;
  }
  if (incrOnly.value && lastAnalysisAt() === 0) {
    toast("尚无增量基准，本次先做全量分析并记录基准（下次起只分析新增）");
  }
  const ids = scopeDocIds();
  if (scope.value !== "all" && ids === undefined) {
    toast(`${scopeLabel.value}暂无文档 — 先在文档库把文档移入该分组`);
    return;
  }
  if (docScope.value !== null && ids === undefined) {
    toast("该文档没有可分析的内容（可能是空文件）");
    return;
  }
  const chunks = await listAllChunkContent(60, ids);
  if (chunks.length === 0) {
    toast(scope.value !== "all" ? `${scopeLabel.value}没有可分析的内容` : "知识库为空 — 先在文档库导入文档");
    return;
  }
  analyzing.value = true;
  result.value = "";

  const system = [
    "你是知识库分析师。对给定文档内容做两件事：",
    "1) 核心要点：3-5 条，覆盖主题、关键信息、数据口径；",
    "2) 指出问题：内部矛盾、信息缺口、低质/冗余段落、改进建议，逐条列出并标注优先级。",
    "使用 Markdown 结构输出：## 核心要点 / ## 指出问题。",
  ].join("\n");
  const prompt = `以下是知识库内容（范围：${scopeLabel.value}${incrOnly.value ? "（仅新增）" : ""}，截取前 60 块）：\n\n${chunks.join("\n---\n")}`;

  try {
    const res = await runGeneration(cfg, system, prompt);
    result.value = res.text;
    const cost = calcCost(cfg.label, res.usage);
    addCost(cfg.label, cost.amount);
    today.value = todayCost();
    lastMeta.value = {
      tokens: `${cost.inputTokens.toLocaleString()} in / ${cost.outputTokens.toLocaleString()} out`,
      cost: `¥${cost.amount.toFixed(2)}`,
      at: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };
    if (incrOnly.value) markAnalyzed();
    toast(`分析完成 · ${lastMeta.value.cost}${incrOnly.value ? "（增量基准已更新）" : ""}`);
  } catch (err) {
    toast(`分析失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    analyzing.value = false;
    incrOnly.value = false;
  }
}

/** 点击「仅分析新增」：标记增量模式并立即执行 */
function runIncremental() {
  incrOnly.value = true;
  void runAnalysis();
}

/** 切换单篇/范围：设置任一即清另一 */
function setScope(v: "all" | "none" | number) {
  docScope.value = null;
  scope.value = v;
  void refreshScopeStats();
}

function clearDocScope() {
  docScope.value = null;
  void refreshScopeStats();
}
</script>

<template>
  <div>
    <div class="kpis">
      <div class="kpi"><div class="k">范围内文档</div><div class="v">{{ docCount }}<small>篇</small></div><div class="d">{{ scopeLabel }}</div></div>
      <div class="kpi"><div class="k">覆盖文本</div><div class="v">{{ chunkCount }}<small>块</small></div><div class="d">前 60 块参与分析</div></div>
      <div class="kpi"><div class="k">今日消耗</div><div class="v">¥{{ today.toFixed(2) }}</div><div class="d">分析 + 生成合计</div></div>
      <div class="kpi"><div class="k">当前模型</div><div class="v" style="font-size:17px">{{ modelLabel || "未配置" }}</div><div class="d" :style="{ color: modelLabel ? 'var(--green)' : 'var(--red)' }">{{ modelLabel ? "已就绪" : "去设置页配置" }}</div></div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">智能分析 <span class="hint">范围可切换</span></div>
      <div class="scope-bar">
        <button class="chip" :class="{ on: scope === 'all' && docScope === null }" @click="setScope('all')">全部文档</button>
        <button class="chip" :class="{ on: scope === 'none' && docScope === null }" @click="setScope('none')">未分组</button>
        <button v-for="g in groups" :key="g.id" class="chip" :class="{ on: scope === g.id && docScope === null }" @click="setScope(g.id)">{{ g.name }} {{ g.doc_count }}</button>
        <span v-if="docScope !== null" class="chip on doc-chip">
          单篇「{{ docsCache.find((d) => d.id === docScope)?.filename ?? `#${docScope}` }}」
          <button class="doc-chip-x" title="返回范围分析" @click="clearDocScope">×</button>
        </span>
        <span v-if="groups.length === 0 && docScope === null" style="color:var(--text-faint);font-size:12px">暂无分组 — 到文档库新建分组并移入文档后可聚焦分析</span>
      </div>
      <div v-if="analyzing" style="color:var(--text-faint);font-size:13px;padding:10px 0">正在分析{{ scopeLabel }}（约 30–90 秒）…</div>
      <div v-else-if="result" class="scroll-limit"><div ref="mdBox" class="md-render" v-html="renderedResult"></div></div>
      <div v-else style="color:var(--text-faint);font-size:13px;padding:10px 0">选择范围后点击「开始分析」：浓缩核心要点 + 指出问题（矛盾 / 缺口 / 低质段落 / 建议）。</div>
      <div v-if="lastMeta" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text-muted)">
        <span class="tag green">{{ lastMeta.cost }}</span>
        <span class="tag blue">{{ lastMeta.tokens }}</span>
        <span>{{ lastMeta.at }} 完成</span>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary" :disabled="analyzing" @click="runAnalysis">
          <svg viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 15l4-6 3 4 5-7" /></svg>{{ analyzing ? "分析中…" : (docScope !== null ? "分析这篇" : scope !== 'all' ? "开始分析该范围" : "重新分析全部") }}
        </button>
        <button class="btn btn-ghost" :disabled="analyzing || docScope !== null" title="只分析上次分析后新入库的文档" @click="runIncremental">仅分析新增</button>
      </div>
    </div>
  </div>
</template>
