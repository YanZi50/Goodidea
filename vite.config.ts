import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [vue()],
  // 相对资源路径：兼容 Tauri 自定义协议与 file:// 直接打开构建产物
  base: "./",
  build: {
    rolldownOptions: {
      output: {
        // 按依赖族拆分 vendor chunk：AI SDK（ai/@ai-sdk）与文档/Markdown 库各自独立，
        // 消除 >500KB 单 chunk 警告，提升缓存复用（P2 视图级 dynamic import 留待后续按需）
        manualChunks(id: string) {
          if (id.includes("node_modules/ai/") || id.includes("node_modules/@ai-sdk/") || id.includes("node_modules/zod/")) return "vendor-ai";
          if (id.includes("node_modules/mammoth/")) return "vendor-doc";
          if (id.includes("node_modules/marked/") || id.includes("node_modules/dompurify/")) return "vendor-md";
          if (id.includes("node_modules/vue/") || id.includes("node_modules/@vue/")) return "vendor-vue";
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
