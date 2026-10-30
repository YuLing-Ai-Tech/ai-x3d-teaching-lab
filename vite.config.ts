import { defineConfig } from "vite";

const assetMode = process.env.VITE_AI_X3D_ASSET_MODE === "local-full" ? "local-full" : "public-core";

// 课堂包只放运行需要的文件：sourcemap 生成但不被页面引用（排错时仍可在 dist 里找到）。
// 三个大依赖各自成块，多个页面共用时只下载一次。
export default defineConfig({
  base: "./",
  publicDir: assetMode === "local-full" ? "public" : "public-core",
  build: {
    target: "es2022",
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 打包器自带的小助手（CommonJS 互操作、预加载）单独成块，否则会被塞进某个大依赖块，让首页也去下载它
          if (id.startsWith("\0")) return "runtime";
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/three/")) return "vendor-three";
          if (id.includes("/maplibre-gl/") || id.includes("/maplibre-contour/")) return "vendor-maplibre";
          if (id.includes("/@deck.gl/") || id.includes("/@luma.gl/") || id.includes("/@loaders.gl/") || id.includes("/@math.gl/")) return "vendor-deckgl";
          return undefined;
        },
      },
    },
  },
});
