<script setup lang="ts">
import { ref, computed, inject, onMounted } from "vue";
import type { DocumentRow } from "../lib/db";
import {
  listDocuments,
  countChunks,
  deleteDocument,
  deleteDocuments,
  updateDocumentTags,
  listGroups,
  parseTags,
} from "../lib/db";
import { ingestFile } from "../lib/ingest";

const toast = inject("toast") as (msg: string) => void;

const docs = ref<DocumentRow[]>([]);
const totalChunks = ref(0);
const loading = ref(true);
const importing = ref(false);
const keyword = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

// ---- 分组 ----
const groups = ref<string[]>([]);
const groupFilter = ref(""); // "" = 全部
const editingId = ref<number | null>(null); // 行内分组编辑器展开的文档 id
const editTags = ref<string[]>([]);
const newTag = ref("");

// ---- 批量选择 ----
const selected = ref<Set<number>>(new Set());
const batchTagOpen = ref(false);
const batchTag = ref("");
const batchNewTag = ref("");

async function refresh() {
  docs.value = await listDocuments();
  totalChunks.value = (await countChunks()) ?? 0;
  groups.value = await listGroups();
  loading.value = false;
  // 清理失效的选择/筛选
  const valid = new Set(docs.value.map((d) => d.id));
  selected.value = new Set([...selected.value].filter((id) => valid.has(id)));
  if (groupFilter.value && !groups.value.includes(groupFilter.value)) groupFilter.value = "";
}

onMounted(refresh);

const filtered = computed(() => {
  let list = docs.value;
  const q = keyword.value.trim().toLowerCase();
  if (q) list = list.filter((d) => d.filename.toLowerCase().includes(q));
  if (groupFilter.value) list = list.filter((d) => parseTags(d.tags).includes(groupFilter.value));
  return list;
});

const allChecked = computed(() => filtered.value.length > 0 && filtered.value.every((d) => selected.value.has(d.id)));

function toggleAll() {
  if (allChecked.value) {
    for (const d of filtered.value) selected.value.delete(d.id);
  } else {
    for (const d of filtered.value) selected.value.add(d.id);
  }
  selected.value = new Set(selected.value);
}

function toggleOne(id: number) {
  const s = new Set(selected.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selected.value = s;
}

async function removeDoc(d: DocumentRow) {
  const confirmed = window.confirm(`删除「${d.filename}」及其全部内容块？`);
  if (!confirmed) return;
  try {
    await deleteDocument(d.id);
    toast(`已删除：${d.filename}`);
    await refresh();
  } catch (err) {
    toast(`删除失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function removeSelected() {
  const ids = [...selected.value];
  if (ids.length === 0) return;
  const confirmed = window.confirm(`删除选中的 ${ids.length} 篇文档及其全部内容块？此操作不可恢复。`);
  if (!confirmed) return;
  try {
    await deleteDocuments(ids);
    toast(`已删除 ${ids.length} 篇文档`);
    selected.value = new Set();
    await refresh();
  } catch (err) {
    toast(`批量删除失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- 行内分组编辑 ----
function openEditor(d: DocumentRow) {
  editingId.value = d.id;
  editTags.value = [...parseTags(d.tags)];
  newTag.value = "";
}

function toggleEditTag(t: string) {
  const i = editTags.value.indexOf(t);
  if (i >= 0) editTags.value.splice(i, 1);
  else editTags.value.push(t);
}

function addNewTag() {
  const t = newTag.value.trim();
  if (!t) return;
  if (!editTags.value.includes(t)) editTags.value.push(t);
  newTag.value = "";
}

async function saveEditor(d: DocumentRow) {
  try {
    await updateDocumentTags(d.id, [...new Set(editTags.value)]);
    toast(`已更新分组：${d.filename}`);
    editingId.value = null;
    await refresh();
  } catch (err) {
    toast(`分组更新失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- 批量设置分组 ----
async function applyBatchTag() {
  const ids = [...selected.value];
  const tag = batchTag.value.trim();
  if (ids.length === 0 || !tag) return;
  try {
    for (const id of ids) {
      const d = docs.value.find((x) => x.id === id);
      const tags = new Set(parseTags(d?.tags ?? null));
      tags.add(tag);
      await updateDocumentTags(id, [...tags]);
    }
    toast(`已将 ${ids.length} 篇文档加入分组「${tag}」`);
    batchTag.value = "";
    batchTagOpen.value = false;
    await refresh();
  } catch (err) {
    toast(`批量分组失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function clearSelectedTags() {
  const ids = [...selected.value];
  if (ids.length === 0) return;
  try {
    for (const id of ids) await updateDocumentTags(id, []);
    toast(`已清除 ${ids.length} 篇文档的分组`);
    batchTagOpen.value = false;
    await refresh();
  } catch (err) {
    toast(`清除失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

function fileColor(type: string): string {
  if (type === "DOCX") return "#7FB5FF";
  if (type === "XLSX") return "#6FD3A4";
  return "#97A2B3";
}

async function handleFiles(files: FileList | File[]) {
  const list = Array.from(files);
  if (list.length === 0) return;
  importing.value = true;
  let ok = 0;
  let dup = 0;
  let errs = 0;
  for (const f of list) {
    const r = await ingestFile(f);
    if (r.status === "inserted") {
      ok++;
      toast(`已入库：${f.name}（${r.chunks} 块）`);
    } else if (r.status === "duplicate") {
      dup++;
      toast(`跳过重复：${f.name}`);
    } else {
      errs++;
      toast(`导入失败：${f.name} — ${r.message}`);
    }
  }
  importing.value = false;
  await refresh();
  const parts = [];
  if (ok) parts.push(`${ok} 篇入库`);
  if (dup) parts.push(`${dup} 篇重复`);
  if (errs) parts.push(`${errs} 篇失败`);
  toast(`导入完成：${parts.join("，") || "无变化"}`);
  if (fileInput.value) fileInput.value.value = "";
}

function onDrop(e: DragEvent) {
  const files = e.dataTransfer?.files;
  if (files && files.length) void handleFiles(files);
}
</script>

<template>
  <div>
    <div
      class="dropzone"
      data-placeholder="dropzone"
      @dragover.prevent
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
      <div>拖拽文件到这里，或 <b>点击选择文件</b></div>
      <div class="fmt">支持 .txt · .md · .docx（一期）｜.pdf · 图片 OCR（二期）</div>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept=".txt,.md,.markdown,.docx"
        style="display:none"
        @change="handleFiles(($event.target as HTMLInputElement).files ?? [])"
      />
    </div>
    <div class="toolbar">
      <div class="search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
        <input class="input" v-model="keyword" placeholder="搜索文件名…" />
      </div>
      <button class="btn btn-ghost" @click="toast('粘贴文本入库即将开放（P1 二期）')">粘贴文本</button>
      <button class="btn btn-primary" :disabled="importing" @click="fileInput?.click()">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>{{ importing ? "导入中…" : "批量导入" }}
      </button>
    </div>

    <!-- 分组筛选 -->
    <div class="group-filter" v-if="groups.length > 0">
      <button class="chip" :class="{ on: groupFilter === '' }" @click="groupFilter = ''">全部</button>
      <button v-for="g in groups" :key="g" class="chip" :class="{ on: groupFilter === g }" @click="groupFilter = g">{{ g }}</button>
    </div>

    <!-- 批量操作条 -->
    <div v-if="selected.size > 0" class="batch-bar">
      <span>已选 <b>{{ selected.size }}</b> 篇</span>
      <button class="btn btn-danger btn-sm" @click="removeSelected">删除选中</button>
      <button class="btn btn-soft btn-sm" @click="batchTagOpen = !batchTagOpen">设置分组</button>
      <button class="btn btn-ghost btn-sm" @click="clearSelectedTags">清除分组</button>
      <button class="btn btn-ghost btn-sm" @click="selected = new Set()">取消</button>
      <div v-if="batchTagOpen" class="batch-tag-input">
        <select class="select" v-model="batchTag">
          <option value="">选择已有分组…</option>
          <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
        </select>
        <input class="input" v-model="batchNewTag" placeholder="或输入新分组名…" @keydown.enter="batchTag = batchNewTag.trim() || batchTag" />
        <button class="btn btn-primary btn-sm" @click="applyBatchTag">应用</button>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="scroll-limit">
        <table class="tbl">
        <colgroup><col style="width:34px" /><col /><col /><col /><col /><col /><col style="width:150px" /></colgroup>
        <thead><tr>
          <th><input type="checkbox" :checked="allChecked" @change="toggleAll" /></th>
          <th>文件名</th><th>类型</th><th>大小</th><th>入库时间</th><th>分组</th><th style="text-align:right">操作</th>
        </tr></thead>
        <tbody>
          <tr v-for="d in filtered" :key="d.id" :class="{ sel: selected.has(d.id) }">
            <td><input type="checkbox" :checked="selected.has(d.id)" @change="toggleOne(d.id)" /></td>
            <td>
              <div class="fname">
                <svg viewBox="0 0 24 24" :style="{ stroke: fileColor(d.file_type) }"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                <span class="t">{{ d.filename }}</span>
              </div>
            </td>
            <td><span class="tag">{{ d.file_type }}</span></td>
            <td>{{ d.size ? (d.size / 1024).toFixed(1) + " KB" : "—" }}</td>
            <td style="color:var(--text-muted);font-size:12.5px">{{ d.created_at }}</td>
            <td>
              <div style="display:flex;gap:5px;flex-wrap:wrap">
                <span v-for="t in parseTags(d.tags)" :key="t" class="tag gold">{{ t }}</span>
                <span v-if="parseTags(d.tags).length === 0" style="color:var(--text-faint);font-size:12px">未分组</span>
              </div>
            </td>
            <td>
              <div class="row-actions">
                <button class="icon-btn" title="分组" @click="editingId === d.id ? (editingId = null) : openEditor(d)">
                  <svg viewBox="0 0 24 24"><path d="M7 7h10M7 12h10M7 17h6" /></svg>
                </button>
                <button class="icon-btn" title="分析" @click="toast('单篇分析将在 P3 接入')">
                  <svg viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 15l4-6 3 4 5-7" /></svg>
                </button>
                <button class="icon-btn" title="删除" @click="removeDoc(d)">
                  <svg viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
            </td>
          </tr>
          <!-- 行内分组编辑器 -->
          <tr v-if="editingId !== null && filtered.some((d) => d.id === editingId)" :key="'edit-' + editingId" class="tag-editor-row">
            <td></td>
            <td colspan="6">
              <div class="tag-editor">
                <span class="tag-editor-label">分组：</span>
                <span v-for="g in groups" :key="g" class="chip" :class="{ on: editTags.includes(g) }" @click="toggleEditTag(g)">{{ g }}</span>
                <span v-if="groups.length === 0" style="color:var(--text-faint);font-size:12px">暂无分组，输入新建</span>
                <input class="input" style="width:150px" v-model="newTag" placeholder="新建分组…" @keydown.enter="addNewTag" />
                <button class="btn btn-primary btn-sm" @click="saveEditor(filtered.find((d) => d.id === editingId)!)">保存</button>
                <button class="btn btn-ghost btn-sm" @click="editingId = null">取消</button>
              </div>
            </td>
          </tr>
          <tr v-if="filtered.length === 0 && !loading">
            <td colspan="7" style="text-align:center;color:var(--text-faint);padding:26px">
              {{ keyword || groupFilter ? "没有匹配的文档" : "还没有文档 — 拖入 .txt / .md / .docx 开始建立知识库" }}
            </td>
          </tr>
        </tbody>
        </table>
      </div>
    </div>
    <div class="libstats" style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px">
      <div class="card">
        <div class="card-title">文档统计</div>
        <div class="stat-line"><span>文档总数</span><b>{{ docs.length }}</b></div>
        <div class="stat-line"><span>分块总数</span><b>{{ totalChunks }}</b></div>
        <div class="stat-line"><span>内容哈希</span><b>SHA-256 去重</b></div>
      </div>
      <div class="card">
        <div class="card-title">最近入库</div>
        <div style="font-size:12.5px;color:var(--text-muted)">
          <div v-if="docs.length === 0" style="padding:4px 0">暂无</div>
          <div v-for="d in docs.slice(0, 3)" :key="d.id" style="padding:4px 0;display:flex;align-items:center;gap:7px">
            <span class="status-dot"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.filename }}</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">分组 <span class="hint">{{ groups.length }} 个</span></div>
        <div style="font-size:12.5px;color:var(--text-muted)">按品牌 / 频道 / 日期分组，智能分析可按组聚焦</div>
        <div class="cluster"><span v-for="g in groups.slice(0, 5)" :key="g" class="tag gold">{{ g }}</span><span v-if="groups.length === 0" class="tag">暂无</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-filter { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 12px; }
.chip {
  border: 1px solid var(--surface-2); background: transparent; color: var(--text-muted);
  border-radius: 999px; padding: 4px 12px; font-size: 12.5px; cursor: pointer;
}
.chip.on { background: var(--accent); color: #0b0e13; border-color: var(--accent); }
.batch-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: rgba(232, 179, 106, 0.08); border: 1px solid rgba(232, 179, 106, 0.3);
  border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px;
}
.batch-bar b { color: var(--accent); }
.batch-tag-input { display: flex; gap: 6px; align-items: center; width: 100%; margin-top: 6px; }
.batch-tag-input .select { width: 180px; }
.batch-tag-input .input { width: 180px; }
tr.sel td { background: rgba(232, 179, 106, 0.06); }
.tag-editor-row td { border-top: 1px dashed var(--surface-2); }
.tag-editor { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 0; }
.tag-editor-label { color: var(--text-muted); font-size: 12.5px; }
.tag-editor .input { width: 150px; }
</style>
