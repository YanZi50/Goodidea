<script setup lang="ts">
// 受限下拉：选项超过 maxVisible 条时折叠为滚动列表（可见滑块），替代原生 select 超长下拉遮挡页面
import { ref, computed, onMounted, onUnmounted } from "vue";

export interface LimitOption {
  value: string | number;
  label: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | "";
    options: LimitOption[];
    placeholder?: string;
    disabled?: boolean;
    maxVisible?: number;
    width?: number;
  }>(),
  { placeholder: "请选择…", disabled: false, maxVisible: 5, width: 160 }
);

const emit = defineEmits<{ (e: "update:modelValue", v: string | number | ""): void }>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

const display = computed(() => {
  if (props.modelValue === "" || props.modelValue === null || props.modelValue === undefined) return props.placeholder;
  const hit = props.options.find((o) => String(o.value) === String(props.modelValue));
  return hit ? hit.label : String(props.modelValue);
});

const dropMax = computed(() => `${props.maxVisible * 34}px`);

function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
}

function pick(o: LimitOption) {
  emit("update:modelValue", o.value);
  open.value = false;
}

function onDocClick(e: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <div ref="rootEl" class="limit-select" :class="{ disabled }" :style="{ width: width + 'px' }">
    <div class="ls-trigger" @click="toggle">
      <span class="ls-val" :class="{ ph: modelValue === '' || modelValue === null || modelValue === undefined }">{{ display }}</span>
      <svg class="ls-arrow" :class="{ up: open }" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
    </div>
    <div v-if="open" class="ls-drop" :style="{ maxHeight: dropMax }">
      <div v-for="o in options" :key="String(o.value)" class="ls-opt" :class="{ on: String(o.value) === String(modelValue) }" @click="pick(o)">{{ o.label }}</div>
      <div v-if="options.length === 0" class="ls-empty">（无选项）</div>
    </div>
  </div>
</template>

<style scoped>
.limit-select { position: relative; flex-shrink: 0; }
.limit-select.disabled { opacity: 0.55; pointer-events: none; }
.ls-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); cursor: pointer; user-select: none; transition: border-color 0.13s;
}
.ls-trigger:hover { border-color: var(--accent); }
.ls-val { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ls-val.ph { color: var(--text-faint); }
.ls-arrow { width: 13px; height: 13px; stroke: var(--text-faint); fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; flex-shrink: 0; }
.ls-arrow.up { transform: rotate(180deg); }
.ls-drop {
  position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 60;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  overflow-y: auto; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28); padding: 4px;
}
.ls-opt { padding: 6px 9px; font-size: 13px; color: var(--text); border-radius: 6px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ls-opt:hover { background: var(--surface-2); }
.ls-opt.on { background: var(--accent-soft); color: var(--accent); }
.ls-empty { padding: 8px 9px; font-size: 12px; color: var(--text-faint); }
.ls-drop::-webkit-scrollbar { width: 7px; }
.ls-drop::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
.ls-drop::-webkit-scrollbar-thumb:hover { background: var(--text-faint); }
.ls-drop::-webkit-scrollbar-track { background: transparent; }
</style>
