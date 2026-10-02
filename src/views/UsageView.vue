<script setup lang="ts">
const bar7 = [
  { d: "周一", v: 0.96 },
  { d: "周二", v: 1.42 },
  { d: "周三", v: 0.78 },
  { d: "周四", v: 1.15 },
  { d: "周五", v: 0.86 },
  { d: "周六", v: 0.62 },
  { d: "周日", v: 0.45 },
];
const maxV = Math.max(...bar7.map((b) => b.v));

const modelUsage = [
  { m: "豆包 · doubao-seed-2.0-pro", p: "¥0.30 / 1M in · ¥0.60 / 1M out", amt: "¥9.6", tag: "gold", tagTxt: "主力" },
  { m: "OpenAI · gpt-5", p: "¥2.50 / 1M in · ¥10 / 1M out", amt: "¥8.2", tag: "", tagTxt: "备用" },
  { m: "Anthropic · claude-sonnet-4", p: "¥1.60 / 1M in · ¥8 / 1M out", amt: "¥5.1", tag: "", tagTxt: "备用" },
  { m: "本地 · Ollama qwen3", p: "¥0（本地推理）", amt: "¥1.8", tag: "green", tagTxt: "省钱" },
];
</script>

<template>
  <div>
    <div class="usage-sum">
      <div class="kpi"><div class="k">今日消耗</div><div class="v">¥0.86</div><div class="d">3 次生成 · 1 次分析</div></div>
      <div class="kpi"><div class="k">本周消耗</div><div class="v">¥6.4</div><div class="d">较上周 -22%</div></div>
      <div class="kpi"><div class="k">本月累计</div><div class="v">¥24.7</div><div class="d">预算剩余 ¥75.3</div></div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">近 7 日消耗 <span class="hint">示例数据</span></div>
      <div class="bars">
        <div v-for="b in bar7" :key="b.d" class="bar-col">
          <div class="fill" :class="{ green: b.d === '周五' }" :style="{ height: Math.round((b.v / maxV) * 100) + '%' }"></div>
          <div class="val">¥{{ b.v.toFixed(2) }}</div>
          <div class="lbl">{{ b.d }}</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">按模型统计 <span class="hint">价格表为数据文件，可编辑</span></div>
      <div class="usage-table">
        <div v-for="u in modelUsage" :key="u.m" class="row-line">
          <span class="m">{{ u.m }}</span>
          <span class="p">{{ u.p }}</span>
          <span class="amt">{{ u.amt }}</span>
          <span class="tag" :class="u.tag" style="width:auto">{{ u.tagTxt }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
