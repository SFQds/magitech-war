/**
 * 血条渲染器 — 单位/建筑头顶悬浮血条
 */

import Phaser from 'phaser';

export class HpBarRenderer {
  private scene: Phaser.Scene;
  private cache = new Map<string, Phaser.GameObjects.Graphics>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 绘制血条，hpPct 0~1 */
  draw(entityId: string, worldX: number, worldY: number, hpPct: number): void {
    let bar = this.cache.get(entityId);
    if (!bar) {
      bar = this.scene.add.graphics();
      bar.setDepth(15);
      this.cache.set(entityId, bar);
    }
    bar.clear();

    const barW = 16;
    const barH = 2;
    // 背景
    bar.fillStyle(0x333333, 0.8);
    bar.fillRect(worldX, worldY, barW, barH);
    // 血量（绿→黄→红渐变）
    const color = hpPct > 0.6 ? 0x00ff00 : hpPct > 0.3 ? 0xffcc00 : 0xff3333;
    bar.fillStyle(color, 1);
    bar.fillRect(worldX, worldY, Math.max(0, barW * hpPct), barH);
  }

  /** 清除血条 */
  clear(entityId: string): void {
    const bar = this.cache.get(entityId);
    if (bar) {
      bar.destroy();
      this.cache.delete(entityId);
    }
  }

  /** 清理所有血条并清理未存活实体的残留 */
  cleanup(activeIds: Set<string>): void {
    for (const [id] of this.cache) {
      if (!activeIds.has(id)) this.clear(id);
    }
  }

  destroy(): void {
    for (const [, bar] of this.cache) bar.destroy();
    this.cache.clear();
  }
}