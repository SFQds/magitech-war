/**
 * 通用 Tooltip — 跟随鼠标的悬浮提示框
 *
 * 用法: tooltip.show(x, y, lines) / tooltip.hide()
 * lines 为字符串数组，每行一条
 */
import Phaser from 'phaser';

const TOOLTIP_W = 200;
const LINE_H = 16;

export class Tooltip {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private elements: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(450);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);

    this.bg = scene.add.rectangle(0, 0, TOOLTIP_W, 40, 0x000000, 0.9).setOrigin(0);
    this.container.add(this.bg);
  }

  show(x: number, y: number, lines: string[]): void {
    this._clear();
    this.container.setVisible(true);

    const h = Math.max(40, lines.length * LINE_H + 12);
    this.bg.setSize(TOOLTIP_W, h);

    lines.forEach((line, i) => {
      const t = this.scene.add.text(8, 6 + i * LINE_H, line, {
        fontSize: '11px',
        color: i === 0 ? '#c8a2c8' : '#a0a0c0',
        fontFamily: 'Arial, sans-serif',
        wordWrap: { width: TOOLTIP_W - 16 },
      });
      this.container.add(t);
      this.elements.push(t);
    });

    // 钳制到屏幕内（避免溢出右下边缘）
    const { width, height } = this.scene.cameras.main;
    const tx = Math.min(x, width - TOOLTIP_W - 4);
    const ty = Math.min(y, height - h - 4);
    this.container.setPosition(tx, ty);
  }

  hide(): void {
    this.container.setVisible(false);
    this._clear();
  }

  private _clear(): void {
    for (const t of this.elements) t.destroy();
    this.elements = [];
  }

  destroy(): void {
    this._clear();
    this.container.destroy();
  }
}
