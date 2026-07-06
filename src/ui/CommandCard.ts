/**
 * 命令卡 — 底部建造/训练命令按钮
 *
 * 根据选中建筑显示可生产单位
 */

import Phaser from 'phaser';

export interface CommandButton {
  label: string;
  cost: string;
  callback: () => void;
}

export class CommandCard {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private buttons: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setScrollFactor(0);
  }

  /** 设置可用命令 */
  setCommands(commands: CommandButton[]): void {
    // 清理旧按钮
    for (const btn of this.buttons) {
      btn.destroy();
    }
    this.buttons = [];
    this.container.removeAll(true);

    const { width, height } = this.scene.cameras.main;
    const startX = 10;
    const startY = height - 75;

    commands.forEach((cmd, i) => {
      const btn = this.scene.add.text(startX + i * 100, startY, `${cmd.label}\n${cmd.cost}`, {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#3a2a4a',
        padding: { x: 8, y: 4 },
        align: 'center',
        fontFamily: 'Arial, sans-serif',
      }).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', cmd.callback);
      btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#5e3d78' }));
      btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#3a2a4a' }));

      this.buttons.push(btn);
      this.container.add(btn);
    });
  }

  clear(): void {
    this.setCommands([]);
  }

  destroy(): void {
    this.container.destroy();
  }
}