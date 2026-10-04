<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from "vue";
import { todayCost } from "../lib/ai";
import { listProfiles, setActiveProfile, getActiveProfile, migrateLegacyConfig, isTauriRuntime, type AIProfile } from "../lib/db";
import { emitModelSwitched } from "../lib/bus";

defineProps<{ title: string; desc: string }>();
const toast = inject("toast") as (msg: string) => void;

const modelLabel = ref("未配置模型");
const cost = ref(0);
const profiles = ref<AIProfile[]>([]);
const activeId = ref<number | null>(null);
const open = ref(false);

async function refresh() {
  cost.value = todayCost();
  if (isTauriRuntime()) {
    await migrateLegacyConfig(); // 旧单配置首次升级为档案
    const list = await listProfiles();
    if (list) {
      profiles.value = list;
      const act = await getActiveProfile();
      activeId.value = act?.id ?? null;
      modelLabel.value = act?.label ?? "未配置模型";
      return;
    }
  }
  // web 预览：读 localStorage 单配置
  modelLabel.value = "未配置模型（web 预览）";
}

async function switchModel(p: AIProfile) {
  if (p.id === activeId.value) return;
  await setActiveProfile(p.id);
  activeId.value = p.id;
  modelLabel.value = p.label;
  open.value = false;
  emitModelSwitched(); // 设置页等消费方即时刷新，无需手动刷新
  toast(`已切换模型：${p.label}`);
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
      <div class="model-switch" :class="{ on: open }" @click.stop="open = !open" @blur="open = false" tabindex="0">
        <div class="model-current">
          <span class="status-dot" :style="{ background: activeId !== null ? 'var(--green)' : 'var(--red)' }"></span>
          <span class="model-label" :title="modelLabel">{{ modelLabel }}</span>
          <svg class="chev" viewBox="0 0 24 24" :style="{ transform: open ? 'rotate(180deg)' : '' }"><path d="M6 9l6 6 6-6" /></svg>
        </div>
        <div v-if="open" class="model-menu">
          <div v-for="p in profiles" :key="p.id" class="model-item" :class="{ active: p.id === activeId }" @click="switchModel(p)">
            <span class="m-label">{{ p.label }}</span>
            <span class="m-model">{{ p.model }}</span>
            <span v-if="p.id === activeId" class="m-check">✓</span>
          </div>
          <div v-if="profiles.length === 0" class="model-empty" @click.stop>
            暂无模型档案 — 去「设置 → 模型接入」添加
            <span style="display:block;font-size:12px;color:var(--text-faint)">点击设置页侧栏入口添加</span>
          </div>
        </div>
      </div>
      <div class="usage-badge" @click="toast('消耗明细见「消耗统计」面板')">
        今日消耗 <b>¥{{ cost.toFixed(2) }}</b>
      </div>
    </div>
  </header>
</template>

<style scoped>
.model-switch {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
  padding: 5px 10px;
  cursor: pointer;
  user-select: none;
  min-width: 150px;
}
.model-switch:hover { border-color: var(--border-strong); }
.model-current { display: flex; align-items: center; gap: 7px; width: 100%; }
.model-label { max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.chev { width: 14px; height: 14px; fill: none; stroke: var(--text-muted); stroke-width: 2; margin-left: auto; transition: transform .15s; }
.model-menu {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  background: var(--surface-2); border: 1px solid var(--border-strong);
  border-radius: 9px; box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
  z-index: 50; max-height: 320px; overflow-y: auto; padding: 4px;
}
.model-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 9px;
  border-radius: 6px; cursor: pointer; font-size: 13px;
}
.model-item:hover { background: var(--surface-3); }
.model-item.active { background: var(--accent-soft); }
.m-label { font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-model { color: var(--text-faint); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
.m-check { color: var(--accent); font-weight: 700; margin-left: auto; }
.model-empty { padding: 10px; font-size: 12.5px; color: var(--text-muted); }
</style>
