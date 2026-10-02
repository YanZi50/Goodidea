<script setup lang="ts">
import { ref, computed, inject } from "vue";

type Doc = {
  name: string;
  type: string;
  size: string;
  time: string;
  tags: Array<[string, string]>;
};

const toast = inject("toast") as (msg: string) => void;

// 示例数据（P1 接入真实 SQLite 查询）
const docs = ref<Doc[]>([
  { name: "名表回收口播脚本-0715.md", type: "MD", size: "8.2 KB", time: "2026-09-30 10:24", tags: [["gold", "口播"], ["blue", "名表"]] },
  { name: "包袋验货流程要点.txt", type: "TXT", size: "14.6 KB", time: "2026-09-29 16:02", tags: [["green", "验货"], ["", "包袋"]] },
  { name: "行情周报-W32.docx", type: "DOCX", size: "46.1 KB", time: "2026-09-28 09:41", tags: [["gold", "行情"], ["blue", "周报"]] },
  { name: "Richard Mille 话术库.md", type: "MD", size: "21.3 KB", time: "2026-09-27 14:55", tags: [["blue", "名表"]] },
  { name: "Chanel 包回收价格表 v3.xlsx", type: "XLSX", size: "32.8 KB", time: "2026-09-26 11:12", tags: [["gold", "价格"], ["", "包袋"]] },
  { name: "剧情种草脚本-0715.md", type: "MD", size: "11.9 KB", time: "2026-09-25 18:33", tags: [["green", "剧情"], ["", "脚本"]] },
  { name: "Zenith 到货验货记录.txt", type: "TXT", size: "3.4 KB", time: "2026-09-24 20:07", tags: [["blue", "名表"], ["green", "验货"]] },
  { name: "小红书种草文案集.md", type: "MD", size: "17.5 KB", time: "2026-09-23 15:26", tags: [["gold", "种草"], ["", "小红书"]] },
  { name: "客户常见异议汇总.txt", type: "TXT", size: "6.8 KB", time: "2026-09-22 10:58", tags: [["", "客服"], ["blue", "话术"]] },
  { name: "2026 名表行情年报.docx", type: "DOCX", size: "88.4 KB", time: "2026-09-20 13:40", tags: [["gold", "行情"], ["", "年报"]] },
]);

const keyword = ref("");
const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return docs.value;
  return docs.value.filter(
    (d) => d.name.toLowerCase().includes(q) || d.tags.some((t) => t[1].toLowerCase().includes(q))
  );
});

function fileColor(type: string): string {
  if (type === "DOCX") return "#7FB5FF";
  if (type === "XLSX") return "#6FD3A4";
  return "#97A2B3";
}
</script>

<template>
  <div>
    <div class="dropzone" data-placeholder="dropzone" @click="toast('上传解析将在 P1 接入（设计稿演示）')">
      <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
      <div>拖拽文件到这里，或 <b>点击选择文件</b></div>
      <div class="fmt">支持 .txt · .md · .docx（一期）｜.pdf · 图片 OCR（二期）</div>
    </div>
    <div class="toolbar">
      <div class="search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
        <input class="input" v-model="keyword" placeholder="搜索文件名、标签…" />
      </div>
      <button class="btn btn-ghost" @click="toast('粘贴文本入库即将开放（设计稿演示）')">粘贴文本</button>
      <button class="btn btn-primary" @click="toast('批量导入将在 P1 接入（设计稿演示）')">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>批量导入
      </button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table class="tbl">
        <colgroup><col /><col /><col /><col /><col /><col /></colgroup>
        <thead><tr><th>文件名</th><th>类型</th><th>大小</th><th>入库时间</th><th>标签</th><th style="text-align:right">操作</th></tr></thead>
        <tbody>
          <tr v-for="d in filtered" :key="d.name">
            <td>
              <div class="fname">
                <svg viewBox="0 0 24 24" :style="{ stroke: fileColor(d.type) }"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                <span class="t">{{ d.name }}</span>
              </div>
              <div class="fmeta">{{ d.time }}</div>
            </td>
            <td><span class="tag">{{ d.type }}</span></td>
            <td>{{ d.size }}</td>
            <td style="color:var(--text-muted);font-size:12.5px">{{ d.time }}</td>
            <td><div style="display:flex;gap:5px;flex-wrap:wrap">
              <span v-for="t in d.tags" :key="t[1]" class="tag" :class="t[0]">{{ t[1] }}</span>
            </div></td>
            <td>
              <div class="row-actions">
                <button class="icon-btn" title="分析" @click="toast('对本文档执行分析（设计稿演示）')">
                  <svg viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 15l4-6 3 4 5-7" /></svg>
                </button>
                <button class="icon-btn" title="删除" @click="toast('删除确认流程在 P1 接入（设计稿演示）')">
                  <svg viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="6" style="text-align:center;color:var(--text-faint);padding:22px">没有匹配的文档</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="libstats" style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px">
      <div class="card">
        <div class="card-title">文档统计</div>
        <div class="stat-line"><span>文档总数</span><b>{{ docs.length }}</b></div>
        <div class="stat-line"><span>总字数</span><b>8.4万</b></div>
        <div class="stat-line"><span>分块数</span><b>326</b></div>
      </div>
      <div class="card">
        <div class="card-title">最近入库</div>
        <div style="font-size:12.5px;color:var(--text-muted)">
          <div v-for="d in docs.slice(0, 3)" :key="d.name" style="padding:4px 0;display:flex;align-items:center;gap:7px">
            <span class="status-dot"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ d.name }}</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">素材库（P3）<span class="hint">示例</span></div>
        <div style="font-size:12.5px;color:var(--text-muted)">爆款拆解 · 个人风格 · 产品资料三库，后续版本接入向量检索</div>
        <div class="cluster"><span class="tag gold">爆款拆解</span><span class="tag green">个人风格</span><span class="tag blue">产品资料</span></div>
      </div>
    </div>
  </div>
</template>
