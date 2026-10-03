<script setup lang="ts">
import { ref, inject } from "vue";
import {
  loadAIConfig,
  streamGeneration,
  calcCost,
  addCost,
} from "../lib/ai";

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

function toggleChip(set: Set<string>, label: string) {
  if (set.has(label)) set.delete(label);
  else set.add(label);
  activeSkills.value = new Set(activeSkills.value);
  activeMats.value = new Set(activeMats.value);
}

async function generate() {
  const cfg = loadAIConfig();
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
  const prompt = `需求：${request.value}\n\n可用素材内容由知识库提供，当前提示词阶段先按需求与经验直接创作。`;

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
  await navigator.clipboard.writeText(output.value);
  toast("已复制到剪贴板");
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
        </div>
      </div>
      <div class="field">
        <label class="label">需求描述</label>
        <textarea class="textarea" v-model="request" placeholder="例：结合价格表与风格库，写一条 60 秒口播带货脚本……"></textarea>
      </div>
      <div class="row" style="justify-content:space-between">
        <div style="font-size:12px;color:var(--text-faint)">按字符估算 ≈ ¥0.01–0.2 · 实际以 API usage 为准</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" @click="toast('保存草稿即将开放（P1 二期）')">存草稿</button>
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
          <div class="out-line" style="white-space:pre-wrap">{{ output }}<span v-if="generating" class="cursor"></span></div>
        </template>
        <template v-else>
          <div style="color:var(--text-faint);padding:18px 0;text-align:center">配置模型后点击「开始生成」，内容将流式出现</div>
        </template>
        <div v-if="meta" class="out-meta">
          <span class="tag gold">{{ meta.model }}</span>
          <span class="tag blue">{{ meta.tokens }}</span>
          <span class="tag green">{{ meta.cost }}</span>
        </div>
      </div>
      <div class="costbar" v-if="meta">
        <span>本次消耗</span><div class="bar"><i :style="{ width: '100%' }"></i></div>
        <span>{{ meta.cost }} / {{ meta.tokens }}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-green btn-sm" @click="copyText">复制全文</button>
        <button class="btn btn-ghost btn-sm" @click="toast('导出分镜表将在 P1 二期接入')">导出分镜表</button>
        <button class="btn btn-ghost btn-sm" :disabled="generating" @click="generate">重新生成</button>
      </div>
    </div>
  </div>
</template>
