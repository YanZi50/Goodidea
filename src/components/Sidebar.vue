<script setup lang="ts">
import { inject } from "vue";

defineProps<{ active: string }>();
const emit = defineEmits<{ navigate: [id: string] }>();
const toast = inject("toast") as (msg: string) => void;
const brightness = inject("brightness") as { value: number };

const mainItems = [
  { id: "library", label: "文档库", badge: "", icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
  { id: "analysis", label: "智能分析", badge: "", icon: '<path d="M3 3v18h18"/><path d="M7 15l4-6 3 4 5-7"/>' },
  { id: "studio", label: "生成工作台", badge: "", icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>' },
  { id: "hotspot", label: "实时热点", badge: "抖音", icon: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>' },
  { id: "usage", label: "消耗统计", badge: "", icon: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>' },
];
const settingsIcon = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';

function navigate(id: string) {
  emit("navigate", id);
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-logo">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#241A08" stroke-width="2.2" stroke-linecap="round"><path d="M7 8.5h10M7 12h6M7 15.5h8" /></svg>
      </div>
      <div>
        <div class="brand-name">Goodidea</div>
        <div class="brand-sub">知识库 · AI 工作台</div>
      </div>
    </div>
    <nav class="nav">
      <a
        v-for="item in mainItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: active === item.id }"
        :href="'#' + item.id"
        @click="navigate(item.id)"
      >
        <svg viewBox="0 0 24 24" v-html="item.icon"></svg>
        <span>{{ item.label }}</span>
        <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
      </a>
      <div class="nav-sep"></div>
      <a class="nav-item" :class="{ active: active === 'settings' }" href="#settings" @click="navigate('settings')">
        <svg viewBox="0 0 24 24" v-html="settingsIcon"></svg>
        <span>设置</span>
      </a>
    </nav>
    <div class="sidebar-foot">
      <div class="brightness">
        <svg viewBox="0 0 24 24" title="变暗"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
        <input type="range" min="0.6" max="1.6" step="0.05" v-model.number="brightness.value" title="页面亮度" />
        <svg viewBox="0 0 24 24" title="变亮"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      </div>
      <div class="foot-btns">
        <button class="foot-btn" @click="toast('设置与帮助即将开放（设计稿演示）')">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg><span>帮助</span>
        </button>
        <button class="foot-btn" @click="toast('导出知识库备份即将开放（设计稿演示）')">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg><span>导出</span>
        </button>
      </div>
    </div>
  </aside>
</template>
