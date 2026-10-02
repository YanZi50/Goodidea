<script setup lang="ts">
import { ref, inject } from "vue";

const toast = inject("toast") as (msg: string) => void;

type Hot = {
  rank: number;
  title: string;
  heat: string;
  trend: "up" | "down";
  tags: Array<[string, string]>;
};

const hotList = ref<Hot[]>([
  { rank: 1, title: "二手名表回收价格出现两极分化，这些品牌不跌反涨", heat: "128.4万", trend: "up", tags: [["blue", "名表"], ["gold", "行情"]] },
  { rank: 2, title: "年轻人开始把闲置包袋变现，回收平台日询价量翻倍", heat: "96.7万", trend: "up", tags: [["", "包袋"], ["green", "趋势"]] },
  { rank: 3, title: "LV 老花包行情回暖，专柜同款二手价逼近公价", heat: "81.2万", trend: "up", tags: [["", "包袋"]] },
  { rank: 4, title: "鉴定师揭秘：回收行业三个最常见的压价话术", heat: "64.9万", trend: "up", tags: [["red", "避坑"]] },
  { rank: 5, title: "劳力士行情周报：哪些表款还在跌？", heat: "52.3万", trend: "down", tags: [["blue", "名表"]] },
  { rank: 6, title: "爱马仕铂金包保值率实测：5 年还能回本多少", heat: "47.8万", trend: "up", tags: [["gold", "行情"]] },
]);

const tabs = ref(["抖音热榜", "微博热搜", "B 站热门"]);
const activeTab = ref("抖音热榜");
const manual = ref("");

function switchTab(t: string) {
  activeTab.value = t;
  toast("切换热榜源：" + t + "（示例）");
}

function refresh() {
  toast("正在刷新（设计稿模拟）");
}

function addManual() {
  if (manual.value.trim()) {
    toast("已加入热点列表：" + manual.value.trim() + "（设计稿演示）");
    manual.value = "";
  }
}
</script>

<template>
  <div>
    <div class="row" style="margin-bottom:14px;flex-wrap:wrap">
      <div class="hot-tabs" style="margin-bottom:0">
        <button v-for="t in tabs" :key="t" class="hot-tab" :class="{ on: activeTab === t }" @click="switchTab(t)">{{ t }}</button>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" @click="refresh">刷新</button>
        <button class="btn btn-soft btn-sm" @click="toast('将热点接入生成工作台（设计稿演示）')">接入生成</button>
      </div>
    </div>
    <div v-for="h in hotList" :key="h.rank" class="hot-item">
      <div class="hot-rank" :class="{ top: h.rank <= 3 }">{{ h.rank }}</div>
      <div class="hot-body">
        <div class="t">{{ h.title }}</div>
        <div class="s">
          <span v-if="h.trend === 'up'" class="up">▲ {{ h.rank <= 3 ? "12.4%" : "6.8%" }}</span>
          <span v-else class="down">▼ 3.2%</span>
          <span>示例数据</span><span>10 分钟更新</span>
        </div>
      </div>
      <div class="hot-tags">
        <span v-for="t in h.tags" :key="t[1]" class="tag" :class="t[0]">{{ t[1] }}</span>
      </div>
      <div class="hot-val"><div class="hv">{{ h.heat }}</div><div class="hl">热度</div></div>
    </div>
    <div class="manual-input">
      <input class="input" v-model="manual" placeholder="手动输入热点 / 话题（接口不可用时兜底）…" @keydown.enter="addManual" />
      <button class="btn btn-primary btn-sm" @click="addManual">添加</button>
    </div>
  </div>
</template>
