<script setup lang="ts">
import { ref, computed, inject, onMounted } from "vue";
import type { DocumentRow, GroupRow } from "../lib/db";
import {
  listDocuments,
  countChunks,
  deleteDocument,
  deleteDocuments,
  listGroups,
  createGroup,
  deleteGroup,
  setDocumentGroup,
  setDocumentsGroup,
} from "../lib/db";
import { ingestFile } from "../lib/ingest";

const toast = inject("toast") as (msg: string) => void;

const docs = ref<DocumentRow[]>([]);
const totalChunks = ref(0);
const loading = ref(true);
const importing = ref(false);
const progress = ref(""); // 导入进度 "i/N"
const keyword = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

// ---- 分组（groups 表实体，组间互不干涉） ----
const groups = ref<GroupRow[]>([]);
const groupFilter = ref<"all" | "none" | number>("all"); // all=全部跨组 / none=未分组 / number=组 id
const creatingGroup = ref(false);
const newGroupName = ref("");
const editingId = ref<number | null>(null); // 行内移组展开的文档 id
const editGroupId = ref<number | "">(""); // "" = 未分组（select 原生空值，避免 null 绑定歧义）

// ---- 批量选择 ----
const selected = ref<Set<number>>(new Set());
const batchGroup = ref<number | "">("");
const targetGroup = ref<number | "">(""); // 导入时归属组

async function refresh() {
  docs.value = await listDocuments();
  totalChunks.value = (await countChunks()) ?? 0;
  groups.value = await listGroups();
  loading.value = false;
  // 清理失效的选择/筛选
  const valid = new Set(docs.value.map((d) => d.id));
  selected.value = new Set([...selected.value].filter((id) => valid.has(id)));
  if (typeof groupFilter.value === "number" && !groups.value.some((g) => g.id === groupFilter.value)) {
    groupFilter.value = "all";
  }
}

onMounted(refresh);

const ungroupedCount = computed(() => docs.value.filter((d) => d.group_id === null).length);

function groupName(id: number | null): string {
  if (id === null) return "未分组";
  return groups.value.find((g) => g.id === id)?.name ?? "未分组";
}

const filtered = computed(() => {
  let list = docs.value;
  const q = keyword.value.trim().toLowerCase();
  if (q) list = list.filter((d) => d.filename.toLowerCase().includes(q));
  if (groupFilter.value === "none") list = list.filter((d) => d.group_id === null);
  else if (typeof groupFilter.value === "number") list = list.filter((d) => d.group_id === groupFilter.value);
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

// ---- 创建 / 删除组 ----
async function createGroupSubmit() {
  const name = newGroupName.value.trim();
  if (!name) {
    toast("请输入分组名称");
    return;
  }
  try {
    const id = await createGroup(name);
    toast(`已创建分组「${name}」`);
    newGroupName.value = "";
    creatingGroup.value = false;
    groupFilter.value = id;
    await refresh();
  } catch (err) {
    toast(`创建失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function removeGroup(g: GroupRow) {
  const confirmed = window.confirm(`删除分组「${g.name}」？组内 ${g.doc_count} 篇文档将移回「未分组」，文档本身不删除。`);
  if (!confirmed) return;
  try {
    await deleteGroup(g.id);
    toast(`已删除分组「${g.name}」`);
    if (groupFilter.value === g.id) groupFilter.value = "all";
    await refresh();
  } catch (err) {
    toast(`删除分组失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- 行内移组 ----
function openEditor(d: DocumentRow) {
  editingId.value = d.id;
  editGroupId.value = d.group_id ?? "";
}

async function saveEditor(d: DocumentRow) {
  const gid = editGroupId.value === "" ? null : editGroupId.value;
  try {
    await setDocumentGroup(d.id, gid);
    toast(gid === null ? `已移出分组：${d.filename}` : `已移入「${groupName(gid)}」：${d.filename}`);
    editingId.value = null;
    await refresh();
  } catch (err) {
    toast(`移组失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- 批量移入 / 移出分组 ----
async function applyBatchGroup() {
  const ids = [...selected.value];
  const gid = batchGroup.value;
  if (ids.length === 0 || gid === "") {
    toast("请先勾选文档并选择目标分组");
    return;
  }
  try {
    await setDocumentsGroup(ids, gid);
    toast(`已将 ${ids.length} 篇文档移入「${groupName(gid)}」`);
    batchGroup.value = "";
    await refresh();
  } catch (err) {
    toast(`批量移组失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

async function ungroupSelected() {
  const ids = [...selected.value];
  if (ids.length === 0) return;
  try {
    await setDocumentsGroup(ids, null);
    toast(`已将 ${ids.length} 篇文档移出分组`);
    await refresh();
  } catch (err) {
    toast(`移出失败：${err instanceof Error ? err.message : String(err)}`);
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
  const gid = targetGroup.value === "" ? null : targetGroup.value;
  let ok = 0;
  let dup = 0;
  let errs = 0;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    progress.value = `${i + 1}/${list.length}`;
    const r = await ingestFile(f, gid);
    if (r.status === "inserted") ok++;
    else if (r.status === "duplicate") dup++;
    else {
      errs++;
      toast(`导入失败：${f.name} — ${r.message}`);
    }
  }
  importing.value = false;
  progress.value = "";
  await refresh();
  const parts = [];
  if (ok) parts.push(`${ok} 篇入库`);
  if (dup) parts.push(`${dup} 篇重复`);
  if (errs) parts.push(`${errs} 篇失败`);
  toast(`导入完成：${parts.join("，") || "无变化"}${gid !== null ? `（归入「${groupName(gid)}」）` : ""}`);
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
      <select class="select" v-model="targetGroup" style="width:150px" title="导入时直接归入所选分组">
        <option value="">导入到：未分组</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">导入到：{{ g.name }}</option>
      </select>
      <button class="btn btn-ghost" @click="toast('粘贴文本入库即将开放（P1 二期）')">粘贴文本</button>
      <button class="btn btn-primary" :disabled="importing" @click="fileInput?.click()">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>{{ importing ? `导入中 ${progress}…` : "批量导入" }}
      </button>
    </div>

    <!-- 组导航：全部（跨组总览）/ 未分组 / 各组 / 新建组 -->
    <div class="group-nav">
      <button class="chip" :class="{ on: groupFilter === 'all' }" @click="groupFilter = 'all'">全部 {{ docs.length }}</button>
      <button class="chip" :class="{ on: groupFilter === 'none' }" @click="groupFilter = 'none'">未分组 {{ ungroupedCount }}</button>
      <span v-for="g in groups" :key="g.id" class="g-chip-wrap">
        <button class="chip g-chip" :class="{ on: groupFilter === g.id }" @click="groupFilter = g.id">{{ g.name }} {{ g.doc_count }}</button>
        <button class="g-del" title="删除分组（组内文档移回未分组）" @click.stop="removeGroup(g)">×</button>
      </span>
      <template v-if="creatingGroup">
        <input class="input g-new-input" v-model="newGroupName" placeholder="分组名称…" @keydown.enter="createGroupSubmit" />
        <button class="btn btn-primary btn-sm" @click="createGroupSubmit">创建</button>
        <button class="btn btn-ghost btn-sm" @click="creatingGroup = false; newGroupName = ''">取消</button>
      </template>
      <button v-else class="btn btn-ghost btn-sm" @click="creatingGroup = true">+ 新建组</button>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <!-- 第一行：常驻批量工具条（勾选只变状态不跳动） -->
      <div class="tbl-bar">
        <span class="tbl-bar-count">
          <b>{{ selected.size }}</b> 篇已选
          <span v-if="selected.size === 0" style="color:var(--text-faint);font-weight:400">· 勾选表格中文档后可批量操作</span>
        </span>
        <div class="tbl-bar-actions">
          <button class="btn btn-danger btn-sm" :disabled="selected.size === 0" :title="selected.size === 0 ? '先勾选文档' : '删除选中文档'" @click="removeSelected">删除</button>
          <button class="btn btn-ghost btn-sm" :disabled="selected.size === 0" :title="selected.size === 0 ? '先勾选文档' : '移出分组（回到未分组）'" @click="ungroupSelected">移出分组</button>
          <button v-if="selected.size > 0" class="btn btn-ghost btn-sm" @click="selected = new Set()">取消</button>
        </div>
      </div>
      <!-- 第二行：常驻移组槽位（固定高度，零布局跳动） -->
      <div class="tbl-bar-tags">
        <template v-if="selected.size > 0">
          <span class="tag-editor-label">移入分组：</span>
          <select class="select" v-model="batchGroup">
            <option value="">选择目标分组…</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
          <button class="btn btn-primary btn-sm" @click="applyBatchGroup">应用</button>
        </template>
        <span v-else class="tag-editor-label" style="color:var(--text-faint)">勾选文档后，可在这里批量移入 / 移出分组</span>
      </div>
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
              <span v-if="d.group_id !== null" class="tag gold">{{ groupName(d.group_id) }}</span>
              <span v-else style="color:var(--text-faint);font-size:12px">未分组</span>
            </td>
            <td>
              <div class="row-actions">
                <button class="icon-btn" title="移入/移出分组" @click="editingId === d.id ? (editingId = null) : openEditor(d)">
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
          <!-- 行内移组编辑器 -->
          <tr v-if="editingId !== null && filtered.some((d) => d.id === editingId)" :key="'edit-' + editingId" class="tag-editor-row">
            <td></td>
            <td colspan="6">
              <div class="tag-editor">
                <span class="tag-editor-label">归属组：</span>
                <select class="select" v-model="editGroupId" style="width:180px">
                  <option value="">未分组</option>
                  <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
                </select>
                <button class="btn btn-primary btn-sm" @click="saveEditor(filtered.find((d) => d.id === editingId)!)">保存</button>
                <button class="btn btn-ghost btn-sm" @click="editingId = null">取消</button>
              </div>
            </td>
          </tr>
          <tr v-if="filtered.length === 0 && !loading">
            <td colspan="7" style="text-align:center;color:var(--text-faint);padding:26px">
              {{ keyword || groupFilter !== 'all' ? "没有匹配的文档" : "还没有文档 — 拖入 .txt / .md / .docx 开始建立知识库" }}
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
        <div style="font-size:12.5px;color:var(--text-muted)">组间互不干涉，智能分析可按组聚焦</div>
        <div class="cluster">
          <span v-for="g in groups.slice(0, 5)" :key="g.id" class="tag gold">{{ g.name }} {{ g.doc_count }}</span>
          <span v-if="groups.length === 0" class="tag">暂无</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-nav { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 4px 0 12px; }
.chip {
  border: 1px solid var(--surface-2); background: transparent; color: var(--text-muted);
  border-radius: 999px; padding: 4px 12px; font-size: 12.5px; cursor: pointer;
}
.chip.on { background: var(--accent); color: #0b0e13; border-color: var(--accent); }
.g-chip-wrap { position: relative; display: inline-flex; }
.g-del {
  position: absolute; right: -5px; top: -7px; width: 16px; height: 16px; line-height: 14px;
  border-radius: 50%; border: 1px solid var(--border); background: var(--surface-1);
  color: var(--text-muted); font-size: 11px; cursor: pointer; padding: 0; text-align: center;
}
.g-del:hover { background: var(--danger); color: #fff; border-color: var(--danger); }
.g-new-input { width: 140px; padding: 5px 10px; }
.tbl-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 14px; border-bottom: 1px solid var(--surface-2);
  background: rgba(255, 255, 255, 0.015);
}
.tbl-bar-count { font-size: 13px; color: var(--text-muted); margin-right: auto; }
.tbl-bar-count b { color: var(--accent); font-size: 15px; }
.tbl-bar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.tbl-bar-actions .btn:disabled { opacity: 0.35; cursor: not-allowed; }
.tbl-bar-tags {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 10px 14px; border-bottom: 1px solid var(--surface-2);
  background: rgba(232, 179, 106, 0.05); font-size: 12.5px;
  min-height: 46px;
}
.tbl-bar-tags .select { width: 180px; flex-shrink: 0; }
.tbl-bar-tags .input { width: 180px; flex-shrink: 0; }
tr.sel td { background: rgba(232, 179, 106, 0.06); }
.tag-editor-row td { border-top: 1px dashed var(--surface-2); }
.tag-editor { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 0; }
.tag-editor-label { color: var(--text-muted); font-size: 12.5px; }
</style>
