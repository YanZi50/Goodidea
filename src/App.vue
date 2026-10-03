<script setup lang="ts">
import { ref, provide, onMounted } from "vue";
import Sidebar from "./components/Sidebar.vue";
import Topbar from "./components/Topbar.vue";
import LibraryView from "./views/LibraryView.vue";
import AnalysisView from "./views/AnalysisView.vue";
import StudioView from "./views/StudioView.vue";
import HotspotView from "./views/HotspotView.vue";
import UsageView from "./views/UsageView.vue";
import SettingsView from "./views/SettingsView.vue";

const TITLES: Record<string, [string, string]> = {
  library: ["文档库", "所有喂给 Goodidea 的材料都沉淀在这里"],
  analysis: ["智能分析", "浓缩全文 · 指出问题 · 主题聚类"],
  studio: ["生成工作台", "基于你的素材与热点，生成新内容"],
  hotspot: ["实时热点", "跨平台热榜，一键接入生成"],
  usage: ["消耗统计", "各模型费用与每日用量一目了然"],
  settings: ["设置", "密钥 · 模型 · 热点源 · 价格表"],
};

const activeView = ref<string>("library");

function toast(msg: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout((el as HTMLElement & { _t?: number })._t);
  (el as HTMLElement & { _t?: number })._t = window.setTimeout(() => el.classList.remove("show"), 2200);
}
provide("toast", toast);

function navigate(id: string) {
  if (location.hash !== "#" + id) {
    location.hash = id;
  } else {
    activeView.value = id;
  }
}

onMounted(() => {
  const sync = () => {
    const hash = location.hash.replace("#", "");
    activeView.value = TITLES[hash] ? hash : "library";
  };
  window.addEventListener("hashchange", sync);
  sync();
});
</script>

<template>
  <div class="app">
    <Sidebar :active="activeView" @navigate="navigate" />
    <div class="main">
      <Topbar :title="TITLES[activeView][0]" :desc="TITLES[activeView][1]" />
      <div class="content">
        <LibraryView v-show="activeView === 'library'" />
        <AnalysisView v-show="activeView === 'analysis'" />
        <StudioView v-show="activeView === 'studio'" />
        <HotspotView v-show="activeView === 'hotspot'" />
        <UsageView v-show="activeView === 'usage'" />
        <SettingsView v-show="activeView === 'settings'" />
      </div>
    </div>
  </div>
  <div id="toast"></div>
</template>
