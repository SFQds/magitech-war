/**
 * 迷雾渲染器 — 将 FogOfWar 状态绘制到 Phaser Graphics 上
 */

import Phaser from 'phaser';
import { FogOfWar, FogState } from '../core/FogOfWar';

export class FogRenderer {
  /** 每帧渲染迷雾覆盖层 */
  static render(
    graphics: Phaser.GameObjects.Graphics,
    fog: FogOfWar,
    mapW: number,
    mapH: number,
    tileSize: number,
    camera: Phaser.Cameras.Scene2D.Camera,
  ): void {
    graphics.clear();

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const state = fog.getState(x, y);
        if (state === FogState.Hidden) {
          // 完全不可见：黑色
          graphics.fillStyle(0x000000, 1);
          graphics.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
        } else if (state === FogState.Explored) {
          // 已探索但当前不可见：半透明黑
          graphics.fillStyle(0x000000, 0.5);
          graphics.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
        }
        // state === 'visible' → 不绘制覆盖
      }
    }
  }
}