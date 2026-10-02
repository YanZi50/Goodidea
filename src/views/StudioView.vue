<script setup lang="ts">
import { ref, inject } from "vue";

const toast = inject("toast") as (msg: string) => void;

const skillChips = ref(["口播带货", "剧情短视频", "行情科普", "小红书种草", "+ 自定义 Skill"]);
const materialChips = ref(["价格表 v3", "名表回收话术", "包袋验货要点", "风格库·强节奏口播"]);
const hotspotChips = ref(["# 名表回收新趋势", "# 二手奢侈品行情", "不使用热点"]);
const activeSkills = ref(new Set(["口播带货"]));
const activeMats = ref(new Set(["价格表 v3", "风格库·强节奏口播"]));

function toggleChip(set: Set<string>, label: string) {
  if (set.has(label)) set.delete(label);
  else set.add(label);
  // 触发响应式
  activeSkills.value = new Set(activeSkills.value);
  activeMats.value = new Set(activeMats.value);
}
</script>

<template>
  <div class="studio">
    <div class="card">
      <div class="panel-head"><span class="ph-t">生成配置</span><span class="ph-h">示例 · P1 接入真实生成</span></div>
      <div class="field">
        <label class="label">Skill 模板</label>
        <div class="chips">
          <button v-for="c in skillChips" :key="c" class="chip" :class="{ on: activeSkills.has(c) }" @click="toggleChip(activeSkills, c)">{{ c }}</button>
        </div>
      </div>
      <div class="field">
        <label class="label">关联素材</label>
        <div class="chips">
          <button v-for="c in materialChips" :key="c" class="chip" :class="{ on: activeMats.has(c) }" @click="toggleChip(activeMats, c)">{{ c }}</button>
        </div>
      </div>
      <div class="field">
        <label class="label">热点参考（可选）</label>
        <div class="chips">
          <button v-for="c in hotspotChips" :key="c" class="chip" @click="toast('热点选择：' + c + '（设计稿演示）')">{{ c }}</button>
        </div>
      </div>
      <div class="field">
        <label class="label">需求描述</label>
        <textarea class="textarea" placeholder="例：结合价格表与风格库，写一条 60 秒口播带货脚本……">结合价格表 v3 与强节奏口播风格，写一条 60 秒口播脚本：黄金三秒用行情反差做钩子，中段讲名表回收流程与打款速度，结尾引导私信估价。</textarea>
      </div>
      <div class="row" style="justify-content:space-between">
        <div style="font-size:12px;color:var(--text-faint)">预计消耗 ≈ ¥0.12 · 约 2.1k tokens</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" @click="toast('保存草稿即将开放（设计稿演示）')">存草稿</button>
          <button class="btn btn-primary" @click="toast('生成将在 P1 接入（设计稿演示）')">
            <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>开始生成
          </button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="panel-head"><span class="ph-t">输出</span><span class="ph-h">流式渲染 · 实时消耗</span></div>
      <div class="out-area">
        <div class="out-line strong">【0–3s · 钩子】</div>
        <div class="out-line">昨天还有人花 180 万买一块表，今天它就躺在我们柜台上——不是它不值，是行情变了。</div>
        <div class="out-line strong">【3–18s · 卖点】</div>
        <div class="out-line">我们做名表回收：当天验货、当天打款，报价直接对标当日行情，不做"先压价再返点"那套。</div>
        <div class="out-line strong">【18–42s · 流程与信任】</div>
        <div class="out-line">全程录屏留痕，支持到店或顺丰保价寄送，检测仪器现场出报告，每一分钱都说得清楚。</div>
        <div class="out-line strong">【42–60s · 行动号召】</div>
        <div class="out-line">想了解你手里这块表现在值多少？评论区扣"估价"，或者私信我，免费出价，不合适随时走。</div>
        <div class="cursor"></div>
        <div class="out-meta">
          <span class="tag gold">口播带货</span><span class="tag green">60s</span><span class="tag blue">风格·强节奏</span>
          <span style="margin-left:auto;font-size:11.5px;color:var(--text-faint)">生成于示例数据 · 12s 前</span>
        </div>
      </div>
      <div class="costbar"><span>本次消耗</span><div class="bar"><i></i></div><span>¥0.11 / 2.0k tokens</span></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-green btn-sm" @click="toast('复制成功（设计稿演示）')">复制全文</button>
        <button class="btn btn-ghost btn-sm" @click="toast('导出分镜表将在 P1 接入（设计稿演示）')">导出分镜表</button>
        <button class="btn btn-ghost btn-sm" @click="toast('重新生成（设计稿演示）')">重新生成</button>
      </div>
    </div>
  </div>
</template>
