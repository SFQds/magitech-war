/**
 * 英雄详情面板 — 选中英雄时覆盖于 SelectionPanel 上方 (中段区)
 *
 * 显示: 大头像 + 称号 + 等级星 + XP 发光条 + 属性 + 被动 + 5级技能树
 * 取自 UITheme, 描边用紫色, 已解锁技能金色, 未解锁灰显。
 */
import Phaser from 'phaser';
import { Hero } from '../entities/Hero';
import { HERO_DEFS } from '../config/heroData';
import { getDisplayName } from '../config/unitData';
import { UITheme as T } from './theme/UITheme';
import { drawPanelSkin } from './theme/UIWidget';

const PANEL_W = 505;
const PANEL_H = 130;
const XP_BAR_W = 140;

export class HeroPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private elements: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);
    this.container.setDepth(155);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);
  }

  /** 显示英雄详情 */
  show(hero: Hero): void {
    this._clear();
    this.container.setVisible(true);

    const hd = HERO_DEFS[hero.spriteKey];
    if (!hd) return;

    // 背景 (皮肤化: 有贴图用 NineSlice, 否则紫色描边面板)
    const bg = drawPanelSkin(this.scene, { x: 0, y: 0, w: PANEL_W, h: PANEL_H, skinKey: 'skin_panel_console', corner: 14 });
    this.container.add(bg);
    this.elements.push(bg);

    // 头像 (左侧, 64x64)
    if (this.scene.textures.exists(hero.spriteKey)) {
      // 雕花相框底板 (中央紫色衬底, 置于头像之下)
      if (this.scene.textures.exists('ui_frame_portrait')) {
        const frame = this.scene.add.image(4, 4, 'ui_frame_portrait').setDisplaySize(72, 72).setOrigin(0);
        this.container.add(frame);
        this.elements.push(frame);
      }
      const portrait = this.scene.add.image(8, 8, hero.spriteKey).setDisplaySize(64, 64).setOrigin(0);
      this.container.add(portrait);
      this.elements.push(portrait);
      // 无贴图时回退代码金边
      if (!this.scene.textures.exists('ui_frame_portrait')) {
        const pf = this.scene.add.graphics();
        pf.lineStyle(1, T.Color.ACCENT_GOLD, 0.7);
        pf.strokeRoundedRect(8, 8, 64, 64, 4);
        this.container.add(pf);
        this.elements.push(pf);
      }
    }

    // 名称 + 称号 (头像右侧)
    const nameText = this.scene.add.text(80, 4, getDisplayName(hero.spriteKey), {
      fontSize: T.Font.H2, color: T.ColorHex.TEXT_MAIN, fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
    });
    this.container.add(nameText);
    this.elements.push(nameText);

    const titleText = this.scene.add.text(80, 26, hd.title, {
      fontSize: T.Font.SM, color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.BODY,
    });
    this.container.add(titleText);
    this.elements.push(titleText);

    // 等级星 (右侧) + XP 条
    const levelText = this.scene.add.text(PANEL_W - 8, 4, `★ Lv ${hero.level}/${hero.maxLevel}`, {
      fontSize: T.Font.BASE, color: T.ColorHex.TEXT_GOLD, fontFamily: T.FontFamily.BODY, fontStyle: 'bold',
    }).setOrigin(1, 0);
    this.container.add(levelText);
    this.elements.push(levelText);

    const xpPct = hero.level >= hero.maxLevel ? 1 : Math.max(0, Math.min(1, hero.xp / Math.max(1, hero.xpToNextLevel)));
    const xpBg = this.scene.add.rectangle(PANEL_W - 8 - XP_BAR_W, 28, XP_BAR_W, 6, 0x333333).setOrigin(0);
    const xpFill = this.scene.add.rectangle(PANEL_W - 8 - XP_BAR_W, 28, XP_BAR_W * xpPct, 6, T.Color.ACCENT_GOLD).setOrigin(0);
    this.container.add(xpBg);
    this.container.add(xpFill);
    this.elements.push(xpBg);
    this.elements.push(xpFill);

    const xpText = this.scene.add.text(PANEL_W - 8, 34,
      hero.level >= hero.maxLevel ? 'XP MAX' : `XP ${hero.xp}/${hero.xpToNextLevel}`,
      { fontSize: T.Font.TINY, color: T.ColorHex.TEXT_DIM, fontFamily: T.FontFamily.MONO },
    ).setOrigin(1, 0);
    this.container.add(xpText);
    this.elements.push(xpText);

    // 属性 (头像下方, 两列)
    const s = hd.stats;
    const propsLeft = [
      `攻 ${Math.round(hero.attackDamage)} (${s.dmgType})`,
      `护 ${hero.armor} (${hero.armorType})`,
    ];
    const propsRight = [
      `速 ${s.speed}  程 ${s.range}`,
      `野 ${s.sight}  HP ${Math.round(hero.hp)}/${Math.round(hero.maxHp)}`,
    ];
    let py = 76;
    for (let i = 0; i < propsLeft.length; i++) {
      const tl = this.scene.add.text(80, py, propsLeft[i], {
        fontSize: T.Font.SM, color: T.ColorHex.TEXT_BODY, fontFamily: T.FontFamily.BODY,
      });
      const tr = this.scene.add.text(280, py, propsRight[i], {
        fontSize: T.Font.SM, color: T.ColorHex.TEXT_BODY, fontFamily: T.FontFamily.BODY,
      });
      this.container.add(tl);
      this.container.add(tr);
      this.elements.push(tl);
      this.elements.push(tr);
      py += 16;
    }

    // 被动技能 (底部一行, 紫色)
    const passiveText = this.scene.add.text(8, PANEL_H - 18, `【被动】${hd.passive}`, {
      fontSize: T.Font.TINY, color: T.ColorHex.ACCENT_PURPLE, fontFamily: T.FontFamily.BODY,
      wordWrap: { width: PANEL_W - 16 },
    });
    this.container.add(passiveText);
    this.elements.push(passiveText);

    // 技能树标记 (底部右侧, 5 个 ◆/◇, 表示解锁状态; 详细技能在命令卡区显示)
    const slotLevels = [1, 2, 3, 4, 5];
    let sx = PANEL_W - 8 - 5 * 14;
    for (let i = 0; i < hd.skillTree.length; i++) {
      const unlocked = hero.level >= slotLevels[i];
      const mark = this.scene.add.text(sx, PANEL_H - 18, unlocked ? '◆' : '◇', {
        fontSize: T.Font.SM, color: unlocked ? T.ColorHex.ACCENT_GOLD : T.ColorHex.DISABLED, fontFamily: T.FontFamily.BODY,
      });
      this.container.add(mark);
      this.elements.push(mark);
      sx += 14;
    }
  }

  hide(): void {
    this._clear();
    this.container.setVisible(false);
  }

  private _clear(): void {
    for (const el of this.elements) el.destroy();
    this.elements = [];
  }

  destroy(): void {
    this._clear();
    this.container.destroy();
  }
}
