// 实时热点数据层：多源热榜 API 封装 + 奢侈品回收行业关键词标记
// 主源：vvhan（免费、无需 key）；备用源域名已在 capabilities http:default 白名单，后续按需接入
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
  { id: "baiduHot", label: "百度热点" },
];

function formatHot(hot: unknown): string {
  const n = typeof hot === "number" ? hot : Number(String(hot).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return String(hot ?? "");
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万";
  return String(Math.round(n));
}

/** 抓取指定源热榜（Tauri 运行时走插件 fetch 绕过 CORS，预览环境降级原生 fetch） */
export async function fetchHotlist(source: string): Promise<HotItem[]> {
  const url = `https://api.vvhan.com/api/hotlist/${source}`;
  const res = await (isTauriRuntime() ? tauriFetch(url) : fetch(url));
  if (!res.ok) throw new Error(`热榜接口 ${res.status}`);
  const json = (await res.json()) as { success?: boolean; code?: number; data?: Array<{ index?: number; title?: string; hot?: unknown; url?: string }> };
  const list = json.data ?? [];
  if (!Array.isArray(list) || list.length === 0) throw new Error("热榜数据为空");
  return list
    .filter((it) => it && it.title)
    .map((it, i) => {
      const hit = INDUSTRY_KEYWORDS.find((k) => it.title!.includes(k)) ?? "";
      return {
        rank: it.index ?? i + 1,
        title: it.title!,
        hot: formatHot(it.hot),
        url: it.url ?? "",
        related: hit !== "",
        hit,
      };
    });
}
