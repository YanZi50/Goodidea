// AI 接入层：Vercel AI SDK v7 + OpenAI 兼容（豆包=火山方舟 /api/v3，也可接任意 OpenAI 兼容端点）
// 配置存 localStorage（仅本机浏览器存储，不入库、不入 git）；P2 起价格表迁入 billing_rules 表
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { listBillingRules } from "./db";

export interface AIConfig {
  label: string; // 显示名（消耗统计按此归组）
  baseURL: string;
  model: string; // 火山方舟：模型版本 ID 或 ep-xxx 推理接入点
  apiKey: string;
  thinking?: boolean; // 思考模式开关（DeepSeek v4 默认思考、reasoning 按输出价计费且偏慢；默认关闭更快更省）
}

const CFG_KEY = "goodidea.ai.config.v1";

export const DEFAULT_CONFIG: AIConfig = {
  label: "豆包 doubao-seed-2.0-pro",
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  model: "",
  apiKey: "",
  thinking: false,
};

export function loadAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as AIConfig;
    if (!cfg.apiKey || !cfg.model) return null;
    cfg.thinking = cfg.thinking ?? false; // 旧配置无此字段 → 默认关闭思考
    return cfg;
  } catch {
    return null;
  }
}

export function saveAIConfig(cfg: AIConfig): void {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

export function clearAIConfig(): void {
  localStorage.removeItem(CFG_KEY);
}

function providerFor(cfg: AIConfig) {
  return createOpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
  }).chat(cfg.model);
}

export class AINotConfiguredError extends Error {
  constructor() {
    super("尚未配置模型（设置 → 模型接入，填入 API Key 与模型 ID）");
    this.name = "AINotConfiguredError";
  }
}

/**
 * 思考模式 → providerOptions 透传（DeepSeek V4 Chat Completions 支持 reasoning_effort=none 关闭思考，
 * low/high/max 控制强度；仅对 deepseek 模型生效，其他兼容端点不传以免未知参数破坏兼容性）
 */
function thinkingOptions(cfg: AIConfig): { reasoningEffort?: "none" | "high" } {
  if (!cfg.model.toLowerCase().includes("deepseek")) return {};
  return { reasoningEffort: cfg.thinking ? "high" : "none" };
}

/** 一次性生成（全库分析用） */
export async function runGeneration(cfg: AIConfig, system: string, prompt: string) {
  const model = providerFor(cfg);
  const res = await generateText({ model, system, prompt, providerOptions: { openai: thinkingOptions(cfg) } });
  return {
    text: res.text,
    usage: res.usage,
  };
}

/** 流式生成（工作台用）：返回 streamText 结果，调用方消费 textStream */
export async function streamGeneration(cfg: AIConfig, system: string, prompt: string) {
  const model = providerFor(cfg);
  return streamText({ model, system, prompt, providerOptions: { openai: thinkingOptions(cfg) } });
}

// ---------- 计费（默认常量价格表；设置页可维护，db 优先覆盖） ----------

export const PRICE_TABLE: Record<string, { in: number; out: number }> = {
  // 单位：元 / 百万 token；来源：官方定价页（2026-09 快照），峰谷时段/优惠可能有差异；设置页「价格表」可维护（billing_rules）
  // 注意：deepseek-v4 思考模式下 reasoning tokens 计入输出 token，按输出价计费（输出偏贵）；关闭思考更省
  "deepseek-v4-flash": { in: 1, out: 2 },
  "deepseek-chat": { in: 1, out: 2 }, // 旧名兼容映射（弃用后等价 v4-flash 非思考模式）
  "deepseek-v4-pro": { in: 3, out: 6 },
  "doubao-seed-2.0-pro": { in: 0.3, out: 0.6 },
  "gpt-5": { in: 2.5, out: 10 },
  "claude-sonnet-4": { in: 1.6, out: 8 },
};

// 动态价格表：db（billing_rules）加载后覆盖常量；未加载时用常量
let dynamicPrice: Record<string, { in: number; out: number }> | null = null;

/** 从 db 重载价格表（设置页保存后 / 应用启动时调用；web 预览或 db 不可用时回退常量） */
export async function reloadPriceTable(): Promise<void> {
  try {
    const rules = await listBillingRules();
    if (rules === null) {
      dynamicPrice = null;
      return;
    }
    dynamicPrice = {};
    for (const r of rules) dynamicPrice[r.model] = { in: r.input_price, out: r.output_price };
  } catch {
    dynamicPrice = null;
  }
}

/** 当前生效的价格表（db 优先，常量兜底） */
export function currentPriceTable(): Record<string, { in: number; out: number }> {
  return dynamicPrice ?? PRICE_TABLE;
}

export function priceFor(modelLabel: string): { in: number; out: number } {
  const table = currentPriceTable();
  for (const [name, price] of Object.entries(table)) {
    if (modelLabel.includes(name)) return price;
  }
  return { in: 0, out: 0 }; // 未收录模型默认免费显示
}

export interface CostResult {
  amount: number; // 元
  inputTokens: number;
  outputTokens: number;
}

export function calcCost(modelLabel: string, usage: { inputTokens?: number; outputTokens?: number }): CostResult {
  const price = priceFor(modelLabel);
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const amount = (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out;
  return { amount, inputTokens, outputTokens };
}

// ---------- 消耗持久化（localStorage：当日累计 + 按模型 + 近 30 日） ----------

const TODAY_KEY = () => `goodidea.cost.day.${new Date().toISOString().slice(0, 10)}`;
const BY_MODEL_KEY = "goodidea.cost.byModel.v1";
const HISTORY_KEY = "goodidea.cost.history.v1";

export function addCost(modelLabel: string, amount: number): void {
  // 当日累计
  const day = Number(localStorage.getItem(TODAY_KEY()) ?? "0");
  localStorage.setItem(TODAY_KEY(), String(day + amount));
  // 按模型
  try {
    const byModel = JSON.parse(localStorage.getItem(BY_MODEL_KEY) ?? "{}") as Record<string, number>;
    byModel[modelLabel] = (byModel[modelLabel] ?? 0) + amount;
    localStorage.setItem(BY_MODEL_KEY, JSON.stringify(byModel));
  } catch {
    /* ignore */
  }
  // 历史（date -> amount，滚动 30 天）
  try {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}") as Record<string, number>;
    const today = new Date().toISOString().slice(0, 10);
    hist[today] = (hist[today] ?? 0) + amount;
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    for (const k of Object.keys(hist)) if (k < cutoff) delete hist[k];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  } catch {
    /* ignore */
  }
}

export function todayCost(): number {
  return Number(localStorage.getItem(TODAY_KEY()) ?? "0");
}

export function costByModel(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BY_MODEL_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/** 近 n 日逐日消耗（缺日补 0），返回 [{date, v}] */
export function costHistory(days = 7): Array<{ date: string; v: number }> {
  try {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}") as Record<string, number>;
    const out: Array<{ date: string; v: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      out.push({ date: d.slice(5), v: hist[d] ?? 0 });
    }
    return out;
  } catch {
    return Array.from({ length: days }, () => ({ date: "", v: 0 }));
  }
}
