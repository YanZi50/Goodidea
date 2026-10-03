<script setup lang="ts">
import { ref, onMounted, inject } from "vue";
import { listDocuments, countChunks, listAllChunkContent } from "../lib/db";
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

async function refresh() {
  docCount.value = (await listDocuments()).length;
  chunkCount.value = (await countChunks()) ?? 0;
  today.value = todayCost();
  modelLabel.value = loadAIConfig()?.label ?? "";
}

onMounted(refresh);

async function runAnalysis() {
  const cfg = loadAIConfig();
  if (!cfg) {
    toast("请先到「设置 → 模型接入」配置 API Key 与模型 ID");
    return;
  }
  const chunks = await listAllChunkContent(60);
  if (chunks.length === 0) {
    toast("知识库为空 — 先在文档库导入文档");
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
  const prompt = `以下是知识库全文（截取前 60 块）：\n\n${chunks.join("\n---\n")}`;

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
    toast(`分析完成 · ${lastMeta.value.cost}`);
  } catch (err) {
    toast(`分析失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    analyzing.value = false;
  }
}
</script>

<template>
  <div>
    <div class="kpis">
      <div class="kpi"><div class="k">知识库文档</div><div class="v">{{ docCount }}<small>篇</small></div><div class="d">全库实时</div></div>
      <div class="kpi"><div class="k">覆盖文本</div><div class="v">{{ chunkCount }}<small>块</small></div><div class="d">前 60 块参与分析</div></div>
      <div class="kpi"><div class="k">今日消耗</div><div class="v">¥{{ today.toFixed(2) }}</div><div class="d">分析 + 生成合计</div></div>
      <div class="kpi"><div class="k">当前模型</div><div class="v" style="font-size:17px">{{ modelLabel || "未配置" }}</div><div class="d" :style="{ color: modelLabel ? 'var(--green)' : 'var(--red)' }">{{ modelLabel ? "已就绪" : "去设置页配置" }}</div></div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">全库分析 <span class="hint">P1 · 真实调用（豆包/OpenAI 兼容）</span></div>
      <div v-if="analyzing" style="color:var(--text-faint);font-size:13px;padding:10px 0">正在分析全库（约 30–90 秒）…</div>
      <div v-else-if="result" class="out-area" style="white-space:pre-wrap;font-size:13.5px">{{ result }}</div>
      <div v-else style="color:var(--text-faint);font-size:13px;padding:10px 0">点击「重新分析全库」：浓缩核心要点 + 指出问题（矛盾 / 缺口 / 低质段落 / 建议）。</div>
      <div v-if="lastMeta" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text-muted)">
        <span class="tag green">{{ lastMeta.cost }}</span>
        <span class="tag blue">{{ lastMeta.tokens }}</span>
        <span>{{ lastMeta.at }} 完成</span>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary" :disabled="analyzing" @click="runAnalysis">
          <svg viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 15l4-6 3 4 5-7" /></svg>{{ analyzing ? "分析中…" : "重新分析全库" }}
        </button>
        <button class="btn btn-ghost" @click="toast('增量分析将在 P3 接入')">仅分析新增</button>
      </div>
    </div>
  </div>
</template>
