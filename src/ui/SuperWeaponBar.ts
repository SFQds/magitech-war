/**
 * 超级武器栏 — 小地图上方悬浮竖排 (4 槽超武按钮)
 *
 * 显示冷却进度条+水晶消耗，点击进入瞄准模式。
 * 瞄准模式下再次点击地图激活超武。
 * 快捷键 1/2/3/4 对应 4 个超武槽。
 */
import Phaser from 'phaser';
import { UITheme as T } from './theme/UITheme';
import { drawButton, drawButtonSkin, setButtonSkinState } from './theme/UIWidget';
import type { ButtonState, SkinButtonOptions } from './theme/UIWidget';
import { SuperWeaponSystem, SUPER_WEAPONS, GUILD_SUPER_WEAPON } from '../systems/SuperWeaponSystem';
import type { SuperWeaponState } from '../systems/SuperWeaponSystem';

const BTN_SIZE = 44;
const BTN_GAP = 6;

export interface SuperWeaponButton {
  weaponId: string;
  name: string;
  cooldown: number;
  crystalCost: number;
  available: boolean;
  active: boolean;
  cooldownRemaining: number;
}

export class SuperWeaponBar {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private playerIndex: number;
  private buttons: { bg: Phaser.GameObjects.Graphics | Phaser.GameObjects.NineSlice; skinOpts: SkinButtonOptions; nameText: Phaser.GameObjects.Text; cdText: Phaser.GameObjects.Text; hitArea: Phaser.GameObjects.Rectangle; weaponId: string }[] = [];
  private _onActivate: ((weaponId: string, tileX: number, tileY: number) => void) | null = null;
  /** 当前瞄准中的超武 ID（null=未瞄准） */
  private _aimingWeaponId: string | null = null;
  private _aimHint: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, playerIndex: number, x: number, y: number) {
    this.scene = scene;
    this.playerIndex = playerIndex;
    this.container = scene.add.container(x, y);
    this.container.setDepth(160);
    this.container.setScrollFactor(0);

    // 瞄准提示文字（初始隐藏）
    this._aimHint = scene.add.text(0, -20, '', {
      fontSize: '12px', color: T.ColorHex.WARN, backgroundColor: T.ColorHex.CARD_BG,
      padding: { x: 8, y: 4 }, fontFamily: T.FontFamily.BODY,
    }).setOrigin(0.5).setAlpha(0);
    this.container.add(this._aimHint);

    this._buildButtons();
  }

  /** 设置激活回调（携带目标坐标，避免依赖外部 bypass 字段） */
  onActivate(cb: (weaponId: string, tileX: number, tileY: number) => void): void { this._onActivate = cb; }

  private _buildButtons(): void {
    const states = SuperWeaponSystem.getStates(this.playerIndex);
    let i = 0;
    for (const state of states) {
      const def = SUPER_WEAPONS[state.weaponId];
      if (!def) continue;
      const bx = 0;
      const by = i * (BTN_SIZE + BTN_GAP); // 竖排

      const skinOpts: SkinButtonOptions = {
        x: bx, y: by, w: BTN_SIZE, h: BTN_SIZE,
        skinNormal: 'skin_btn_normal', skinHover: 'skin_btn_hover',
        skinActive: 'skin_btn_active', skinDisabled: 'skin_btn_normal', corner: 8,
      };
      let bg: Phaser.GameObjects.Graphics | Phaser.GameObjects.NineSlice;
      if (this.scene.textures.exists('skin_btn_normal')) {
        bg = drawButtonSkin(this.scene, skinOpts);
      } else {
        bg = this.scene.add.graphics();
        this._drawButton(bg, skinOpts, false, false);
      }
      this.container.add(bg);

      const nameText = this.scene.add.text(bx + BTN_SIZE / 2, by + 8, def.name.slice(0, 4), {
        fontSize: '10px', color: T.ColorHex.TEXT_MAIN, fontFamily: T.FontFamily.BODY,
      }).setOrigin(0.5);
      this.container.add(nameText);

      const cdText = this.scene.add.text(bx + BTN_SIZE / 2, by + BTN_SIZE / 2 + 6, '', {
        fontSize: '11px', color: T.ColorHex.TEXT_GOLD, fontFamily: T.FontFamily.BODY,
      }).setOrigin(0.5);
      this.container.add(cdText);

      // 热键数字标
      const hotkeyText = this.scene.add.text(bx + 4, by + 2, String(i + 1), {
        fontSize: '9px', color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
      });
      this.container.add(hotkeyText);

      const hitArea = this.scene.add.rectangle(bx, by, BTN_SIZE, BTN_SIZE, 0xffffff, 0)
        .setOrigin(0).setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', () => this._onClick(state.weaponId));
      hitArea.on('pointerover', () => this._drawButton(bg, skinOpts, true, this._aimingWeaponId === state.weaponId));
      hitArea.on('pointerout', () => this._drawButton(bg, skinOpts, false, this._aimingWeaponId === state.weaponId));
      this.container.add(hitArea);

      this.buttons.push({ bg, skinOpts, nameText, cdText, hitArea, weaponId: state.weaponId });
      i++;
    }
  }

  private _drawButton(bg: Phaser.GameObjects.Graphics | Phaser.GameObjects.NineSlice, skinOpts: SkinButtonOptions, hover: boolean, aiming: boolean): void {
    const state: ButtonState = aiming ? 'active' : hover ? 'hover' : 'normal';
    if (typeof (bg as Phaser.GameObjects.NineSlice).setTexture === 'function') {
      setButtonSkinState(bg as Phaser.GameObjects.NineSlice, skinOpts, state);
    } else {
      drawButton(this.scene, bg as Phaser.GameObjects.Graphics, { x: skinOpts.x, y: skinOpts.y, w: skinOpts.w, h: skinOpts.h, state });
    }
  }

  private _onClick(weaponId: string): void {
    if (this._aimingWeaponId === weaponId) {
      // 取消瞄准
      this._aimingWeaponId = null;
      this._aimHint.setAlpha(0);
      this._redrawAll();
      return;
    }
    // 检查是否可用
    const states = SuperWeaponSystem.getStates(this.playerIndex);
    const state = states.find(s => s.weaponId === weaponId);
    if (!state || state.cooldownTimer > 0 || state.active) return;
    // 进入瞄准模式
    this._aimingWeaponId = weaponId;
    const def = SUPER_WEAPONS[weaponId];
    this._aimHint.setText(`🎯 ${def.name} — 点击地图选择目标`);
    this._aimHint.setAlpha(1);
    this._redrawAll();
  }

  /** 瞄准模式下点击地图坐标，激活超武。tileX/tileY 经回调直接传入命令，不依赖外部 bypass 字段 */
  confirmTarget(tileX: number, tileY: number): boolean {
    if (!this._aimingWeaponId) return false;
    const weaponId = this._aimingWeaponId;
    this._aimingWeaponId = null;
    this._aimHint.setAlpha(0);
    this._redrawAll();
    if (this._onActivate) this._onActivate(weaponId, tileX, tileY);
    return true;
  }

  /** 取消瞄准 */
  cancelAim(): void {
    if (!this._aimingWeaponId) return;
    this._aimingWeaponId = null;
    this._aimHint.setAlpha(0);
    this._redrawAll();
  }

  get aimingWeaponId(): string | null { return this._aimingWeaponId; }

  private _redrawAll(): void {
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      this._drawButton(b.bg, b.skinOpts, false, this._aimingWeaponId === b.weaponId);
    }
  }

  /** 每帧刷新冷却显示 */
  update(): void {
    const states = SuperWeaponSystem.getStates(this.playerIndex);
    for (const b of this.buttons) {
      const state = states.find(s => s.weaponId === b.weaponId);
      if (!state) continue;
      const def = SUPER_WEAPONS[b.weaponId];
      if (state.active) {
        b.cdText.setText(`${Math.ceil(state.activeTimer)}s`);
        b.cdText.setColor(T.ColorHex.HP_GREEN);
      } else if (state.cooldownTimer > 0) {
        b.cdText.setText(`${Math.ceil(state.cooldownTimer)}s`);
        b.cdText.setColor(T.ColorHex.WARN);
      } else {
        b.cdText.setText(`💎${def.crystalCost}`);
        b.cdText.setColor(T.ColorHex.TEXT_GOLD);
      }
    }
  }

  /** 按热键激活（1-4 对应槽位） */
  hotkey(slot: number): void {
    if (slot < 1 || slot > this.buttons.length) return;
    this._onClick(this.buttons[slot - 1].weaponId);
  }

  destroy(): void {
    this.container.destroy();
  }
}