import Phaser from 'phaser';
import { AssetGenerator } from '../utils/AssetGenerator';
import { PNG_SPRITE_KEYS } from '../config/sprites';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.cameras.main;
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 15, 320, 30);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x9b59b6, 1);
      progressBar.fillRect(width / 2 - 155, height / 2 - 10, 310 * value, 20);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
    });

    // === PNG 精灵列表（和 config/sprites.ts 保持一致） ===
    for (const key of PNG_SPRITE_KEYS) {
      this.load.image(key, `assets/sprites/${key}.png`);
    }

    this.add.text(width / 2, height / 2 - 60, '魔导工业革命', {
      fontSize: '28px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 40, '正在加载精灵资源…', {
      fontSize: '14px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
  }

  create(): void {
    // 为未加载的纹理生成占位图（地形、未实装的单位/建筑等）
    const gen = new AssetGenerator(this);
    gen.generateAll();

    this.scene.start('MenuScene');
  }
}