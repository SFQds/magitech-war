/**
 * 通用 Tooltip — 跟随鼠标的悬浮提示框
 *
 * 用法: tooltip.show(x, y, lines) / tooltip.hide()
 * lines 为字符串数组，每行一条; 首行作标题(金色), 其余正文(灰紫)。
 * 取自 UITheme, 深底金标题描边。
 */
import Phaser from 'phaser';
import { UITheme as T } from './theme/UITheme';

const TOOLTIP_W = 220;
const LINE_H = 16;

export class Tooltip {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private bgNs: Phaser.GameObjects.NineSlice | null = null;
  private elements: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(450);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);

    this.bg = scene.add.graphics();
    this.container.add(this.bg);
  }

  show(x: number, y: number, lines: string[]): void {
    this._clear();
    this.container.setVisible(true);

    const h = Math.max(40, lines.length * LINE_H + 12);
    // 重绘背景: 有皮肤贴图用 NineSlice 缩放, 否则深底金描边
    if (this.scene.textures.exists('skin_panel_console')) {
      if (!this.bgNs) {
        this.bgNs = this.scene.add.nineslice(0, 0, 'skin_panel_console', undefined, TOOLTIP_W, h, 12, 12, 12, 12).setOrigin(0);
        this.container.addAt(this.bgNs, 1);
      }
      this.bgNs.setSize(TOOLTIP_W, h);
      this.bgNs.setVisible(true);
    } else {
      this.bgNs?.setVisible(false);
      this.bg.clear();
      this.bg.fillStyle(T.Color.PANEL_BG, 0.95);
      this.bg.fillRoundedRect(0, 0, TOOLTIP_W, h, T.Radius.SM);
      this.bg.lineStyle(1, T.Color.ACCENT_GOLD, 0.7);
      this.bg.strokeRoundedRect(0, 0, TOOLTIP_W, h, T.Radius.SM);
    }

    lines.forEach((line, i) => {
      const isTitle = i === 0;
      const t = this.scene.add.text(8, 6 + i * LINE_H, line, {
        fontSize: isTitle ? T.Font.SM : T.Font.SM,
        color: isTitle ? T.ColorHex.TEXT_GOLD : T.ColorHex.TEXT_BODY,
        fontFamily: T.FontFamily.BODY,
        fontStyle: isTitle ? 'bold' : 'normal',
        wordWrap: { width: TOOLTIP_W - 16 },
      });
      this.container.add(t);
      this.elements.push(t);
    });

    // 钳制到屏幕内
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
