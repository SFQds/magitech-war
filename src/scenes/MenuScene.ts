/**
 * 主菜单场景
 */

import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // 标题
    this.add.text(width / 2, height / 3 - 40, '魔导工业革命', {
      fontSize: '42px',
      color: '#c8a2c8',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 3 + 10, 'Magitech Industrial Revolution', {
      fontSize: '16px',
      color: '#7f6a8e',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // 按钮
    const startBtn = this.add.text(width / 2, height / 2 + 40, '▶  开始游戏', {
      fontSize: '22px',
      color: '#ffffff',
      backgroundColor: '#4a3060',
      padding: { x: 32, y: 12 },
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => startBtn.setStyle({ backgroundColor: '#5e3d78' }));
    startBtn.on('pointerout', () => startBtn.setStyle({ backgroundColor: '#4a3060' }));
    startBtn.on('pointerdown', () => {
      this.scene.start('GameScene', { map: 'map_001' });
      this.scene.start('HUDScene');
    });

    // 版本号
    this.add.text(width - 10, height - 10, 'v0.1.0', {
      fontSize: '12px',
      color: '#3a2a4a',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(1, 1);
  }
}