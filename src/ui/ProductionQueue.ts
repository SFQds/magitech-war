/**
 * 生产队列 UI — 显示建筑当前生产进度
 */

import Phaser from 'phaser';

export class ProductionQueueUI {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setScrollFactor(0);
  }

  /** 更新生产队列显示 */
  update(queue: Array<{ name: string; progress: number }>): void {
    this.container.removeAll(true);

    const { width } = this.scene.cameras.main;
    const startX = width - 180;
    const startY = 10;

    queue.forEach((item, i) => {
      const y = startY + i * 50;
      const bg = this.scene.add.rectangle(startX, y, 170, 40, 0x1a1a2e, 0.85).setOrigin(0);
      const label = this.scene.add.text(startX + 6, y + 4, item.name, {
        fontSize: '12px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
      });
      const barBg = this.scene.add.rectangle(startX + 6, y + 26, 158, 8, 0x333333).setOrigin(0);
      const barFill = this.scene.add.rectangle(startX + 6, y + 26, 158 * item.progress, 8, 0x9b59b6).setOrigin(0);

      this.container.add([bg, label, barBg, barFill]);
    });
  }

  destroy(): void {
    this.container.destroy();
  }
}