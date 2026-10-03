<script setup lang="ts">
import { ref, computed, inject, onMounted } from "vue";
import type { DocumentRow } from "../lib/db";
import { listDocuments, countChunks, deleteDocument } from "../lib/db";
import { ingestFile } from "../lib/ingest";

const toast = inject("toast") as (msg: string) => void;

const docs = ref<DocumentRow[]>([]);
const totalChunks = ref(0);
const loading = ref(true);
const importing = ref(false);
const keyword = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

async function refresh() {
  docs.value = await listDocuments();
  totalChunks.value = (await countChunks()) ?? 0;
  loading.value = false;
}

onMounted(refresh);

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return docs.value;
  return docs.value.filter((d) => d.filename.toLowerCase().includes(q));
});

function parseTags(d: DocumentRow): string[] {
  try {
    const v = JSON.parse(d.tags ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
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
    <div class="card" style="padding:0;overflow:hidden">
      <table class="tbl">
        <colgroup><col /><col /><col /><col /><col /><col /></colgroup>
        <thead><tr><th>文件名</th><th>类型</th><th>大小</th><th>入库时间</th><th>标签</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>
          <tr v-for="d in filtered" :key="d.id">
            <td>
              <div class="fname">
                <svg viewBox="0 0 24 24" :style="{ stroke: fileColor(d.file_type) }"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                <span class="t">{{ d.filename }}</span>
              </div>
            </td>
            <td><span class="tag">{{ d.file_type }}</span></td>
            <td>{{ d.size ? (d.size / 1024).toFixed(1) + " KB" : "—" }}</td>
            <td style="color:var(--text-muted);font-size:12.5px">{{ d.created_at }}</td>
            <td><div style="display:flex;gap:5px;flex-wrap:wrap">
              <span v-for="t in parseTags(d)" :key="t" class="tag">{{ t }}</span>
            </div></td>
            <td>
              <div class="row-actions">
                <button class="icon-btn" title="分析" @click="toast('分析接入下一步（当前为文档摄取闭环）')">
                  <svg viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 15l4-6 3 4 5-7" /></svg>
                </button>
                <button class="icon-btn" title="删除" @click="removeDoc(d)">
                  <svg viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filtered.length === 0 && !loading">
            <td colspan="6" style="text-align:center;color:var(--text-faint);padding:26px">
              {{ keyword ? "没有匹配的文档" : "还没有文档 — 拖入 .txt / .md / .docx 开始建立知识库" }}
            </td>
          </tr>
        </tbody>
      </table>
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
        <div class="card-title">素材库（P3）<span class="hint">规划中</span></div>
        <div style="font-size:12.5px;color:var(--text-muted)">爆款拆解 · 个人风格 · 产品资料三库，后续版本接入向量检索</div>
        <div class="cluster"><span class="tag gold">爆款拆解</span><span class="tag green">个人风格</span><span class="tag blue">产品资料</span></div>
      </div>
    </div>
  </div>
</template>
