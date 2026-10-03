// AI 接入层：Vercel AI SDK v7 + OpenAI 兼容（豆包=火山方舟 /api/v3，也可接任意 OpenAI 兼容端点）
// 配置存 localStorage（仅本机浏览器存储，不入库、不入 git）；P2 起价格表迁入 billing_rules 表
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";

export interface AIConfig {
  label: string; // 显示名（消耗统计按此归组）
  baseURL: string;
  model: string; // 火山方舟：模型版本 ID 或 ep-xxx 推理接入点
  apiKey: string;
}

const CFG_KEY = "goodidea.ai.config.v1";

export const DEFAULT_CONFIG: AIConfig = {
  label: "豆包 doubao-seed-2.0-pro",
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  model: "",
  apiKey: "",
};

export function loadAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as AIConfig;
    if (!cfg.apiKey || !cfg.model) return null;
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

/** 一次性生成（全库分析用） */
export async function runGeneration(cfg: AIConfig, system: string, prompt: string) {
  const model = providerFor(cfg);
  const res = await generateText({ model, system, prompt });
  return {
    text: res.text,
    usage: res.usage,
  };
}

/** 流式生成（工作台用）：返回 streamText 结果，调用方消费 textStream */
export async function streamGeneration(cfg: AIConfig, system: string, prompt: string) {
  const model = providerFor(cfg);
  return streamText({ model, system, prompt });
}

// ---------- 计费（P1 常量价格表；P2 迁入 billing_rules 数据表） ----------

const PRICE_TABLE: Record<string, { in: number; out: number }> = {
  // 单位：元 / 百万 token；来源：官方定价页（2026-09 快照），峰谷时段/优惠可能有差异，P2 迁入 billing_rules 数据表维护
  "deepseek-v4-flash": { in: 1, out: 2 },
  "deepseek-chat": { in: 1, out: 2 }, // 旧名兼容映射（弃用后等价 v4-flash 非思考模式）
  "deepseek-v4-pro": { in: 3, out: 6 },
  "doubao-seed-2.0-pro": { in: 0.3, out: 0.6 },
  "gpt-5": { in: 2.5, out: 10 },
  "claude-sonnet-4": { in: 1.6, out: 8 },
};

export function priceFor(modelLabel: string): { in: number; out: number } {
  for (const [name, price] of Object.entries(PRICE_TABLE)) {
    if (modelLabel.includes(name)) return price;
  }
  return { in: 0, out: 0 }; // 未收录模型默认免费显示，P2 由价格表接管
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
