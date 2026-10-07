// 实时热点数据层：多源热榜 API 封装 + 行业关键词标记（关键词来自设置页可配置，默认奢侈品回收词表）
// 主源：60s.viki.moe（免费开源 60s-api，实测本机可达但部分平台偶发超时）；
// 镜像：官方「公共实例列表」实测可达的两个实例（同协议同格式）；兜底：vvhan（DNS 本机不可达，保留网络恢复后自动可用）
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauriRuntime, DEFAULT_HOT_KEYWORDS } from "./db";

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

export const SOURCES = [
  { id: "douyinHot", label: "抖音热榜" },
  { id: "weiboHot", label: "微博热搜" },
  { id: "zhihuHot", label: "知乎热榜" },
  { id: "toutiaoHot", label: "头条热榜" },
];

/** 60s 协议源（主源 + 镜像，响应格式一致：{code:200,data:[{title,hot_value,link}]}） */
const S60_PRIMARY = "https://60s.viki.moe";
const S60_MIRRORS = ["https://api.cczo.cc/60s", "https://60s.mizhoubaobei.top"];

/** 平台 → 各源 API 端点（60s 主源 → 镜像 → vvhan 兜底） */
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

/** 统一为 HotItem[]；60s 与 vvhan 字段差异在此归一；keywords 来自设置页（默认奢侈品词表） */
function normalize(items: Array<Record<string, unknown>>, keywords: string[]): HotItem[] {
  return items
    .filter((it) => it && it.title)
    .map((it, i) => {
      const title = String(it.title);
      const hit = keywords.find((k) => title.includes(k)) ?? "";
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

/** 抓取指定源热榜：60s 主源 → 60s 镜像（多级） → vvhan 兜底；Tauri 走插件 fetch 绕过 CORS，预览环境原生 fetch；
 *  keywords 行业关键词（设置页可配），用于命中高亮 */
export async function fetchHotlist(source: string, keywords: string[] = DEFAULT_HOT_KEYWORDS): Promise<HotItem[]> {
  const ep = SOURCE_ENDPOINTS[source];
  if (!ep) throw new Error(`未知热榜源 ${source}`);
  const fetcher = (url: string) => (isTauriRuntime() ? tauriFetch(url) : fetch(url));

  // 60s 协议：主源 + 镜像逐个尝试（同格式，normalize 复用）
  const tryS60 = async (base: string) => {
    const res = await fetcher(`${base}/v2/${ep.s60}`);
    if (!res.ok) throw new Error(`热榜接口 ${res.status}`);
    const json = (await res.json()) as { code?: number; data?: Array<Record<string, unknown>> };
    if (json.code !== 200 || !Array.isArray(json.data) || json.data.length === 0) throw new Error("热榜数据为空");
    return normalize(json.data, keywords);
  };

  let lastErr: unknown = null;
  for (const base of [S60_PRIMARY, ...S60_MIRRORS]) {
    try {
      return await tryS60(base);
    } catch (err) {
      lastErr = err;
    }
  }

  // 兜底 vvhan（格式不同但 normalize 兼容；网络恢复时自动可用）
  if (ep.vvhan) {
    try {
      const res = await fetcher(`https://api.vvhan.com/api/hotlist/${ep.vvhan}`);
      if (!res.ok) throw new Error(`热榜接口 ${res.status}`);
      const json = (await res.json()) as { success?: boolean; code?: number; data?: Array<Record<string, unknown>> };
      const list = json.data ?? [];
      if (!Array.isArray(list) || list.length === 0) throw new Error("热榜数据为空");
      return normalize(list, keywords);
    } catch {
      // 主源、镜像与备用源均失败：把底层网络错误（reqwest/浏览器）收敛为友好提示，不向用户展示 URL 等技术细节
      throw new Error("热榜接口暂不可用（主源与备用源均请求失败），请检查网络后点「刷新」，或手动添加话题兜底");
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
