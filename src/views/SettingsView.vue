<script setup lang="ts">
import { ref, onMounted, inject } from "vue";
import { dbStatus, listBillingRules, upsertBillingRule } from "../lib/db";
import {
  loadAIConfig,
  saveAIConfig,
  clearAIConfig,
  DEFAULT_CONFIG,
  PRICE_TABLE,
  reloadPriceTable,
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

// ---- 价格表（billing_rules 可维护；db 优先，常量兜底） ----
const priceOpen = ref(false);
const priceRows = ref<{ model: string; inP: number; outP: number }[]>([]);
const priceLoading = ref(false);
const priceSaving = ref(false);
const priceSource = ref("db"); // db / default

async function openPrice() {
  priceOpen.value = !priceOpen.value;
  if (!priceOpen.value) return;
  priceLoading.value = true;
  try {
    const rules = await listBillingRules();
    if (rules && rules.length > 0) {
      priceRows.value = rules.map((r) => ({ model: r.model, inP: r.input_price, outP: r.output_price }));
      priceSource.value = "db";
    } else {
      priceRows.value = Object.entries(PRICE_TABLE).map(([model, p]) => ({ model, inP: p.in, outP: p.out }));
      priceSource.value = "default";
    }
  } catch {
    priceRows.value = Object.entries(PRICE_TABLE).map(([model, p]) => ({ model, inP: p.in, outP: p.out }));
    priceSource.value = "default";
  } finally {
    priceLoading.value = false;
  }
}

function priceAddRow() {
  priceRows.value.push({ model: "", inP: 0, outP: 0 });
}

function priceRemoveRow(i: number) {
  priceRows.value.splice(i, 1);
}

async function priceSave() {
  const bad = priceRows.value.find((r) => !r.model.trim() || r.inP < 0 || r.outP < 0);
  if (bad) {
    toast("存在未命名或负数价格的条目，请修正");
    return;
  }
  priceSaving.value = true;
  try {
    for (const r of priceRows.value) {
      await upsertBillingRule(r.model.trim(), Number(r.inP), Number(r.outP));
    }
    await reloadPriceTable();
    priceSource.value = "db";
    toast(`价格表已保存（${priceRows.value.length} 条，计算即时生效）`);
  } catch (err) {
    toast(`保存失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    priceSaving.value = false;
  }
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
        <div class="field" style="margin:0;grid-column:1 / -1">
          <label class="label">思考模式 <span class="hint" style="color:var(--text-faint);font-weight:400">DeepSeek V4 默认思考、reasoning 按输出价计费且更慢</span></label>
          <label class="toggle-row">
            <input type="checkbox" v-model="cfg.thinking" />
            <span class="toggle-track"><span class="toggle-knob"></span></span>
            <span class="toggle-text">{{ cfg.thinking ? "开启（复杂推理更强，更慢更贵）" : "关闭（分析 / 生成更快更省，推荐）" }}</span>
          </label>
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
      <div class="card-title">计费价格表 <span class="hint">可维护 · db 优先</span></div>
      <div style="color:var(--text-muted);font-size:13.5px">
        每条规则按模型名匹配（包含即命中），单位：元 / 百万 token。保存在 SQLite（billing_rules），未配置时用内置默认价格。
        <span v-if="priceSource === 'db'" style="color:var(--green)">　当前：数据库价格</span>
        <span v-else style="color:var(--text-faint)">　当前：内置默认价格</span>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" @click="openPrice">{{ priceOpen ? "收起" : "编辑价格表" }}</button>
        <span style="font-size:12px;color:var(--text-faint);align-self:center">模型调价 / 新增模型在此维护，无需改代码</span>
      </div>
      <div v-if="priceOpen" class="price-panel">
        <div v-if="priceLoading" style="font-size:13px;color:var(--text-faint);padding:8px 0">加载中…</div>
        <template v-else>
          <table class="shot-table" style="margin-top:8px">
            <thead><tr><th>模型（匹配前缀）</th><th>输入价</th><th>输出价</th><th></th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in priceRows" :key="i">
                <td><input class="input" style="width:100%;padding:4px 8px" v-model="r.model" placeholder="如 deepseek-v4-flash" /></td>
                <td><input class="input" type="number" min="0" step="0.01" style="width:90px;padding:4px 8px" v-model.number="r.inP" /></td>
                <td><input class="input" type="number" min="0" step="0.01" style="width:90px;padding:4px 8px" v-model.number="r.outP" /></td>
                <td><button class="icon-btn" title="删除" @click="priceRemoveRow(i)"><svg viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg></button></td>
              </tr>
            </tbody>
          </table>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" @click="priceAddRow">+ 添加模型</button>
            <button class="btn btn-primary btn-sm" :disabled="priceSaving" @click="priceSave">{{ priceSaving ? "保存中…" : "保存价格表" }}</button>
            <span style="font-size:12px;color:var(--text-faint);align-self:center">保存后消耗统计 / 顶栏今日消耗即时按新价计算</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
