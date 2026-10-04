// 迷你数据总线：视图间数据变更通知（无 pinia 依赖）
// 文档库等数据源变更（建组/删组/移组/导入/删除）后 emit，分析页等消费方注册监听并刷新自身视图
type Handler = () => void;
const handlers = new Set<Handler>();

/** 注册数据变更监听，返回取消注册函数 */
export function onDataChanged(h: Handler): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}

/** 广播数据已变更 */
export function emitDataChanged(): void {
  for (const h of [...handlers]) h();
}

// ---- 单篇分析请求（文档库行内「分析」→ 分析页） ----
type DocRequestHandler = (docId: number) => void;
const docRequestHandlers = new Set<DocRequestHandler>();

export function onAnalyzeDocRequest(h: DocRequestHandler): () => void {
  docRequestHandlers.add(h);
  return () => docRequestHandlers.delete(h);
}

export function emitAnalyzeDocRequest(docId: number): void {
  for (const h of [...docRequestHandlers]) h(docId);
}

// ---- 热点接入生成工作台（热点页条目 → 生成页热点参考） ----
type HotspotHandler = (topic: string) => void;
const hotspotHandlers = new Set<HotspotHandler>();

export function onUseHotspot(h: HotspotHandler): () => void {
  hotspotHandlers.add(h);
  return () => hotspotHandlers.delete(h);
}

export function emitUseHotspot(topic: string): void {
  for (const h of [...hotspotHandlers]) h(topic);
}

// ---- 模型档案切换（顶栏下拉 → 设置页/各面板即时刷新） ----
const modelHandlers = new Set<Handler>();

export function onModelSwitched(h: Handler): () => void {
  modelHandlers.add(h);
  return () => modelHandlers.delete(h);
}

export function emitModelSwitched(): void {
  for (const h of [...modelHandlers]) h();
}
