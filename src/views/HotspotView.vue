<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SOURCES, fetchHotlist, type HotItem } from "../lib/hotlist";
import { isTauriRuntime, loadHotKeywords } from "../lib/db";
import { onDataChanged, emitUseHotspot } from "../lib/bus";

const toast = inject("toast") as (msg: string) => void;

const sources = SOURCES;
const activeTab = ref(SOURCES[0].id);
const hotList = ref<HotItem[]>([]);
const loading = ref(false);
const error = ref("");
const lastUpdated = ref("");
const onlyRelated = ref(false);
const manual = ref("");
let offDataChanged: (() => void) | null = null;
let autoTimer: ReturnType<typeof setInterval> | null = null;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 热榜实时性：每 5 分钟静默自动刷新

const shownList = computed(() => (onlyRelated.value ? hotList.value.filter((h) => h.related) : hotList.value));

async function load(source = activeTab.value, opts: { silent?: boolean } = {}) {
  if (!opts.silent) loading.value = true;
  if (!opts.silent) error.value = "";
  try {
    const keywords = await loadHotKeywords(); // 行业关键词来自设置页可配置
    hotList.value = await fetchHotlist(source, keywords);
    lastUpdated.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch (e) {
    // 静默自动刷新失败时保留旧列表，不打断用户浏览（手动刷新/切 tab 才展示错误）
    if (opts.silent) return;
    error.value = e instanceof Error ? e.message : String(e);
    hotList.value = [];
    lastUpdated.value = "";
  } finally {
    if (!opts.silent) loading.value = false;
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
  hotList.value = [{ rank: 0, title: text, hot: "手动", url: "", related: true, hit: "手动" }, ...hotList.value];
  manual.value = "";
  toast("已加入热点列表");
}

/** 移除手动添加的话题（rank=0 标记） */
function removeManual(h: HotItem) {
  const i = hotList.value.indexOf(h);
  if (i >= 0) {
    hotList.value.splice(i, 1);
    toast("已移除：" + h.title);
  }
}

/** 接入生成：话题 → 生成工作台热点参考 */
function useForGenerate(h: HotItem) {
  location.hash = "studio";
  emitUseHotspot(h.title);
  toast(`已接入生成工作台：${h.title}`);
}

/** 顶部「接入生成」：接入当前列表第一条（行业相关优先） */
function useFirstForGenerate() {
  const list = shownList.value;
  if (list.length === 0) {
    toast("当前列表为空 — 先加载或手动添加话题");
    return;
  }
  useForGenerate(list[0]);
}

onMounted(() => {
  offDataChanged = onDataChanged(() => {
    // 设置页保存关键词库/行业背景后即时重载——热点高亮与新关键词同步生效，无需手动刷新
    load(activeTab.value);
  });
  load();
  autoTimer = setInterval(() => load(activeTab.value, { silent: true }), AUTO_REFRESH_MS);
});
onUnmounted(() => {
  if (offDataChanged) offDataChanged();
  if (autoTimer) clearInterval(autoTimer);
});
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
        <button class="btn btn-soft btn-sm" @click="useFirstForGenerate" :disabled="shownList.length === 0">接入生成</button>
      </div>
    </div>

    <div v-if="error" class="hot-error">
      <p>热榜接口暂不可用（{{ error }}）——请检查网络后点「刷新」，或手动添加话题兜底。</p>
    </div>

    <div v-if="loading" style="color:var(--text-faint);font-size:13px;padding:12px 0">正在加载 {{ sources.find((s) => s.id === activeTab)?.label }}…</div>

    <template v-else>
      <div class="hot-meta">
        <span>共 <b>{{ hotList.length }}</b> 条<template v-if="onlyRelated"> · 行业相关 <b>{{ shownList.length }}</b> 条</template></span>
        <span v-if="lastUpdated">更新于 {{ lastUpdated }}</span>
        <span class="hot-meta-src">每 5 分钟自动刷新 · 数据来源：60s 热榜聚合（主源，备：vvhan）· 点击条目打开原文</span>
      </div>
      <div class="scroll-limit hot-list-wrap">
        <div v-for="h in shownList" :key="h.rank + '-' + h.title" class="hot-item" :class="{ clickable: h.url }" @click="open(h)">
          <div class="hot-rank" :class="{ top: h.rank >= 1 && h.rank <= 3, manual: h.rank === 0 }">{{ h.rank === 0 ? "手" : h.rank }}</div>
          <div class="hot-body">
            <div class="t">{{ h.title }}</div>
            <div class="s">
              <span class="up">▲</span>
              <span v-if="h.related" class="tag" style="background:var(--accent);color:#0b0e13">{{ h.hit || "行业相关" }}</span>
            </div>
          </div>
          <div class="hot-val" :title="'热度 ' + h.hot">
            <div class="hv">{{ h.hot }}</div>
          </div>
          <button v-if="h.rank === 0" class="icon-btn hot-del" title="移除该话题" @click.stop="removeManual(h)">
            <svg viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
          <button class="icon-btn hot-gen" title="接入生成工作台" @click.stop="useForGenerate(h)">
            <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          </button>
        </div>
        <div v-if="shownList.length === 0 && !error" style="color:var(--text-faint);font-size:13px;padding:12px 0">
          {{ onlyRelated ? "当前榜单暂无行业相关条目 — 试试其他榜单或取消筛选" : "暂无数据" }}
        </div>
      </div>
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
.hot-item { position: relative; }
.hot-rank.manual { background: var(--accent-soft); color: var(--accent); }
.hot-gen {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  opacity: 0; transition: opacity .15s;
}
.hot-del {
  position: absolute; right: 38px; top: 50%; transform: translateY(-50%);
  opacity: 0; transition: opacity .15s; color: var(--red);
}
.hot-item:hover .hot-gen, .hot-item:hover .hot-del { opacity: 1; }
.hot-item .hot-val { padding-right: 26px; }
</style>
