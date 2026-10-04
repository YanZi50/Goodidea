<script setup lang="ts">
import { ref, onMounted } from "vue";
import { todayCost, costByModel, costHistory, priceFor } from "../lib/ai";

const today = ref(0);
const week = ref(0);
const month = ref(0);
const bar7 = ref<Array<{ date: string; v: number }>>([]);
const modelRows = ref<Array<{ label: string; price: string; amt: number }>>([]);

function refresh() {
  today.value = todayCost();
  const hist = costHistory(7);
  week.value = hist.reduce((s, h) => s + h.v, 0);
  month.value = costHistory(30).reduce((s, h) => s + h.v, 0);
  bar7.value = hist;
  const byModel = costByModel();
  modelRows.value = Object.entries(byModel)
    .sort((a, b) => b[1] - a[1])
    .map(([label, amt]) => {
      const p = priceFor(label);
      return {
        label,
        price:
          p.in === 0 && p.out === 0
            ? "未收录单价（可在设置→价格表添加）"
            : `¥${p.in} / 1M in · ¥${p.out} / 1M out`,
        amt,
      };
    });
}

onMounted(refresh);

const maxV = () => Math.max(...bar7.value.map((b) => b.v), 0.0001);
</script>

<template>
  <div>
    <div class="usage-sum">
      <div class="kpi"><div class="k">今日消耗</div><div class="v">¥{{ today.toFixed(2) }}</div><div class="d">分析 + 生成累计（本机记录）</div></div>
      <div class="kpi"><div class="k">近 7 日</div><div class="v">¥{{ week.toFixed(2) }}</div><div class="d">真实计费累计</div></div>
      <div class="kpi"><div class="k">近 30 日</div><div class="v">¥{{ month.toFixed(2) }}</div><div class="d">滚动累计</div></div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">近 7 日消耗 <span class="hint">真实数据 · 自第一次调用起</span></div>
      <div class="bars">
        <div v-for="b in bar7" :key="b.date" class="bar-col">
          <div class="fill" :class="{ green: b.v > 0 }" :style="{ height: Math.max(2, Math.round((b.v / maxV()) * 100)) + '%' }"></div>
          <div class="val">¥{{ b.v.toFixed(2) }}</div>
          <div class="lbl">{{ b.date }}</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">按模型统计 <span class="hint">单价为常量价格表 · P2 迁入 billing_rules</span></div>
      <div v-if="modelRows.length === 0" style="color:var(--text-faint);font-size:13px;padding:8px 0">
        暂无消耗记录 — 完成一次生成或全库分析后自动统计
      </div>
      <div v-else class="usage-table">
        <div v-for="u in modelRows" :key="u.label" class="row-line">
          <span class="m">{{ u.label }}</span>
          <span class="p">{{ u.price }}</span>
          <span class="amt">¥{{ u.amt.toFixed(2) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
