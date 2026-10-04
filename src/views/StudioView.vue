<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  loadActiveConfig,
  streamGeneration,
  calcCost,
  addCost,
} from "../lib/ai";
import { onUseHotspot } from "../lib/bus";
import { isTauriRuntime, searchMaterialChunks, recordHistory, listHistories, deleteHistory, listChunksWithDoc, type HistoryRow } from "../lib/db";
import { checkDuplicates, type DupHit } from "../lib/similarity";

const toast = inject("toast") as (msg: string) => void;

const skillChips = ["口播带货", "剧情短视频", "行情科普", "小红书种草"];
const materialChips = ["价格表 v3", "名表回收话术", "包袋验货要点", "风格库·强节奏口播"];
const hotspotChips = ["# 名表回收新趋势", "# 二手奢侈品行情", "不使用热点"];
const activeSkills = ref(new Set(["口播带货"]));
const activeMats = ref(new Set(["价格表 v3"]));
const activeHot = ref("# 名表回收新趋势");

const request = ref(
  "结合价格表与强节奏口播风格，写一条 60 秒口播脚本：黄金三秒用行情反差做钩子，中段讲名表回收流程与打款速度，结尾引导私信估价。"
);
const output = ref("");
const generating = ref(false);
const meta = ref<{ model: string; tokens: string; cost: string } | null>(null);
const materialHit = ref(""); // 素材检索命中摘要（如「3 篇」），空=未命中/降级
const outBox = ref<HTMLElement | null>(null); // 输出容器（复制时取渲染后干净文本）

// ---- 历史记录（histories，v5）：回看 + 一键复用 ----
const historyOpen = ref(false);
const histories = ref<HistoryRow[]>([]);

async function loadHistory() {
  if (isTauriRuntime()) histories.value = (await listHistories(10, "generation")) ?? [];
}
function toggleHistory() {
  historyOpen.value = !historyOpen.value;
  if (historyOpen.value) void loadHistory();
}
function reuseHistory(h: HistoryRow) {
  output.value = h.output;
  request.value = h.prompt;
  try {
    meta.value = h.meta ? (JSON.parse(h.meta) as { model: string; tokens: string; cost: string }) : null;
  } catch {
    meta.value = null;
  }
  toast(`已回填历史「${h.title}」`);
}
async function delHistory(h: HistoryRow) {
  await deleteHistory(h.id);
  await loadHistory();
}
function histTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function histMeta(h: HistoryRow): { model?: string; cost?: string } {
  try {
    return h.meta ? (JSON.parse(h.meta) as { model?: string; cost?: string }) : {};
  } catch {
    return {};
  }
}

// ---- 文案查重：输出 vs 文档库素材 + 生成历史（本地 bigram 相似度，不耗 token） ----
const dupOpen = ref(false);
const dupLoading = ref(false);
const dupHits = ref<DupHit[]>([]);

async function runDupCheck() {
  if (!output.value.trim()) {
    toast("先生成内容，再点击查重");
    return;
  }
  dupOpen.value = true;
  dupLoading.value = true;
  dupHits.value = [];
  try {
    const chunks = await listChunksWithDoc(3000);
    const histories = await listHistories(80);
    const candidates = [
      ...(chunks ?? []).map((c) => ({ source: c.doc, kind: "doc" as const, content: c.content })),
      ...(histories ?? [])
        .filter((h) => h.kind === "generation")
        .map((h) => ({ source: h.title, kind: "history" as const, content: h.output })),
    ];
    dupHits.value = checkDuplicates(output.value, candidates);
  } catch (err) {
    toast(`查重失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    dupLoading.value = false;
  }
}

/** Markdown → 安全 HTML：与智能分析一致的渲染通道，流式内容实时转换 */
const renderedOutput = computed(() => {
  if (!output.value) return "";
  // 模型偶发把列表符与话题符叠加（行首「-#xxx」）：去掉多余的横杠，保留话题符号
  const cleaned = output.value.replace(/^-\s*#/gm, "#");
  const html = DOMPurify.sanitize(marked.parse(cleaned, { async: false }) as string);
  return html + (generating.value ? '<span class="cursor"></span>' : "");
});

// ---- 草稿（localStorage 存配置 + 输出 + 时间） ----
const DRAFT_KEY = "goodidea.studio.draft.v1";
const draftAt = ref<number | null>(null);

interface StudioDraft {
  request: string;
  output: string;
  activeSkills: string[];
  activeMats: string[];
  activeHot: string;
  meta: { model: string; tokens: string; cost: string } | null;
  savedAt: number;
}

function saveDraft() {
  const draft: StudioDraft = {
    request: request.value,
    output: output.value,
    activeSkills: [...activeSkills.value],
    activeMats: [...activeMats.value],
    activeHot: activeHot.value,
    meta: meta.value,
    savedAt: Date.now(),
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  draftAt.value = draft.savedAt;
  toast("草稿已保存");
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      toast("暂无草稿");
      return;
    }
    const d = JSON.parse(raw) as StudioDraft;
    request.value = d.request;
    output.value = d.output;
    activeSkills.value = new Set(d.activeSkills);
    activeMats.value = new Set(d.activeMats);
    activeHot.value = d.activeHot;
    meta.value = d.meta;
    toast(`已恢复草稿（${new Date(d.savedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 保存）`);
  } catch {
    toast("草稿读取失败");
  }
}

onMounted(() => {
  // 热点页「接入生成」→ 设置热点参考并预填需求（需求为空时）
  const off = onUseHotspot((topic) => {
    activeHot.value = `# ${topic}`;
    if (!request.value.trim()) {
      request.value = `围绕热点「${topic}」，写一条口播脚本/种草文案：钩子 → 行业干货 → 行动号召。`;
    }
  });
  onUnmounted(off);
  // 有草稿时显示恢复入口
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) draftAt.value = (JSON.parse(raw) as StudioDraft).savedAt;
  } catch {
    /* ignore */
  }
});

function toggleChip(set: Set<string>, label: string) {
  if (set.has(label)) set.delete(label);
  else set.add(label);
  activeSkills.value = new Set(activeSkills.value);
  activeMats.value = new Set(activeMats.value);
}

/** 素材 chip → 检索关键词（文档库文件名/内容匹配） */
const MAT_KEYWORDS: Record<string, string[]> = {
  "价格表 v3": ["价格", "报价", "行情", "折扣"],
  "名表回收话术": ["名表", "回收", "话术"],
  "包袋验货要点": ["包袋", "验货", "成色"],
  "风格库·强节奏口播": ["风格库", "口播", "强节奏"],
};

/** 按选中素材在文档库检索真实内容；web/无命中时返回空（降级为仅传素材名） */
async function fetchMaterialNotes(): Promise<{ notes: string; summary: string }> {
  const mats = [...activeMats.value];
  if (mats.length === 0 || !isTauriRuntime()) return { notes: "", summary: "" };
  const kws = mats.flatMap((m) => MAT_KEYWORDS[m] ?? []);
  if (kws.length === 0) return { notes: "", summary: "" };
  try {
    const { docCount, chunks } = await searchMaterialChunks(kws, 24);
    if (chunks.length === 0) return { notes: "", summary: "" };
    const parts = chunks.map((c) => `【${c.doc}】${c.content}`);
    return {
      notes: `\n\n## 关联素材（文档库检索命中 ${docCount} 篇，${chunks.length} 块，已截取）\n${parts.join("\n---\n")}`,
      summary: `${docCount} 篇`,
    };
  } catch (err) {
    console.error("[studio] fetchMaterialNotes failed", err);
    return { notes: "", summary: "" };
  }
}

async function generate() {
  const cfg = await loadActiveConfig();
  if (!cfg) {
    toast("请先到「设置 → 模型接入」配置 API Key 与模型 ID");
    return;
  }
  if (!request.value.trim()) {
    toast("需求描述不能为空");
    return;
  }
  generating.value = true;
  output.value = "";
  meta.value = null;

  const system = [
    "你是资深短视频编导与文案专家，服务于奢侈品回收行业（名表/包袋）。",
    `启用 Skill：${[...activeSkills.value].join("、") || "无"}`,
    `可选关联素材：${[...activeMats.value].join("、") || "无"}`,
    `可选热点参考：${activeHot.value}`,
    "输出格式：按时间轴分段（如【0-3s · 钩子】），语言口语化、强节奏、短句，结尾带行动号召。",
  ].join("\n");
  // 素材接通：从文档库按关键词检索选中素材的真实内容拼进 prompt（web/无命中降级）
  const mat = await fetchMaterialNotes();
  materialHit.value = mat.summary;
  const prompt = `需求：${request.value}${mat.notes}\n\n可用素材内容：${mat.notes ? "见上方「关联素材」章节，务必以真实内容为事实依据创作，不得编造价格与数据。" : "由知识库提供，当前提示词阶段先按需求与经验直接创作。"}`;

  try {
    const { textStream, usage } = await streamGeneration(cfg, system, prompt);
    for await (const chunk of textStream) {
      output.value += chunk;
    }
    const cost = calcCost(cfg.label, await usage);
    addCost(cfg.label, cost.amount);
    meta.value = {
      model: cfg.label,
      tokens: `${cost.inputTokens.toLocaleString()} in / ${cost.outputTokens.toLocaleString()} out`,
      cost: `¥${cost.amount.toFixed(2)}`,
    };
    await recordHistory({
      kind: "generation",
      title: request.value.slice(0, 40),
      prompt: request.value,
      output: output.value,
      meta: JSON.stringify(meta.value),
    });
    await loadHistory(); // 历史面板开着时实时跟进最新一条
    toast(`生成完成 · ${meta.value.cost}`);
  } catch (err) {
    toast(`生成失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    generating.value = false;
  }
}

async function copyText() {
  if (!output.value) {
    toast("还没有生成内容");
    return;
  }
  // 复制渲染后的干净文本（无 Markdown 符号），与用户看到的一致
  const text = outBox.value?.innerText ?? output.value;
  await navigator.clipboard.writeText(text);
  toast("已复制到剪贴板");
}

// ---- 导出分镜表：解析输出中的时间轴分段 【0-3s · 钩子】… ----
interface ShotRow {
  n: number;
  t: string;
  tag: string;
  content: string;
}
const shotOpen = ref(false);
const shotRows = ref<ShotRow[]>([]);

/** 分镜内容清洗：去掉 Markdown 符号，只留干净文本（供表格展示与复制） */
function cleanBody(s: string): string {
  return s
    .replace(/\*\*/g, "") // 加粗符号（整段包裹或行内）
    .replace(/^#+\s?/gm, "") // 行首标题符号（## / #）
    .replace(/^-\s+/gm, "") // 行首列表符号
    .replace(/^>\s?/gm, "") // 引用符号
    .trim();
}

function parseShots(text: string): ShotRow[] {
  const re = /【\s*([\d.:]+)\s*-\s*([\d.:]+)s?\s*(?:·|,|，|\|)?\s*([^】]*)】/g;
  const segs: { a: string; b: string; tag: string; i: number; len: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    segs.push({ a: m[1], b: m[2], tag: m[3].trim(), i: m.index, len: m[0].length });
  }
  const rows: ShotRow[] = [];
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    const bodyStart = s.i + s.len;
    const bodyEnd = k + 1 < segs.length ? segs[k + 1].i : text.length;
    const body = text.slice(bodyStart, bodyEnd).replace(/^\n+|\n+$/g, "").trim();
    rows.push({ n: k + 1, t: `${s.a}-${s.b}s`, tag: cleanBody(s.tag) || "分镜", content: cleanBody(body) });
  }
  return rows;
}

function exportShots() {
  if (!output.value) {
    toast("还没有生成内容");
    return;
  }
  const rows = parseShots(output.value);
  if (rows.length === 0) {
    toast("未识别到时间轴分段 — 请用【0-3s · 钩子】格式生成后再导出");
    return;
  }
  shotRows.value = rows;
  shotOpen.value = true;
  toast(`已解析 ${rows.length} 个分镜`);
}

function copyShots() {
  const lines = ["分镜\t时间\t标签\t内容", ...shotRows.value.map((r) => `${r.n}\t${r.t}\t${r.tag}\t${r.content.replace(/\n/g, " ")}`)];
  void navigator.clipboard.writeText(lines.join("\n"));
  toast("分镜表已复制 — 可直接粘贴到 Excel / 飞书表格");
}
</script>

<template>
  <div class="studio">
    <div class="card">
      <div class="panel-head"><span class="ph-t">生成配置</span><span class="ph-h">P1 · 真实流式生成</span></div>
      <div class="field">
        <label class="label">Skill 模板</label>
        <div class="chips">
          <button v-for="c in skillChips" :key="c" class="chip" :class="{ on: activeSkills.has(c) }" @click="toggleChip(activeSkills, c)">{{ c }}</button>
        </div>
      </div>
      <div class="field">
        <label class="label">关联素材</label>
        <div class="chips">
          <button v-for="c in materialChips" :key="c" class="chip" :class="{ on: activeMats.has(c) }" @click="toggleChip(activeMats, c)">{{ c }}</button>
        </div>
      </div>
      <div class="field">
        <label class="label">热点参考（可选）</label>
        <div class="chips">
          <button v-for="c in hotspotChips" :key="c" class="chip" :class="{ on: activeHot === c }" @click="activeHot = c">{{ c }}</button>
          <button v-if="!hotspotChips.includes(activeHot)" class="chip on" :title="activeHot" @click="activeHot = '不使用热点'">{{ activeHot }} ×</button>
        </div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:4px">热点页点条目「生成」图标可直接接入此处</div>
      </div>
      <div class="field">
        <label class="label">需求描述</label>
        <textarea class="textarea" v-model="request" placeholder="例：结合价格表与风格库，写一条 60 秒口播带货脚本……"></textarea>
      </div>
      <div class="row" style="justify-content:space-between">
        <div style="font-size:12px;color:var(--text-faint)">按字符估算 ≈ ¥0.01–0.2 · 实际以 API usage 为准</div>
        <div style="display:flex;gap:8px">
          <button v-if="draftAt !== null" class="btn btn-ghost" :title="`草稿保存于 ${new Date(draftAt).toLocaleString('zh-CN')}`" @click="restoreDraft">恢复草稿</button>
          <button class="btn btn-ghost" @click="saveDraft">存草稿</button>
          <button class="btn btn-primary" :disabled="generating" @click="generate">
            <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>{{ generating ? "生成中…" : "开始生成" }}
          </button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="panel-head"><span class="ph-t">输出</span><span class="ph-h">流式渲染 · 实时消耗</span></div>
      <div class="out-area" :class="{ empty: !output && !generating }">
        <template v-if="output || generating">
          <div ref="outBox" class="out-line md-render" v-html="renderedOutput"></div>
        </template>
        <template v-else>
          <div style="color:var(--text-faint);padding:18px 0;text-align:center">配置模型后点击「开始生成」，内容将流式出现</div>
        </template>
        <div v-if="meta" class="out-meta">
          <span class="tag gold">{{ meta.model }}</span>
          <span class="tag blue">{{ meta.tokens }}</span>
          <span class="tag green">{{ meta.cost }}</span>
          <span v-if="materialHit" class="tag gold" title="本次生成检索到的文档库素材数量">素材 {{ materialHit }}</span>
        </div>
      </div>
      <div class="costbar" v-if="meta">
        <span>本次消耗</span><div class="bar"><i :style="{ width: '100%' }"></i></div>
        <span>{{ meta.cost }} / {{ meta.tokens }}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-green btn-sm" @click="copyText">复制全文</button>
        <button class="btn btn-ghost btn-sm" @click="exportShots" :disabled="!output || generating">导出分镜表</button>
        <button class="btn btn-ghost btn-sm" :disabled="generating" @click="generate">重新生成</button>
        <button class="btn btn-ghost btn-sm" :disabled="!output || generating" @click="runDupCheck">{{ dupLoading ? "查重中…" : "查重" }}</button>
        <button class="btn btn-ghost btn-sm" @click="toggleHistory">{{ historyOpen ? "收起历史" : "历史记录" }}</button>
      </div>
      <div v-if="dupOpen" class="dup-panel">
        <div class="dup-head">
          <span>查重结果：与知识库素材 + 生成历史比对（bigram 相似度，本地计算不耗 token）</span>
          <button class="btn btn-ghost btn-sm" @click="dupOpen = false">收起</button>
        </div>
        <div v-if="dupLoading" style="font-size:13px;color:var(--text-faint);padding:8px 0">正在比对全部素材与历史…</div>
        <div v-else-if="dupHits.length === 0" style="font-size:13px;color:var(--green);padding:8px 0">未发现明显雷同（相似度均低于 0.25）— 内容可放心使用</div>
        <div v-for="(h, i) in dupHits" :key="i" class="dup-item" :class="h.level">
          <div class="dup-row1">
            <span class="dup-tag" :class="h.level">{{ h.level === "high" ? "高危" : h.level === "mid" ? "中危" : "低危" }}</span>
            <span class="dup-score">{{ (h.score * 100).toFixed(1) }}%</span>
            <span class="dup-src">{{ h.kind === "doc" ? "文档" : "历史" }} · {{ h.source }}</span>
          </div>
          <div class="dup-snippet">{{ h.snippet }}</div>
        </div>
        <div v-if="dupHits.length > 0" style="font-size:12px;color:var(--text-faint);margin-top:6px">≥50% 高危建议改写后发布；≥35% 中危检查关键句</div>
      </div>
      <div v-if="historyOpen" class="hist-panel">
        <div v-if="histories.length === 0" style="font-size:13px;color:var(--text-faint);padding:8px 0">暂无生成历史 — 完成一次生成后自动记录</div>
        <div v-for="h in histories" :key="h.id" class="hist-item" @click="reuseHistory(h)">
          <div class="hi-main">
            <div class="hi-title">{{ h.title }}</div>
            <div class="hi-sub">{{ histTime(h.created_at) }}<template v-if="histMeta(h).model"> · {{ histMeta(h).model }}</template><template v-if="histMeta(h).cost"> · {{ histMeta(h).cost }}</template></div>
          </div>
          <button class="icon-btn hi-del" title="删除这条历史" @click.stop="delHistory(h)">
            <svg viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
          </button>
        </div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:6px">点击条目回填输出与需求（可复用后重新生成）</div>
      </div>
      <div v-if="shotOpen" class="shot-panel">
        <div class="shot-head">
          <span>分镜表（{{ shotRows.length }} 镜）</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-soft btn-sm" @click="copyShots">复制表格</button>
            <button class="btn btn-ghost btn-sm" @click="shotOpen = false">关闭</button>
          </div>
        </div>
        <table class="shot-table">
          <thead><tr><th>#</th><th>时间</th><th>标签</th><th>内容</th></tr></thead>
          <tbody>
            <tr v-for="r in shotRows" :key="r.n">
              <td>{{ r.n }}</td>
              <td>{{ r.t }}</td>
              <td><span class="tag">{{ r.tag }}</span></td>
              <td style="white-space:pre-wrap">{{ r.content }}</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size:12px;color:var(--text-faint)">「复制表格」输出制表符分隔（分镜/时间/标签/内容），可直接粘贴到 Excel 或飞书表格</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shot-panel {
  margin-top: 12px;
  border: 1px solid rgba(232, 179, 106, 0.3);
  border-radius: 10px;
  background: rgba(232, 179, 106, 0.05);
  padding: 10px 12px;
}
.shot-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; color: var(--text-muted); }
.shot-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.shot-table th, .shot-table td { border: 1px solid rgba(255, 255, 255, 0.08); padding: 6px 8px; text-align: left; vertical-align: top; }
.shot-table th { color: var(--text-muted); background: rgba(255, 255, 255, 0.04); white-space: nowrap; }
.shot-table td:first-child { width: 36px; color: var(--text-faint); text-align: center; }
.shot-table td:nth-child(2) { width: 70px; white-space: nowrap; }
.hist-panel {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  padding: 8px 10px;
  max-height: 240px;
  overflow-y: auto;
}
.hist-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.hist-item:hover { background: var(--surface-2); }
.hi-main { flex: 1; min-width: 0; }
.hi-title { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hi-sub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
.hi-del { flex-shrink: 0; }
.dup-panel {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  padding: 8px 10px;
  max-height: 300px;
  overflow-y: auto;
}
.dup-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--text-muted); margin-bottom: 6px; }
.dup-item { padding: 7px 6px; border-radius: 6px; border-left: 3px solid var(--border); margin-bottom: 6px; }
.dup-item.high { border-left-color: var(--red); background: rgba(255, 84, 73, 0.07); }
.dup-item.mid { border-left-color: var(--accent); background: rgba(232, 179, 106, 0.06); }
.dup-item.low { border-left-color: var(--green); background: rgba(76, 175, 80, 0.05); }
.dup-row1 { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.dup-tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; }
.dup-tag.high { background: var(--red); color: #fff; }
.dup-tag.mid { background: var(--accent); color: #000; }
.dup-tag.low { background: var(--green); color: #fff; }
.dup-score { font-weight: 700; color: var(--text); font-size: 14px; }
.dup-src { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dup-snippet { font-size: 12px; color: var(--text-faint); margin-top: 3px; line-height: 1.5; }
</style>
