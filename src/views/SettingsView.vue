<script setup lang="ts">
import { inject } from "vue";

const toast = inject("toast") as (msg: string) => void;
</script>

<template>
  <div class="card">
    <div class="card-title">设置 <span class="hint">P2 落地</span></div>
    <div style="color:var(--text-muted);font-size:13.5px">
      API 密钥（.env）、模型默认值、热点源选择、价格表维护将在此面板落地。
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" @click="toast('密钥配置在 P2 接入（设计稿演示）')">密钥配置</button>
      <button class="btn btn-ghost btn-sm" @click="toast('价格表编辑在 P2 接入（设计稿演示）')">价格表</button>
    </div>
  </div>
</template>
