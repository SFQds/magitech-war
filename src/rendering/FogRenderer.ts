/**
 * 迷雾渲染器 — 将 FogOfWar 状态绘制到 Phaser Image 网格上
 *
 * 优化：预创建 Image 网格，每帧只切换 alpha（Phaser 自动 WebGL 批处理）。
 * 替代旧版每帧 4096 次 fillRect 调用。
 */

import Phaser from 'phaser';
import { FogOfWar, FogState } from '../core/FogOfWar';

export class FogRenderer {
  /** 半透明黑色纹理 key（32x32 单色方块） */
  private fogTexture!: Phaser.Textures.CanvasTexture;
  /** 每格一个 Image 对象 */
  private grid: Phaser.GameObjects.Image[][] = [];
  private scene: Phaser.Scene;
  private mapW: number = 0;
  private mapH: number = 0;
  private tileSize: number = 32;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 初始化：创建雾格纹理 + 完整网格 */
  init(mapW: number, mapH: number, tileSize: number = 32): void {
    this.mapW = mapW;
    this.mapH = mapH;
    this.tileSize = tileSize;

    // 创建一个 32x32 的纯黑纹理
    if (!this.scene.textures.exists('__fog_black')) {
      const canvas = this.scene.textures.createCanvas('__fog_black', tileSize, tileSize);
      const ctx = canvas!.getContext();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, tileSize, tileSize);
      canvas!.refresh();
    }

    // 预创建所有雾格 Image
    for (let y = 0; y < mapH; y++) {
      this.grid[y] = [];
      for (let x = 0; x < mapW; x++) {
        const img = this.scene.add.image(
          x * tileSize + tileSize / 2,
          y * tileSize + tileSize / 2,
          '__fog_black',
        );
        img.setDepth(50);
        img.setAlpha(1); // 默认全黑
        this.grid[y][x] = img;
      }
    }
  }

  /** 每帧渲染：增量更新 — 仅更新状态变更的瓦片 */
  render(fog: FogOfWar): void {
    const changed = fog.getChangedKeys();
    for (let i = 0; i < changed.length; i++) {
      const key = changed[i];
      const x = key % this.mapW;
      const y = (key / this.mapW) | 0;
      const state = fog.getState(x, y);
      const alpha = state === FogState.Hidden ? 1.0
                  : state === FogState.Explored ? 0.5
                  : 0.0;
      this.grid[y]?.[x]?.setAlpha(alpha);
    }
  }

  /** 全量渲染（地图初始化时调用一次） */
  renderAll(fog: FogOfWar): void {
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const state = fog.getState(x, y);
        const alpha = state === FogState.Hidden ? 1.0
                    : state === FogState.Explored ? 0.5
                    : 0.0;
        this.grid[y][x].setAlpha(alpha);
      }
    }
  }

  /** 销毁所有雾格 */
  destroy(): void {
    for (const row of this.grid) {
      for (const img of row) {
        img.destroy();
      }
    }
    this.grid = [];
  }
}