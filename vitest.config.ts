import { defineConfig } from 'vitest/config';

// Vitest 配置 — 仅测试纯逻辑系统（寻路/迷雾/采集/战斗/科技树/资源/配置）
// 待测模块均不依赖 Phaser 运行时（Entity.sprite 为类型注解，esbuild 转译时擦除），
// 故无需 alias 或环境模拟。
export default defineConfig({
  test: {
    // 测试文件放在 src 下的 *.test.ts，与被测代码同目录便于维护
    include: ['src/**/*.test.ts'],
    environment: 'node', // 纯逻辑测试无需 DOM
    globals: false,      // 显式 import { describe, it, expect } 避免全局污染
    // 默认全量跑；CI 可用 --reporter=dot
    reporters: 'default',
  },
});
