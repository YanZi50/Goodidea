// 实时热点数据层：多源热榜 API 封装 + 奢侈品回收行业关键词标记
// 主源：60s.viki.moe（免费开源 60s-api，本机网络实测可达）；备源：vvhan（DNS 在本机网络不可达，保留兜底）
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauriRuntime } from "./db";

export type HotItem = {
  rank: number;
  title: string;
  hot: string;
  url: string;
  /** 是否命中行业关键词 */
  related: boolean;
  /** 命中的关键词（用于展示标签） */
  hit: string;
};

/** 奢侈品回收行业相关关键词（杭州名表/包袋回收业务） */
export const INDUSTRY_KEYWORDS = [
  "名表", "手表", "腕表", "劳力士", "爱马仕", "香奈儿", "LV", "路易威登",
  "古驰", "宝格丽", "卡地亚", "包袋", "包包", "奢侈品", "二手", "回收",
  "典当", "闲置", "成色", "鉴定", "公价", "专柜", "铂金包", "老花",
];

export const SOURCES = [
  { id: "douyinHot", label: "抖音热榜" },
  { id: "weiboHot", label: "微博热搜" },
  { id: "zhihuHot", label: "知乎热榜" },
  { id: "toutiaoHot", label: "头条热榜" },
];

/** 平台 → 各源 API 端点（60s 主源；vvhan 兜底） */
const SOURCE_ENDPOINTS: Record<string, { s60: string; vvhan?: string }> = {
  douyinHot: { s60: "douyin", vvhan: "douyinHot" },
  weiboHot: { s60: "weibo", vvhan: "weiboHot" },
  zhihuHot: { s60: "zhihu", vvhan: "zhihuHot" },
  toutiaoHot: { s60: "toutiao", vvhan: "baiduHot" },
};

function formatHot(hot: unknown): string {
  const n = typeof hot === "number" ? hot : Number(String(hot).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return String(hot ?? "");
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万";
  return String(Math.round(n));
}

/** 统一为 HotItem[]；60s 与 vvhan 字段差异在此归一 */
function normalize(items: Array<Record<string, unknown>>): HotItem[] {
  return items
    .filter((it) => it && it.title)
    .map((it, i) => {
      const title = String(it.title);
      const hit = INDUSTRY_KEYWORDS.find((k) => title.includes(k)) ?? "";
      const rawHot = it.hot_value ?? it.hot_value_desc ?? it.hot ?? it.index;
      return {
        rank: Number(it.index ?? i + 1),
        title,
        hot: formatHot(rawHot),
        url: String(it.link ?? it.url ?? ""),
        related: hit !== "",
        hit,
      };
    });
}

/** 抓取指定源热榜：60s 主源 → vvhan 兜底；Tauri 走插件 fetch 绕过 CORS，预览环境原生 fetch */
export async function fetchHotlist(source: string): Promise<HotItem[]> {
  const ep = SOURCE_ENDPOINTS[source];
  if (!ep) throw new Error(`未知热榜源 ${source}`);
  const fetcher = (url: string) => (isTauriRuntime() ? tauriFetch(url) : fetch(url));

  // 主源 60s
  try {
    const res = await fetcher(`https://60s.viki.moe/v2/${ep.s60}`);
    if (!res.ok) throw new Error(`60s 热榜 ${res.status}`);
    const json = (await res.json()) as { code?: number; data?: Array<Record<string, unknown>> };
    if (json.code !== 200 || !Array.isArray(json.data) || json.data.length === 0) throw new Error("60s 热榜数据为空");
    return normalize(json.data);
  } catch (err) {
    // 兜底 vvhan（原主源；网络恢复时自动可用）
    if (ep.vvhan) {
      const res = await fetcher(`https://api.vvhan.com/api/hotlist/${ep.vvhan}`);
      if (!res.ok) throw new Error(`热榜接口 ${res.status}`);
      const json = (await res.json()) as { success?: boolean; code?: number; data?: Array<Record<string, unknown>> };
      const list = json.data ?? [];
      if (!Array.isArray(list) || list.length === 0) throw new Error("热榜数据为空");
      return normalize(list);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}
