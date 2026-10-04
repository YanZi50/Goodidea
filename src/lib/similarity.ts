// 本地文案查重：字符 bigram Jaccard 相似度（无外部依赖、不消耗模型 token）
// 适用场景：生成的口播/种草文案与知识库素材、历史生成内容比对，预判平台同质判重风险。

/** 文本 → 字符 n-gram 集合（默认 bigram；先去除空白，聚焦内容词序） */
export function ngrams(text: string, n = 2): Set<string> {
  const clean = text.replace(/\s+/g, "");
  const set = new Set<string>();
  if (clean.length === 0) return set;
  if (clean.length < n) {
    set.add(clean);
    return set;
  }
  for (let i = 0; i <= clean.length - n; i++) set.add(clean.slice(i, i + n));
  return set;
}

/** Jaccard 相似度：|A∩B| / |A∪B|，取值 [0,1] */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface DupCandidate {
  source: string; // 文档文件名 / 历史标题
  kind: "doc" | "history";
  content: string;
}

export interface DupHit {
  source: string;
  kind: "doc" | "history";
  score: number; // 0-1
  level: "high" | "mid" | "low";
  snippet: string;
}

/** 阈值口径：≥0.50 高危（雷同风险大，建议改写）；≥0.35 中危（关键句可能撞车）；≥0.25 低危（仅供参考） */
export function checkDuplicates(text: string, candidates: DupCandidate[]): DupHit[] {
  if (!text.trim() || candidates.length === 0) return [];
  const a = ngrams(text);
  const hits: DupHit[] = [];
  for (const c of candidates) {
    if (c.content.length < 40) continue; // 太短无统计意义
    const s = jaccard(a, ngrams(c.content));
    if (s < 0.25) continue;
    hits.push({
      source: c.source,
      kind: c.kind,
      score: s,
      level: s >= 0.5 ? "high" : s >= 0.35 ? "mid" : "low",
      snippet: c.content.slice(0, 120) + (c.content.length > 120 ? "…" : ""),
    });
  }
  hits.sort((x, y) => y.score - x.score);
  return hits.slice(0, 8);
}
