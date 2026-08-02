import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // 分包: phaser 体积大且稳定(极少变动), 单独成 chunk 以命中浏览器长期缓存;
        // 游戏逻辑代码迭代时只需重新下载较小的 index chunk。
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
