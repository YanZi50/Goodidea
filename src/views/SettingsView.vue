<script setup lang="ts">
import { ref, onMounted, inject } from "vue";
import { dbStatus } from "../lib/db";

const toast = inject("toast") as (msg: string) => void;

const status = ref<{ connected: boolean; tables: string[]; documents: number; error?: string }>({
  connected: false,
  tables: [],
  documents: 0,
});
const checking = ref(true);

onMounted(async () => {
  status.value = await dbStatus();
  checking.value = false;
});
</script>

<template>
  <div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">数据存储 <span class="hint">SQLite · P0 已接入</span></div>
      <div style="color:var(--text-muted);font-size:13.5px">
        本地单文件库 <code style="background:var(--surface-2);padding:1px 6px;border-radius:6px">goodidea.db</code>
        （AppConfig 目录）。表结构由 Rust 侧 Migration 版本化管理，前端只读写不做 DDL。
      </div>
      <div v-if="checking" style="margin-top:12px;font-size:13px;color:var(--text-faint)">正在检查连接…</div>
      <div v-else class="db-state" style="margin-top:12px;display:flex;flex-direction:column;gap:8px;font-size:13px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-dot" :style="{ background: status.connected ? 'var(--green)' : 'var(--red)' }"></span>
          <b>{{ status.connected ? "已连接" : "未连接" }}</b>
          <span style="color:var(--text-faint)" v-if="status.error">（{{ status.error }}）</span>
        </div>
        <div v-if="status.connected">
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <span>已建表：<b>{{ status.tables.join("、") || "（无）" }}</b></span>
            <span>文档数：<b>{{ status.documents }}</b></span>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">偏好设置 <span class="hint">P2 落地</span></div>
      <div style="color:var(--text-muted);font-size:13.5px">
        API 密钥（.env）、模型默认值、热点源选择、价格表维护将在此面板落地。
      </div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" @click="toast('密钥配置在 P2 接入（设计稿演示）')">密钥配置</button>
        <button class="btn btn-ghost btn-sm" @click="toast('价格表编辑在 P2 接入（设计稿演示）')">价格表</button>
      </div>
    </div>
  </div>
</template>
