<script setup lang="ts">
import { ref, computed, onMounted, inject } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SOURCES, fetchHotlist, type HotItem } from "../lib/hotlist";
import { isTauriRuntime } from "../lib/db";

const toast = inject("toast") as (msg: string) => void;

const sources = SOURCES;
const activeTab = ref(SOURCES[0].id);
const hotList = ref<HotItem[]>([]);
const loading = ref(false);
const error = ref("");
const lastUpdated = ref("");
const onlyRelated = ref(false);
const manual = ref("");

const shownList = computed(() => (onlyRelated.value ? hotList.value.filter((h) => h.related) : hotList.value));

async function load(source = activeTab.value) {
  loading.value = true;
  error.value = "";
  try {
    hotList.value = await fetchHotlist(source);
    lastUpdated.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    hotList.value = [];
    lastUpdated.value = "";
  } finally {
    loading.value = false;
  }
}

function switchTab(id: string) {
  activeTab.value = id;
  load(id);
}

function refresh() {
  load(activeTab.value);
  toast("正在刷新 " + sources.find((s) => s.id === activeTab.value)?.label);
}

function open(h: HotItem) {
  if (!h.url) return;
  if (isTauriRuntime()) {
    openUrl(h.url);
  } else {
    window.open(h.url, "_blank");
  }
}

function addManual() {
  const text = manual.value.trim();
  if (!text) return;
  const hit = text.includes("回收") || text.includes("二手") || text.includes("奢侈品") ? "手动" : "";
  hotList.value = [{ rank: 0, title: text, hot: "手动", url: "", related: hit !== "", hit }, ...hotList.value];
  manual.value = "";
  toast("已加入热点列表");
}

onMounted(() => load());
</script>

<template>
  <div>
    <div class="row" style="margin-bottom:14px;flex-wrap:wrap">
      <div class="hot-tabs" style="margin-bottom:0">
        <button v-for="s in sources" :key="s.id" class="hot-tab" :class="{ on: activeTab === s.id }" @click="switchTab(s.id)">{{ s.label }}</button>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label class="filter-toggle">
          <input type="checkbox" v-model="onlyRelated" />
          <span>只看行业相关</span>
        </label>
        <button class="btn btn-ghost btn-sm" @click="refresh" :disabled="loading">{{ loading ? "加载中…" : "刷新" }}</button>
        <button class="btn btn-soft btn-sm" @click="toast('将热点接入生成工作台：P2 待做')">接入生成</button>
      </div>
    </div>

    <div v-if="error" class="hot-error">
      <p>热榜接口暂不可用（{{ error }}）——请检查网络后点「刷新」，或手动添加话题兜底。</p>
    </div>

    <div v-if="loading" style="color:var(--text-faint);font-size:13px;padding:12px 0">正在加载 {{ sources.find((s) => s.id === activeTab)?.label }}…</div>

    <template v-else>
      <div class="scroll-limit">
        <div v-for="h in shownList" :key="h.rank + '-' + h.title" class="hot-item" :class="{ clickable: h.url }" @click="open(h)">
          <div class="hot-rank" :class="{ top: h.rank >= 1 && h.rank <= 3 }">{{ h.rank }}</div>
          <div class="hot-body">
            <div class="t">{{ h.title }}</div>
            <div class="s">
              <span class="up">▲</span>
              <span v-if="h.related" class="tag" style="background:var(--accent);color:#0b0e13">行业相关</span>
              <span v-if="h.hit">{{ h.hit }}</span>
              <span v-if="lastUpdated">更新于 {{ lastUpdated }}</span>
            </div>
          </div>
          <div class="hot-val"><div class="hv">{{ h.hot }}</div><div class="hl">热度</div></div>
        </div>
        <div v-if="shownList.length === 0 && !error" style="color:var(--text-faint);font-size:13px;padding:12px 0">
          {{ onlyRelated ? "当前榜单暂无行业相关条目 — 试试其他榜单或取消筛选" : "暂无数据" }}
        </div>
      </div>
      <div style="color:var(--text-faint);font-size:12px;margin-top:6px">数据来源：vvhan 热榜聚合 · 点击条目在浏览器打开原文 · 实时刷新</div>
    </template>

    <div class="manual-input">
      <input class="input" v-model="manual" placeholder="手动输入热点 / 话题（接口不可用时兜底）…" @keydown.enter="addManual" />
      <button class="btn btn-primary btn-sm" @click="addManual">添加</button>
    </div>
  </div>
</template>

<style scoped>
.hot-error {
  background: rgba(229, 83, 75, 0.08);
  border: 1px solid rgba(229, 83, 75, 0.35);
  border-radius: 10px;
  padding: 12px 14px;
  color: var(--text-muted);
  font-size: 13px;
  margin-bottom: 12px;
}
.hot-error p { margin: 0; }
.hot-item.clickable { cursor: pointer; }
.hot-item.clickable:hover .t { color: var(--accent); }
.filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}
.filter-toggle input { accent-color: var(--accent); }
</style>
