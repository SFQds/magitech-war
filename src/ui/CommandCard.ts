/**
 * 命令卡 — 底部建造/训练命令按钮
 *
 * 每个按钮包含精灵缩略图 + 名称 + 费用
 */

import Phaser from 'phaser';

export interface CommandButton {
  label: string;
  cost: string;
  spriteKey?: string; // 按钮上的单位/建筑缩略图
  callback: () => void;
}

const BTN_W = 72;
const BTN_H = 72;
const ICON_SIZE = 32;
const GAP = 8;

export class CommandCard {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setScrollFactor(0);
  }

  setCommands(commands: CommandButton[]): void {
    this.container.removeAll(true);

    const { width, height } = this.scene.cameras.main;
    const startX = 10;
    const startY = height - BTN_H - 10;

    commands.forEach((cmd, i) => {
      const x = startX + i * (BTN_W + GAP);
      const y = startY;

      // 按钮背景
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x2a1a3a, 0.95);
      bg.fillRoundedRect(x, y, BTN_W, BTN_H, 6);
      bg.lineStyle(1, 0x5e3d78, 1);
      bg.strokeRoundedRect(x, y, BTN_W, BTN_H, 6);
      this.container.add(bg);

      // 精灵缩略图（如果有）
      if (cmd.spriteKey && this.scene.textures.exists(cmd.spriteKey)) {
        const icon = this.scene.add.image(x + BTN_W / 2, y + 18, cmd.spriteKey);
        icon.setDisplaySize(ICON_SIZE, ICON_SIZE);
        this.container.add(icon);
      }

      // 名称
      const nameText = this.scene.add.text(x + BTN_W / 2, y + 46, cmd.label, {
        fontSize: '10px',
        color: '#c8a2c8',
        fontFamily: 'Arial, sans-serif',
        align: 'center',
      }).setOrigin(0.5);
      this.container.add(nameText);

      // 费用
      const costText = this.scene.add.text(x + 4, y + 2, cmd.cost, {
        fontSize: '9px',
        color: '#ffd700',
        fontFamily: 'Arial, sans-serif',
      });
      this.container.add(costText);

      // 可点击透明区域
      const hitArea = this.scene.add.rectangle(x, y, BTN_W, BTN_H, 0xffffff, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

      hitArea.on('pointerdown', cmd.callback);
      hitArea.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(0x3a2a5a, 1);
        bg.fillRoundedRect(x, y, BTN_W, BTN_H, 6);
        bg.lineStyle(2, 0x9b59b6, 1);
        bg.strokeRoundedRect(x, y, BTN_W, BTN_H, 6);
      });
      hitArea.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(0x2a1a3a, 0.95);
        bg.fillRoundedRect(x, y, BTN_W, BTN_H, 6);
        bg.lineStyle(1, 0x5e3d78, 1);
        bg.strokeRoundedRect(x, y, BTN_W, BTN_H, 6);
      });
      this.container.add(hitArea);
    });
  }

  clear(): void {
    this.container.removeAll(true);
    this.setCommands([]);
  }

  destroy(): void {
    this.container.destroy();
  }
}