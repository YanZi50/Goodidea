// 生成后自动校验：本地规则（不消耗模型 token、不联网），生成完成即时提示风险点
// 定位：辅助人工检查，不阻断使用；所有结论可复核。

export interface ValCheck {
  ok: boolean;
  label: string;
  detail: string;
}

/** 对生成文本跑一遍本地校验清单 */
export function validateOutput(text: string): ValCheck[] {
  const clean = text.replace(/\s+/g, "");
  const res: ValCheck[] = [];

  // 1. 内容长度
  if (clean.length < 50) {
    res.push({ ok: false, label: "内容过短", detail: `正文仅 ${clean.length} 字（去空白），建议 ≥50 字以保证信息量` });
  } else {
    res.push({ ok: true, label: "内容长度", detail: `正文 ${clean.length} 字，信息量充足` });
  }

  // 2. 行动号召（CTA）
  const cta = /(关注|点赞|收藏|评论|评论区|转发|私信|咨询|下单|联系|点击|店铺|主页|扣\s*\d|扣1)/.test(text);
  if (!cta) {
    res.push({ ok: false, label: "行动号召缺失", detail: "未检测到「关注/点赞/收藏/评论/私信/下单」等号召词，建议结尾补一句行动号召" });
  } else {
    res.push({ ok: true, label: "行动号召", detail: "已含关注/点赞/评论类号召词" });
  }

  // 3. 时间轴分段（分镜/剧情类输出）
  const segRe = /【?\s*\d+(?:\.\d+)?\s*[-~–—]\s*\d+(?:\.\d+)?s/;
  const starts = text.match(/【?\s*\d+(?:\.\d+)?\s*[-~–—]\s*\d+(?:\.\d+)?s/g) ?? [];
  if (segRe.test(text)) {
    if (starts.length >= 3) {
      res.push({ ok: true, label: "时间轴分段", detail: `检测到 ${starts.length} 个时间段（如 ${starts[0]?.replace(/[【】]/g, "") ?? "无"}）` });
    } else {
      res.push({
        ok: false,
        label: "时间轴不完整",
        detail: `仅 ${starts.length} 段（${starts[0]?.replace(/[【】]/g, "") ?? "无"}），建议至少 3 段覆盖开头/中段/结尾`,
      });
    }
  } else {
    res.push({ ok: true, label: "非分镜类内容", detail: "未检测到时间轴格式，跳过分段检查" });
  }

  // 4. 价格数字提醒（奢侈品回收行业敏感：金额必须与价格表一致）
  const prices = text.match(/[¥￥]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*元|\d+\s*块|\d+(?:\.\d+)?\s*折/g) ?? [];
  if (prices.length > 0) {
    res.push({
      ok: false,
      label: "价格数字提醒",
      detail: `出现 ${prices.length} 处价格表述（${prices.slice(0, 3).join("、")}），发布前请与价格表/当日行情核对`,
    });
  } else {
    res.push({ ok: true, label: "无价格表述", detail: "未检测到价格数字" });
  }

  return res;
}
