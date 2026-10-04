<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  dbStatus,
  listBillingRules,
  upsertBillingRule,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  setActiveProfile,
  migrateLegacyConfig,
  importBackupData,
  isTauriRuntime,
  loadIndustryContext,
  setAppSetting,
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  type AIProfile,
  type BackupPayload,
  type SkillRow,
} from "../lib/db";
import { emitDataChanged, onModelSwitched } from "../lib/bus";
import { PRICE_TABLE, reloadPriceTable, testConnection } from "../lib/ai";

const toast = inject("toast") as (msg: string) => void;

// ---- 生成偏好（行业背景，v6 app_settings） ----
const industry = ref("");
const industryLoaded = ref(false);
const industrySaved = ref(false);

async function loadIndustry() {
  industry.value = await loadIndustryContext();
  industryLoaded.value = true;
}
/** 恢复默认：清空自定义，回退内置文案 */
async function resetIndustry() {
  industry.value = "";
  await setAppSetting("industry_context", "");
  toast("已恢复默认行业背景");
}

// ---- 风格模板（skills，v7）：名称 + 指令全文，生成时注入 ----
const skills = ref<SkillRow[]>([]);
const skillForm = ref<{ name: string; instruction: string } | null>(null);
const skillEditId = ref<number | null>(null);
const skillDelId = ref<number | null>(null);

async function loadSkills() {
  const rows = await listSkills();
  if (rows) skills.value = rows;
}
function skillStartNew() {
  skillEditId.value = null;
  skillForm.value = { name: "", instruction: "" };
}
function skillStartEdit(s: SkillRow) {
  skillEditId.value = s.id;
  skillForm.value = { name: s.name, instruction: s.instruction };
}
function skillCancel() {
  skillForm.value = null;
}
async function skillSave() {
  if (!skillForm.value) return;
  const f = skillForm.value;
  if (!f.name.trim() || !f.instruction.trim()) {
    toast("名称与指令内容不能为空");
    return;
  }
  if (skillEditId.value === null) {
    await createSkill({ name: f.name.trim(), instruction: f.instruction.trim() });
    toast(`已新增风格模板「${f.name.trim()}」`);
  } else {
    await updateSkill(skillEditId.value, { name: f.name.trim(), instruction: f.instruction.trim() });
    toast(`已保存「${f.name.trim()}」`);
  }
  skillForm.value = null;
  await loadSkills();
}
async function skillDelete(s: SkillRow) {
  if (skillDelId.value !== s.id) {
    skillDelId.value = s.id;
    setTimeout(() => (skillDelId.value = null), 3000);
    return;
  }
  await deleteSkill(s.id);
  skillDelId.value = null;
  toast(`已删除「${s.name}」`);
  await loadSkills();
}
async function saveIndustry() {
  await setAppSetting("industry_context", industry.value.trim());
  industrySaved.value = true;
  setTimeout(() => (industrySaved.value = false), 2000);
  toast("行业背景已保存，下次生成/分析生效");
}

// ---- 数据存储状态 ----
const status = ref<{ connected: boolean; tables: string[]; documents: number; error?: string }>({
  connected: false,
  tables: [],
  documents: 0,
});
const checking = ref(true);

onMounted(async () => {
  status.value = await dbStatus();
  checking.value = false;
  await migrateLegacyConfig(); // 旧单配置首次升级为档案
  await loadProfiles();
  await loadIndustry();
  await loadSkills();
  offModelSwitched = onModelSwitched(() => {
    // 顶栏切换模型后即时刷新，无需手动刷新
    void loadProfiles();
  });
});

let offModelSwitched: (() => void) | null = null;
onUnmounted(() => {
  offModelSwitched?.();
});

// ---- 模型档案 ----
const profiles = ref<AIProfile[]>([]);
const loading = ref(false);
const editId = ref<number | "new" | null>(null); // 正在编辑的档案 id（"new"=新增草稿）
const confirmDel = ref<number | null>(null); // 待确认删除的 id（二次确认）
const testingId = ref<number | null>(null); // 正在测试连接的档案 id

/** 测试档案连通性：真实发一条最小请求，绿色不代表已联通 */
async function testProfile(p: AIProfile) {
  testingId.value = p.id;
  try {
    const r = await testConnection({
      label: p.label,
      baseURL: p.base_url,
      model: p.model,
      apiKey: p.api_key,
      thinking: p.thinking === 1,
    });
    if (r.ok) {
      toast(`连接成功 · ${r.latencyMs}ms（${p.model}）`);
    } else {
      toast(`连接失败：${r.detail.slice(0, 120)}`);
    }
  } catch (err) {
    toast(`测试异常：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    testingId.value = null;
  }
}

interface EditForm {
  label: string;
  base_url: string;
  model: string;
  api_key: string; // 编辑已有档案时留空 = 保留原 key
  thinking: boolean;
}

const form = ref<EditForm>({ label: "", base_url: "", model: "", api_key: "", thinking: false });

const DEFAULT_BASE = "https://ark.cn-beijing.volces.com/api/v3";

function maskKey(k: string): string {
  if (!k) return "未填写";
  return k.length <= 8 ? "sk-****" : `sk-****${k.slice(-4)}`;
}

async function loadProfiles() {
  loading.value = true;
  try {
    const list = await listProfiles();
    profiles.value = list ?? [];
  } catch {
    profiles.value = [];
  } finally {
    loading.value = false;
  }
}

// ---- 备份还原（数据存储卡片） ----
const restoring = ref(false);

async function restoreBackup() {
  if (!isTauriRuntime()) {
    toast("备份还原需在桌面应用内使用");
    return;
  }
  const path = await open({
    title: "选择 Goodidea 备份文件",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return;
  try {
    const content = await invoke<string>("read_backup", { path });
    const data = JSON.parse(content.replace(/^\uFEFF/, "")) as BackupPayload; // 容错 BOM
    if (!data || data.app !== "goodidea") {
      toast("不是有效的 Goodidea 备份文件");
      return;
    }
    restoring.value = true;
    const r = await importBackupData(data);
    if (!r) {
      toast("还原失败（数据库未响应，请重试）");
      return;
    }
    emitDataChanged(); // 文档库等面板即时刷新
    status.value = await dbStatus(); // 本页文档数即时更新，无需手动刷新
    toast(`已还原：${r.documents} 篇文档 / ${r.chunks} 块 / ${r.groups} 个分组 / ${r.rules} 条价格`);
  } catch (err) {
    toast(`还原失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    restoring.value = false;
  }
}

function startEdit(p: AIProfile) {
  editId.value = p.id;
  form.value = {
    label: p.label,
    base_url: p.base_url,
    model: p.model,
    api_key: "", // 留空=保留原 key
    thinking: p.thinking === 1,
  };
}

function startNew() {
  editId.value = "new";
  form.value = { label: "自定义模型", base_url: DEFAULT_BASE, model: "", api_key: "", thinking: false };
}

function cancelEdit() {
  editId.value = null;
}

async function saveEdit() {
  const f = form.value;
  if (!f.label.trim()) { toast("显示名不能为空"); return; }
  if (!f.model.trim()) { toast("模型 ID 不能为空"); return; }
  if (!f.base_url.trim()) { toast("API Base URL 不能为空"); return; }
  if (editId.value === "new") {
    if (!f.api_key.trim()) { toast("API Key 不能为空"); return; }
    await createProfile({ label: f.label.trim(), base_url: f.base_url.trim(), model: f.model.trim(), api_key: f.api_key.trim(), thinking: f.thinking });
    toast("已新增模型档案" + (profiles.value.length === 0 ? "（首份档案已自动设为当前）" : ""));
  } else if (editId.value !== null) {
    const patch: Parameters<typeof updateProfile>[1] = { label: f.label.trim(), base_url: f.base_url.trim(), model: f.model.trim(), thinking: f.thinking };
    if (f.api_key.trim()) patch.api_key = f.api_key.trim(); // 留空保留原 key
    await updateProfile(editId.value, patch);
    toast("已保存模型档案");
  }
  editId.value = null;
  await loadProfiles();
}

async function makeActive(p: AIProfile) {
  await setActiveProfile(p.id);
  await loadProfiles();
  toast(`已切换当前模型：${p.label}`);
}

async function removeProfile(p: AIProfile) {
  if (confirmDel.value !== p.id) {
    confirmDel.value = p.id;
    window.setTimeout(() => { if (confirmDel.value === p.id) confirmDel.value = null; }, 3000);
    return;
  }
  confirmDel.value = null;
  await deleteProfile(p.id);
  await loadProfiles();
  toast(`已删除档案「${p.label}」` + (p.is_active === 1 && profiles.value.length > 0 ? "，当前模型已自动切换" : ""));
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
      <div class="card-title">模型接入 <span class="hint">多档案 · 一键切换</span></div>
      <div style="color:var(--text-muted);font-size:13.5px">
        可接入多份模型档案（豆包 / DeepSeek / 任意 OpenAI 兼容端点），顶部下拉一键切换当前模型。
        密钥仅存本机 SQLite，不入库、不进 git。每份档案可点「测试」验证真实连通。
        <span v-if="profiles.some((p) => p.is_active === 1)" style="color:var(--green)">　当前已配置 ✓</span>
        <span v-else style="color:var(--red)">　未配置</span>
      </div>

      <div v-if="loading" style="font-size:13px;color:var(--text-faint);padding:10px 0">加载中…</div>

      <div v-else-if="profiles.length > 0" class="profile-list">
        <div v-for="p in profiles" :key="p.id" class="profile-card" :class="{ active: p.is_active === 1 }">
          <template v-if="editId === p.id">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="field" style="margin:0">
                <label class="label">显示名</label>
                <input class="input" v-model="form.label" placeholder="如：DeepSeek v4-flash" />
              </div>
              <div class="field" style="margin:0">
                <label class="label">模型 ID</label>
                <input class="input" v-model="form.model" placeholder="如 deepseek-v4-flash" />
              </div>
              <div class="field" style="margin:0;grid-column:1 / -1">
                <label class="label">API Base URL</label>
                <input class="input" v-model="form.base_url" />
              </div>
              <div class="field" style="margin:0;grid-column:1 / -1">
                <label class="label">API Key <span class="hint" style="color:var(--text-faint);font-weight:400">留空 = 保留原密钥（已脱敏 {{ maskKey(p.api_key) }}）</span></label>
                <input class="input" v-model="form.api_key" type="password" placeholder="留空则保留原 Key，填了则覆盖" />
              </div>
              <div class="field" style="margin:0;grid-column:1 / -1">
                <label class="toggle-row">
                  <input type="checkbox" v-model="form.thinking" />
                  <span class="toggle-track"><span class="toggle-knob"></span></span>
                  <span class="toggle-text">{{ form.thinking ? "思考模式开启（复杂推理更强，更慢更贵）" : "思考模式关闭（更快更省，推荐）" }}</span>
                </label>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary btn-sm" @click="saveEdit">保存</button>
              <button class="btn btn-ghost btn-sm" @click="cancelEdit">取消</button>
            </div>
          </template>

          <template v-else>
            <div class="profile-main">
              <div class="profile-info">
                <div class="profile-title">
                  <b>{{ p.label }}</b>
                  <span v-if="p.is_active === 1" class="tag gold">当前</span>
                  <span class="profile-thinking">{{ p.thinking === 1 ? "思考开" : "思考关" }}</span>
                </div>
                <div class="profile-meta">
                  <span class="pm">{{ p.model }}</span>
                  <span class="pm faint" :title="p.base_url">{{ p.base_url }}</span>
                  <span class="pm faint">{{ maskKey(p.api_key) }}</span>
                </div>
              </div>
              <div class="profile-ops">
                <button v-if="p.is_active !== 1" class="btn btn-soft btn-sm" @click="makeActive(p)">设为当前</button>
                <button class="btn btn-ghost btn-sm" :disabled="testingId === p.id" @click="testProfile(p)">{{ testingId === p.id ? "测试中…" : "测试" }}</button>
                <button class="btn btn-ghost btn-sm" @click="startEdit(p)">编辑</button>
                <button class="btn btn-ghost btn-sm danger" @click="removeProfile(p)">
                  {{ confirmDel === p.id ? "确认删除？" : "删除" }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div v-else class="profile-empty">
        <div style="color:var(--text-muted);font-size:13.5px">还没有模型档案——添加第一份即自动设为当前模型。</div>
      </div>

      <template v-if="editId === 'new'">
        <div class="profile-card" style="border-color:var(--accent)">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="field" style="margin:0">
              <label class="label">显示名</label>
              <input class="input" v-model="form.label" placeholder="如：DeepSeek v4-flash" />
            </div>
            <div class="field" style="margin:0">
              <label class="label">模型 ID</label>
              <input class="input" v-model="form.model" placeholder="如 deepseek-v4-flash" />
            </div>
            <div class="field" style="margin:0;grid-column:1 / -1">
              <label class="label">API Base URL</label>
              <input class="input" v-model="form.base_url" />
            </div>
            <div class="field" style="margin:0;grid-column:1 / -1">
              <label class="label">API Key</label>
              <input class="input" v-model="form.api_key" type="password" placeholder="sk-…（仅存本机 SQLite）" />
            </div>
            <div class="field" style="margin:0;grid-column:1 / -1">
              <label class="toggle-row">
                <input type="checkbox" v-model="form.thinking" />
                <span class="toggle-track"><span class="toggle-knob"></span></span>
                <span class="toggle-text">{{ form.thinking ? "思考模式开启（复杂推理更强，更慢更贵）" : "思考模式关闭（更快更省，推荐）" }}</span>
              </label>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary btn-sm" @click="saveEdit">保存</button>
            <button class="btn btn-ghost btn-sm" @click="cancelEdit">取消</button>
          </div>
        </div>
      </template>

      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" @click="startNew">+ 新增模型</button>
        <span style="font-size:12px;color:var(--text-faint);align-self:center">顶部下拉可直接切换当前模型，消耗统计按档案自动分组</span>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-title">生成偏好 <span class="hint">行业背景 · 全链路生效</span></div>
      <div style="color:var(--text-muted);font-size:13.5px">
        智能分析与生成工作台以「行业背景」作为模型的角色设定。换行业/品类只改这里，无需改代码——
        例如做 3C 数码、家居好物等其它类目的脚本，替换下面描述即可。
      </div>
      <div class="field" style="margin-top:10px">
        <label class="label">行业/服务背景（生成与分析的默认角色）</label>
        <textarea class="textarea" v-model="industry" rows="4" placeholder="例：我从事奢侈品回收行业（名表、包袋等全品类），主打高价回收、先打款后收货……"></textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-primary btn-sm" @click="saveIndustry">{{ industrySaved ? "已保存 ✓" : "保存行业背景" }}</button>
        <button class="btn btn-ghost btn-sm" @click="resetIndustry">恢复默认</button>
        <span style="font-size:12px;color:var(--text-faint);align-self:center" v-if="industryLoaded && !industry">当前为内置默认文案</span>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-title">风格模板 <span class="hint">Skills · 增删改 · 生成时注入指令全文</span></div>
      <div style="color:var(--text-muted);font-size:13.5px">
        生成工作台的「风格模板」多选来自这里。每个模板 = 名称 + 指令内容（模型创作时遵循的风格要求）。
        内置 4 个可修改/删除，也可新增自己的模板（如「3C 数码测评」「家居好物种草」）。
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
        <div v-for="s in skills" :key="s.id" class="profile-card" style="padding:10px 12px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <b style="font-size:13.5px">{{ s.name }}</b>
            <span class="tag blue" style="font-size:11px">内置可编辑</span>
            <div style="flex:1;min-width:200px;font-size:12px;color:var(--text-muted);line-height:1.5">{{ s.instruction.slice(0, 120) }}{{ s.instruction.length > 120 ? "…" : "" }}</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" @click="skillStartEdit(s)">编辑</button>
              <button class="btn btn-ghost btn-sm danger" @click="skillDelete(s)">{{ skillDelId === s.id ? "确认删除？" : "删除" }}</button>
            </div>
          </div>
        </div>
        <div v-if="skills.length === 0" style="color:var(--text-faint);font-size:13px;padding:4px 0">
          暂无风格模板 — 点击下方「+ 新增模板」创建
        </div>
      </div>

      <template v-if="skillForm">
        <div class="profile-card" style="border-color:var(--accent);margin-top:10px">
          <div class="field" style="margin:0">
            <label class="label">模板名称</label>
            <input class="input" v-model="skillForm.name" placeholder="如：3C 数码测评" />
          </div>
          <div class="field" style="margin:8px 0 0">
            <label class="label">指令内容 <span class="hint" style="color:var(--text-faint);font-weight:400">生成时整段注入提示词，模型据此创作</span></label>
            <textarea class="textarea" v-model="skillForm.instruction" rows="4" placeholder="描述该风格的创作要求：结构、语气、节奏、禁忌……"></textarea>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary btn-sm" @click="skillSave">保存模板</button>
            <button class="btn btn-ghost btn-sm" @click="skillCancel">取消</button>
          </div>
        </div>
      </template>

      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" @click="skillStartNew">+ 新增模板</button>
        <span style="font-size:12px;color:var(--text-faint);align-self:center">删除后生成工作台 chips 同步消失；草稿/历史里的旧名自动忽略</span>
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
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" @click="restoreBackup" :disabled="restoring">{{ restoring ? "还原中…" : "还原备份" }}</button>
        <span style="font-size:12px;color:var(--text-faint);align-self:center">左侧「导出」可全量备份；还原会覆盖文档/分组/价格表（模型档案保留不动）</span>
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

<style scoped>
.profile-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.profile-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  padding: 12px 14px;
}
.profile-card.active { border-color: var(--accent); background: linear-gradient(180deg, var(--accent-soft), transparent 60%), var(--surface-2); }
.profile-main { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.profile-info { flex: 1; min-width: 220px; }
.profile-title { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.profile-thinking { font-size: 11.5px; color: var(--text-faint); border: 1px solid var(--border); border-radius: 5px; padding: 0 6px; }
.profile-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 5px; font-size: 12.5px; }
.pm { color: var(--text-muted); }
.pm.faint { color: var(--text-faint); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-ops { display: flex; gap: 8px; align-items: center; }
.btn.danger { color: var(--red); border-color: rgba(229, 115, 110, .35); }
.btn.danger:hover { background: rgba(229, 115, 110, .12); }
.profile-empty { margin-top: 12px; padding: 14px; border: 1px dashed var(--border-strong); border-radius: var(--radius); }
</style>
