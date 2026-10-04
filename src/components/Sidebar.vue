<script setup lang="ts">
import { inject, ref, type Ref } from "vue";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime, exportBackupData } from "../lib/db";

defineProps<{ active: string }>();
const emit = defineEmits<{ navigate: [id: string] }>();
const toast = inject("toast") as (msg: string) => void;
// 主题（浅色/暗色）：App provide 的 ref，直接绑定（script setup 顶层 ref 自动解包）
const theme = inject<Ref<"dark" | "light">>("theme") ?? ref<"dark" | "light">("dark");

const sunIcon = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M5.2 18.8L7 17M17 7l1.8-1.8"/>';
const moonIcon = '<path d="M20.6 14.4A8.5 8.5 0 1 1 9.6 3.4a7 7 0 0 0 11 11z"/>';

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

/** 导出知识库备份：全量 JSON → 保存对话框 → 写文件 */
async function exportBackup() {
  if (!isTauriRuntime()) {
    toast("备份导出需在桌面应用内使用");
    return;
  }
  const data = await exportBackupData();
  if (!data) {
    toast("备份导出失败（数据库不可用）");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const path = await save({
    title: "导出知识库备份",
    defaultPath: `goodidea-backup-${stamp}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return; // 用户取消
  try {
    await invoke("save_backup", { path, content: JSON.stringify(data, null, 2) });
    toast(`备份已导出：${path.split(/[\\/]/).pop()}`);
  } catch (err) {
    toast(`导出失败：${err instanceof Error ? err.message : String(err)}`);
  }
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
      <div class="theme-switch">
        <button class="theme-btn" :class="{ on: theme === 'light' }" @click="theme = 'light'" title="浅色模式">
          <svg viewBox="0 0 24 24" v-html="sunIcon"></svg><span>浅色</span>
        </button>
        <button class="theme-btn" :class="{ on: theme === 'dark' }" @click="theme = 'dark'" title="暗色模式">
          <svg viewBox="0 0 24 24" v-html="moonIcon"></svg><span>暗色</span>
        </button>
      </div>
      <div class="foot-btns">
        <button class="foot-btn" @click="toast('设置与帮助即将开放（设计稿演示）')">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg><span>帮助</span>
        </button>
        <button class="foot-btn" @click="exportBackup" title="导出知识库备份（文档/分组/价格表/模型档案 JSON）">
          <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg><span>导出</span>
        </button>
      </div>
    </div>
  </aside>
</template>
