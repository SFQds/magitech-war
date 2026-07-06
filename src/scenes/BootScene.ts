import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // 显示加载进度
    const { width, height } = this.cameras.main;
    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 15, 320, 30);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x9b59b6, 1); // 水晶紫
      progressBar.fillRect(width / 2 - 155, height / 2 - 10, 310 * value, 20);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
    });

    // 加载 Logo 文字
    const title = this.add.text(width / 2, height / 2 - 60, '魔导工业革命', {
      fontSize: '28px',
      color: '#c8a2c8',
      fontFamily: 'Arial, sans-serif',
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height / 2 + 40, '正在加载…', {
      fontSize: '14px',
      color: '#7f6a8e',
      fontFamily: 'Arial, sans-serif',
    });
    subtitle.setOrigin(0.5);

    // TODO: 加载游戏资源
    // this.load.image('logo', 'assets/ui/logo.png');
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}