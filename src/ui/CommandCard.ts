/**
 * 命令卡 — 右段建造/训练命令按钮 (SC2 控制台右段)
 *
 * 每个按钮: 精灵缩略图 + 名称 + 费用 + 热键徽章
 * 取自 UITheme, 描金槽 + 紫色 hover 描边。
 * 起点坐标由构造参数传入 (适配三段式布局), 不再硬编码底部位置。
 */

import Phaser from 'phaser';
import { UITheme as T } from './theme/UITheme';
import { drawButton, drawButtonSkin, setButtonSkinState, makeHitArea, drawOuterGlow } from './theme/UIWidget';
import type { ButtonState } from './theme/UIWidget';

export interface CommandButton {
  label: string;
  cost: string;
  spriteKey?: string;
  callback: () => void;
  disabled?: boolean;
  /** 热键字母（如 'S'/'H'/'A'），显示在按钮右上角徽章 */
  hotkey?: string;
  /** hover tooltip 内容（字符串数组，每行一条），不传则不显示 */
  tooltipLines?: string[];
}

const BTN_W = 64;
const BTN_H = 64;
const ICON_SIZE = 30;
const GAP = 6;
/** 每行最多按钮数 (右段宽度约 585, 可放 8-9 个, 超出换行) */
const MAX_PER_ROW = 8;

export class CommandCard {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private startX: number;
  private startY: number;
  /** hover 回调 (lines, x, y) | null=隐藏 */
  private _onHover: ((lines: string[] | null, x: number, y: number) => void) | null = null;

  constructor(scene: Phaser.Scene, startX = 695, startY = 590) {
    this.scene = scene;
    this.startX = startX;
    this.startY = startY;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setScrollFactor(0);
  }

  onHover(cb: (lines: string[] | null, x: number, y: number) => void): void {
    this._onHover = cb;
  }

  setCommands(commands: CommandButton[]): void {
    this.container.removeAll(true);

    commands.forEach((cmd, i) => {
      const col = i % MAX_PER_ROW;
      const row = Math.floor(i / MAX_PER_ROW);
      const x = this.startX + col * (BTN_W + GAP);
      const y = this.startY + row * (BTN_H + GAP);
      const isDisabled = cmd.disabled === true;

      // 按钮背景: 有皮肤用 NineSlice, 否则 Graphics 纯色
      const skinOpts = { x, y, w: BTN_W, h: BTN_H, skinNormal: 'skin_btn_normal', skinHover: 'skin_btn_hover', skinActive: 'skin_btn_active', skinDisabled: 'skin_btn_normal', corner: 8 };
      let bgNs: Phaser.GameObjects.NineSlice | null = null;
      let bgG: Phaser.GameObjects.Graphics | null = null;
      const drawBg = (state: ButtonState) => {
        if (bgNs) { setButtonSkinState(bgNs, skinOpts, state); return; }
        if (bgG) drawButton(this.scene, bgG, { x, y, w: BTN_W, h: BTN_H, state });
      };
      if (this.scene.textures.exists('skin_btn_normal')) {
        bgNs = drawButtonSkin(this.scene, { ...skinOpts, state: isDisabled ? 'disabled' : 'normal' }) as Phaser.GameObjects.NineSlice;
        this.container.add(bgNs);
      } else {
        bgG = this.scene.add.graphics();
        drawButton(this.scene, bgG, { x, y, w: BTN_W, h: BTN_H, state: isDisabled ? 'disabled' : 'normal' });
        this.container.add(bgG);
      }

      // 图标卡槽底 (符文蚀刻槽, 有贴图才显示)
      if (cmd.spriteKey && this.scene.textures.exists('skin_card')) {
        const slot = this.scene.add.nineslice(x + BTN_W / 2 - 19, y - 3, 'skin_card', undefined, 38, 38, 8, 8, 8, 8).setOrigin(0);
        if (isDisabled) slot.setAlpha(0.5);
        this.container.add(slot);
      }

      // 精灵缩略图 (灰显降 alpha)
      if (cmd.spriteKey && this.scene.textures.exists(cmd.spriteKey)) {
        const icon = this.scene.add.image(x + BTN_W / 2, y + 16, cmd.spriteKey);
        icon.setDisplaySize(ICON_SIZE, ICON_SIZE);
        if (isDisabled) icon.setAlpha(0.35).setTint(0x666666);
        this.container.add(icon);
      }

      // 名称
      const nameText = this.scene.add.text(x + BTN_W / 2, y + 40, cmd.label, {
        fontSize: T.Font.TINY, color: isDisabled ? T.ColorHex.DISABLED : T.ColorHex.TEXT_MAIN,
        fontFamily: T.FontFamily.BODY, align: 'center',
      }).setOrigin(0.5);
      this.container.add(nameText);

      // 费用 (左上, 金色)
      const costText = this.scene.add.text(x + 3, y + 2, cmd.cost, {
        fontSize: T.Font.MICRO, color: isDisabled ? T.ColorHex.DISABLED : T.ColorHex.TEXT_GOLD,
        fontFamily: T.FontFamily.MONO,
      });
      this.container.add(costText);

      // 热键徽章 (右上角)
      if (cmd.hotkey) {
        const hotkeyText = this.scene.add.text(x + BTN_W - 4, y + 2, cmd.hotkey, {
          fontSize: T.Font.TINY, color: isDisabled ? T.ColorHex.DISABLED : T.ColorHex.ACCENT_PURPLE,
          fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
        }).setOrigin(1, 0);
        this.container.add(hotkeyText);
      }

      // 点击热区 + hover 重绘 (悬停时金色外发光)
      if (!isDisabled) {
        const glowG = this.scene.add.graphics();
        this.container.add(glowG);
        const hitArea = makeHitArea(this.scene, x, y, BTN_W, BTN_H);
        hitArea.on('pointerdown', cmd.callback);
        hitArea.on('pointerover', (pointer: Phaser.Input.Pointer) => {
          drawBg('hover');
          glowG.clear();
          drawOuterGlow(glowG, x - 2, y - 2, BTN_W + 4, BTN_H + 4, T.Color.ACCENT_GOLD);
          if (this._onHover && cmd.tooltipLines) {
            this._onHover(cmd.tooltipLines, pointer.x + 12, pointer.y + 12);
          }
        });
        hitArea.on('pointerout', () => {
          drawBg('normal');
          glowG.clear();
          if (this._onHover) this._onHover(null, 0, 0);
        });
        this.container.add(hitArea);
      }
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
