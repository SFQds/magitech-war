/**
 * 命令卡 — 底部建造/训练命令按钮
 *
 * 每个按钮包含精灵缩略图 + 名称 + 费用
 */

import Phaser from 'phaser';

export interface CommandButton {
  label: string;
  cost: string;
  spriteKey?: string;
  callback: () => void;
  disabled?: boolean;
  /** P1-UI: 热键字母（如 'S'/'H'/'A'），显示在按钮右上角 */
  hotkey?: string;
  /** 审1: hover tooltip 内容（字符串数组，每行一条），不传则不显示 */
  tooltipLines?: string[];
}

const BTN_W = 72;
const BTN_H = 72;
const ICON_SIZE = 32;
const GAP = 8;

export class CommandCard {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  /** 审1: hover 回调 (lines, x, y) | null=隐藏 */
  private _onHover: ((lines: string[] | null, x: number, y: number) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setScrollFactor(0);
  }

  /** 审1: 设置 hover tooltip 回调 */
  onHover(cb: (lines: string[] | null, x: number, y: number) => void): void {
    this._onHover = cb;
  }

  setCommands(commands: CommandButton[]): void {
    this.container.removeAll(true);

    const { width, height } = this.scene.cameras.main;
    const startX = 10;
    const startY = height - BTN_H - 10;

    commands.forEach((cmd, i) => {
      const x = startX + i * (BTN_W + GAP);
      const y = startY;
      const isDisabled = cmd.disabled === true;

      // 按钮背景
      const bg = this.scene.add.graphics();
      bg.fillStyle(isDisabled ? 0x1a1a2a : 0x2a1a3a, 0.95);
      bg.fillRoundedRect(x, y, BTN_W, BTN_H, 6);
      bg.lineStyle(1, isDisabled ? 0x333333 : 0x5e3d78, 1);
      bg.strokeRoundedRect(x, y, BTN_W, BTN_H, 6);
      this.container.add(bg);

      // 精灵缩略图（如果有，灰显降alpha）
      if (cmd.spriteKey && this.scene.textures.exists(cmd.spriteKey)) {
        const icon = this.scene.add.image(x + BTN_W / 2, y + 18, cmd.spriteKey);
        icon.setDisplaySize(ICON_SIZE, ICON_SIZE);
        if (isDisabled) icon.setAlpha(0.35).setTint(0x666666);
        this.container.add(icon);
      }

      // 名称
      const nameText = this.scene.add.text(x + BTN_W / 2, y + 46, cmd.label, {
        fontSize: '10px',
        color: isDisabled ? '#555555' : '#c8a2c8',
        fontFamily: 'Arial, sans-serif',
        align: 'center',
      }).setOrigin(0.5);
      this.container.add(nameText);

      // 费用
      const costText = this.scene.add.text(x + 4, y + 2, cmd.cost, {
        fontSize: '9px',
        color: isDisabled ? '#555555' : '#ffd700',
        fontFamily: 'Arial, sans-serif',
      });
      this.container.add(costText);

      // P1-UI: 热键字母（右上角）
      if (cmd.hotkey) {
        const hotkeyText = this.scene.add.text(x + BTN_W - 12, y + 2, cmd.hotkey, {
          fontSize: '11px',
          color: isDisabled ? '#444444' : '#9b59b6',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
        });
        this.container.add(hotkeyText);
      }

      // 可点击透明区域
      const hitArea = this.scene.add.rectangle(x, y, BTN_W, BTN_H, 0xffffff, 0)
        .setOrigin(0);
      if (!isDisabled) {
        hitArea.setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', cmd.callback);
        hitArea.on('pointerover', (pointer: Phaser.Input.Pointer) => {
          bg.clear();
          bg.fillStyle(0x3a2a5a, 1);
          bg.fillRoundedRect(x, y, BTN_W, BTN_H, 6);
          bg.lineStyle(2, 0x9b59b6, 1);
          bg.strokeRoundedRect(x, y, BTN_W, BTN_H, 6);
          // 审1: hover tooltip
          if (this._onHover && cmd.tooltipLines) {
            this._onHover(cmd.tooltipLines, pointer.x + 12, pointer.y + 12);
          }
        });
        hitArea.on('pointerout', () => {
          bg.clear();
          bg.fillStyle(0x2a1a3a, 0.95);
          bg.fillRoundedRect(x, y, BTN_W, BTN_H, 6);
          bg.lineStyle(1, 0x5e3d78, 1);
          bg.strokeRoundedRect(x, y, BTN_W, BTN_H, 6);
          if (this._onHover) this._onHover(null, 0, 0);
        });
      }
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