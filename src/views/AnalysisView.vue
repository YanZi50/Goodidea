<script setup lang="ts">
import { inject } from "vue";

const toast = inject("toast") as (msg: string) => void;
</script>

<template>
  <div>
    <div class="kpis">
      <div class="kpi"><div class="k">已分析文档</div><div class="v">12<small>篇</small></div><div class="d">较上次 +3</div></div>
      <div class="kpi"><div class="k">覆盖文本</div><div class="v">8.4<small>万字</small></div><div class="d">100% 分块</div></div>
      <div class="kpi"><div class="k">发现问题</div><div class="v">7<small>项</small></div><div class="d" style="color:var(--red)">2 项待处理</div></div>
      <div class="kpi"><div class="k">累计分析消耗</div><div class="v">¥3.2</div><div class="d">增量模式节省 61%</div></div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">全库浓缩 <span class="hint">示例结果 · P1 接入真实分析</span></div>
      <div class="summary-block">
        <div class="sb-t">核心要点（3 条）</div>
        <p>① 素材库覆盖名表、包袋、饰品三大品类，价格区间 1 万–300 万；② 爆款脚本共性：黄金三秒悬念 + 回收价对比 + 信任背书；③ 个人风格偏向强节奏口播、短句高频、结尾行动号召。</p>
      </div>
      <div class="summary-block" style="border-left-color:var(--red)">
        <div class="sb-t" style="color:var(--red)">指出问题（7 项，重点 2 项）</div>
      </div>
      <div class="issue">
        <div class="dot"></div>
        <div class="body">
          <div class="t">脚本结构同质化：12 篇中 9 篇使用「先报价后验货」开场</div>
          <div class="s">黄金三秒的悬念密度不足，易被平台判定为广告流，影响完播率。</div>
          <div class="ref"><span class="tag">脚本-0715</span><span class="tag">脚本-0722</span><span class="tag red">高优先</span></div>
        </div>
      </div>
      <div class="issue">
        <div class="dot warn"></div>
        <div class="body">
          <div class="t">价格数据口径不一致：部分脚本写「9 折回收」，部分写「高价回收」无锚点</div>
          <div class="s">建议统一为可核验的对比话术（如「市场行情 + 当日回收价」），增强可信度。</div>
          <div class="ref"><span class="tag">素材-价格表</span><span class="tag gold">中优先</span></div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-primary" @click="toast('全库分析将在 P1 接入（设计稿演示）')">
          <svg viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 15l4-6 3 4 5-7" /></svg>重新分析全库
        </button>
        <button class="btn btn-ghost" @click="toast('增量分析将在 P3 接入（设计稿演示）')">仅分析新增</button>
        <button class="btn btn-ghost" @click="toast('分析报告导出即将开放（设计稿演示）')">导出报告</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">主题聚类 <span class="hint">示例</span></div>
      <div class="cluster">
        <span class="tag gold">口播带货（7）</span><span class="tag green">剧情种草（3）</span><span class="tag blue">行情科普（2）</span><span class="tag">素材归档（4）</span>
      </div>
    </div>
  </div>
</template>
