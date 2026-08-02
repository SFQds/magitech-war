import Phaser from 'phaser';
import { AssetGenerator } from '../utils/AssetGenerator';
import { PNG_SPRITE_KEYS, UI_SKIN_KEYS } from '../config/sprites';
import { SoundManager } from '../utils/SoundManager';
import { UITheme as T } from '../ui/theme/UITheme';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.cameras.main;
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(T.Color.CARD_BG, 0.9);
    progressBox.fillRoundedRect(width / 2 - 160, height / 2 - 15, 320, 30, 4);
    progressBox.lineStyle(1, T.Color.ACCENT_GOLD, 0.5);
    progressBox.strokeRoundedRect(width / 2 - 160, height / 2 - 15, 320, 30, 4);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(T.Color.ACCENT_GOLD, 0.9);
      progressBar.fillRoundedRect(width / 2 - 155, height / 2 - 10, 310 * value, 20, 3);
      // 顶部高光, 模拟能量灌注发光
      progressBar.fillStyle(0xffe9a8, 0.45);
      progressBar.fillRoundedRect(width / 2 - 155, height / 2 - 10, 310 * value, 6, 3);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
    });

    this.load.on('loaderror', (file: any) => {
      const key = file.key ?? file.url ?? file;
      console.warn(`[BootScene] 资源加载失败: ${key}（将使用占位纹理降级）`);
      // P2-8 修复：记录失败 key 供 create 时检查（AssetGenerator 的 __DEFAULT 会兜底）
    });

    // === PNG 精灵列表（和 config/sprites.ts 保持一致） ===
    for (const key of PNG_SPRITE_KEYS) {
      this.load.image(key, `assets/sprites/${key}.png`);
    }

    this.add.text(width / 2, height / 2 - 60, '魔导工业革命', {
      fontSize: T.Font.TITLE, color: T.ColorHex.TEXT_MAIN, fontFamily: T.FontFamily.DISPLAY, fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 - 30, 'Magitech Industrial Revolution', {
      fontSize: T.Font.SM, color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 40, '魔导引擎预热中… 正在加载精灵资源', {
      fontSize: T.Font.BASE, color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    }).setOrigin(0.5);
  }

  create(): void {
    // 为未加载的纹理生成占位图（地形、未实装的单位/建筑等）
    const gen = new AssetGenerator(this);
    gen.generateAll();

    // UI 皮肤纹理是细腻图: 切到线性采样, 避免 pixelArt nearest 模糊
    for (const key of UI_SKIN_KEYS) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    }

    this.scene.start('MenuScene');
  }
}