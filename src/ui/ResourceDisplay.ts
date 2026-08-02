/**
 * 资源显示 — 顶栏资源组
 *
 * SC2 风格: 水晶/工业/供给 三项分列, 每项 = 像素图标精灵 + 金色数字
 * 图标纹理缺失时回退 emoji。
 */

import Phaser from 'phaser';
import { UITheme as T } from './theme/UITheme';

const itemStyle = (color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontSize: T.Font.BASE, color, fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
});

const iconStyle = (color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontSize: '15px', color, fontFamily: T.FontFamily.BODY,
});

const ICON_PITCH = 95;
const ICON_SIZE = 18;

export class ResourceDisplay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private crystalText!: Phaser.GameObjects.Text;
  private industryText!: Phaser.GameObjects.Text;
  private supplyText!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(12, 9);
    this.container.setDepth(200);
    this.container.setScrollFactor(0);
    this._build();
  }

  /** 添加图标: 纹理存在用精灵, 否则回退 emoji */
  private _addIcon(x: number, skinKey: string, fallbackEmoji: string, emojiColor: string): void {
    if (this.scene.textures.exists(skinKey)) {
      const img = this.scene.add.image(x + ICON_SIZE / 2, 11, skinKey).setDisplaySize(ICON_SIZE, ICON_SIZE);
      this.container.add(img);
    } else {
      this.container.add(this.scene.add.text(x, 3, fallbackEmoji, iconStyle(emojiColor)));
    }
  }

  private _build(): void {
    let x = 0;
    // 水晶 (金色)
    this._addIcon(x, 'ui_icon_crystal', '💎', T.ColorHex.TEXT_GOLD);
    this.crystalText = this.scene.add.text(x + 22, 0, '0', itemStyle(T.ColorHex.TEXT_GOLD));
    this.container.add(this.crystalText);
    x += ICON_PITCH;
    // 工业
    this._addIcon(x, 'ui_icon_industry', '⚙', T.ColorHex.TEXT_BODY);
    this.industryText = this.scene.add.text(x + 22, 0, '0', itemStyle(T.ColorHex.TEXT_MAIN));
    this.container.add(this.industryText);
    x += ICON_PITCH;
    // 供给
    this._addIcon(x, 'ui_icon_supply', '👥', T.ColorHex.TEXT_BODY);
    this.supplyText = this.scene.add.text(x + 22, 0, '0/0', itemStyle(T.ColorHex.TEXT_MAIN));
    this.container.add(this.supplyText);
  }

  /** 更新资源数值 */
  update(crystal: number, industry: number, supply: number, supplyCap: number): void {
    this.crystalText.setText(String(crystal));
    this.industryText.setText(String(industry));
    const over = supply > supplyCap;
    this.supplyText.setText(`${supply}/${supplyCap}`);
    this.supplyText.setColor(over ? T.ColorHex.HP_RED : T.ColorHex.TEXT_MAIN);
  }

  destroy(): void {
    this.container.destroy();
  }
}
