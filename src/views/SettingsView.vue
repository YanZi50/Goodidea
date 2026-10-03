<script setup lang="ts">
import { ref, onMounted, inject } from "vue";
import { dbStatus } from "../lib/db";
import {
  loadAIConfig,
  saveAIConfig,
  clearAIConfig,
  DEFAULT_CONFIG,
  type AIConfig,
} from "../lib/ai";

const toast = inject("toast") as (msg: string) => void;

const status = ref<{ connected: boolean; tables: string[]; documents: number; error?: string }>({
  connected: false,
  tables: [],
  documents: 0,
});
const checking = ref(true);

const cfg = ref<AIConfig>({ ...DEFAULT_CONFIG });
const configured = ref(false);

onMounted(async () => {
  status.value = await dbStatus();
  checking.value = false;
  const saved = loadAIConfig();
  if (saved) {
    cfg.value = { ...saved };
    configured.value = true;
  }
});

function save() {
  if (!cfg.value.apiKey.trim() || !cfg.value.model.trim()) {
    toast("API Key 与模型 ID 不能为空");
    return;
  }
  saveAIConfig({ ...cfg.value, label: cfg.value.label.trim() || "自定义模型" });
  configured.value = true;
  toast("模型配置已保存（仅存本机，不入库）");
}

function clear() {
  clearAIConfig();
  configured.value = false;
  cfg.value = { ...DEFAULT_CONFIG };
  toast("已清除模型配置");
}
</script>

<template>
  <div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">模型接入 <span class="hint">P1 · OpenAI 兼容</span></div>
      <div style="color:var(--text-muted);font-size:13.5px">
        默认指向火山方舟（豆包）OpenAI 兼容端点，也可填任意兼容端点。密钥仅存本机浏览器存储，不入库、不进 git。
        <span v-if="configured" style="color:var(--green)">　已配置 ✓</span>
        <span v-else style="color:var(--red)">　未配置</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
        <div class="field" style="margin:0">
          <label class="label">显示名</label>
          <input class="input" v-model="cfg.label" placeholder="如：豆包 doubao-seed-2.0-pro" />
        </div>
        <div class="field" style="margin:0">
          <label class="label">模型 ID</label>
          <input class="input" v-model="cfg.model" placeholder="火山方舟模型版本 ID 或 ep-xxx" />
        </div>
        <div class="field" style="margin:0;grid-column:1 / -1">
          <label class="label">API Base URL</label>
          <input class="input" v-model="cfg.baseURL" />
        </div>
        <div class="field" style="margin:0;grid-column:1 / -1">
          <label class="label">API Key</label>
          <input class="input" v-model="cfg.apiKey" type="password" placeholder="sk-…（仅存本机）" />
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" @click="save">保存配置</button>
        <button class="btn btn-ghost btn-sm" @click="clear">清除</button>
      </div>
    </div>

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
        模型默认值、热点源选择、价格表维护将在此面板进一步落地。
      </div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" @click="toast('价格表编辑在 P2 接入（当前为常量价格表）')">价格表</button>
      </div>
    </div>
  </div>
</template>
