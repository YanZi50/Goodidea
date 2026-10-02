<script setup lang="ts">
import { ref, watch, inject } from "vue";

defineProps<{ title: string; desc: string }>();
const toast = inject("toast") as (msg: string) => void;

const models = [
  "豆包 · doubao-seed-2.0-pro",
  "OpenAI · gpt-5",
  "Anthropic · claude-sonnet-4",
  "本地 · Ollama qwen3",
];
const model = ref(models[0]);
const costByModel: Record<string, string> = {
  "豆包 · doubao-seed-2.0-pro": "¥0.86",
  "OpenAI · gpt-5": "¥1.24",
  "Anthropic · claude-sonnet-4": "¥0.98",
  "本地 · Ollama qwen3": "¥0.12",
};
const todayCost = ref(costByModel[model.value]);

watch(model, (m) => {
  todayCost.value = costByModel[m];
  toast("已切换模型：" + m + "（示例）");
});
</script>

<template>
  <header class="topbar">
    <div>
      <div class="page-title">{{ title }}</div>
      <div class="page-desc">{{ desc }}</div>
    </div>
    <div class="topbar-right">
      <select class="select" v-model="model">
        <option v-for="m in models" :key="m">{{ m }}</option>
      </select>
      <div class="usage-badge"><span class="status-dot"></span>今日消耗 <b>{{ todayCost }}</b></div>
    </div>
  </header>
</template>
