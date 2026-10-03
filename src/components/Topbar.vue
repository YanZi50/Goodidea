<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from "vue";
import { loadAIConfig, todayCost } from "../lib/ai";

defineProps<{ title: string; desc: string }>();
const toast = inject("toast") as (msg: string) => void;

const modelLabel = ref("未配置模型");
const cost = ref(0);

function refresh() {
  modelLabel.value = loadAIConfig()?.label ?? "未配置模型";
  cost.value = todayCost();
}

let timer: number | undefined;

onMounted(() => {
  refresh();
  timer = window.setInterval(refresh, 5000);
});
onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<template>
  <header class="topbar">
    <div>
      <div class="page-title">{{ title }}</div>
      <div class="page-desc">{{ desc }}</div>
    </div>
    <div class="topbar-right">
      <div class="usage-badge" :title="modelLabel">
        <span class="status-dot" :style="{ background: modelLabel !== '未配置模型' ? 'var(--green)' : 'var(--red)' }"></span>
        <span style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ modelLabel }}</span>
      </div>
      <div class="usage-badge" @click="toast('消耗明细见「消耗统计」面板')">
        今日消耗 <b>¥{{ cost.toFixed(2) }}</b>
      </div>
    </div>
  </header>
</template>
