/**
 * 资源显示 — 顶部资源条
 */

import Phaser from 'phaser';

export class ResourceDisplay {
  private scene: Phaser.Scene;
  private text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.text = scene.add.text(12, 10, '', {
      fontSize: '16px',
      color: '#c8a2c8',
      fontFamily: 'Arial, sans-serif',
    }).setDepth(200).setScrollFactor(0);
  }

  /** 更新资源数值 */
  update(crystal: number, industry: number, supply: number, supplyCap: number): void {
    this.text.setText(`💎 ${crystal}  ⚙ ${industry}  👥 ${supply}/${supplyCap}`);
  }

  destroy(): void {
    this.text.destroy();
  }
}