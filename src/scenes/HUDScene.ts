/**
 * HUD 场景 — 覆盖在 GameScene 上的透明 UI 层
 *
 * 管理资源面板、小地图、选中面板、命令卡
 */

import Phaser from 'phaser';

export class HUDScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HUDScene' });
  }

  create(): void {
    // 顶部资源条
    this.add.rectangle(0, 0, 1280, 40, 0x1a1a2e, 0.85)
      .setOrigin(0, 0)
      .setDepth(100);

    this.add.text(12, 10, '💎 2000  ⚙ 50  👥 0/20', {
      fontSize: '16px',
      color: '#c8a2c8',
      fontFamily: 'Arial, sans-serif',
    }).setDepth(101);

    // 底部命令面板（占位）
    this.add.rectangle(0, 720 - 80, 1280, 80, 0x1a1a2e, 0.85)
      .setOrigin(0, 0)
      .setDepth(100);

    this.add.text(12, 720 - 70, '选中单位: 无', {
      fontSize: '14px',
      color: '#7f6a8e',
      fontFamily: 'Arial, sans-serif',
    }).setDepth(101);

    // 右下角小地图占位
    this.add.rectangle(1280 - 100, 720 - 80 - 100, 96, 96, 0x111122, 0.9)
      .setOrigin(0, 0)
      .setDepth(100);

    this.add.text(1280 - 96, 720 - 80 - 96, '小地图', {
      fontSize: '10px',
      color: '#555',
      fontFamily: 'Arial, sans-serif',
    }).setDepth(101);
  }

  /** 更新资源显示 */
  updateResources(crystal: number, industry: number, supply: number, supplyCap: number): void {
    // TODO: 通过事件更新文本
  }
}