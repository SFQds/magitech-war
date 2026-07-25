/**
 * 英雄详情面板 — 选中单个英雄时展开
 *
 * 显示: 大头像 + 称号 + 等级 + XP 进度条 + 属性(攻/防/速/射程/视野) + 5 技能树列表
 * 已解锁技能高亮，未解锁灰显并标注所需等级
 */
import Phaser from 'phaser';
import { Hero } from '../entities/Hero';
import { HERO_DEFS } from '../config/heroData';
import { getDisplayName } from '../config/unitData';

const PANEL_W = 220;
const PANEL_H = 280;
const XP_BAR_W = PANEL_W - 20;

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

    // 背景
    const bg = this.scene.add.rectangle(0, 0, PANEL_W, PANEL_H, 0x1a1a2e, 0.95).setOrigin(0);
    this.container.add(bg);
    this.elements.push(bg);

    // 边框
    const border = this.scene.add.graphics();
    border.lineStyle(2, 0x9b59b6, 1);
    border.strokeRoundedRect(0, 0, PANEL_W, PANEL_H, 8);
    this.container.add(border);
    this.elements.push(border);

    let y = 8;

    // 英雄名 + 称号
    const nameText = this.scene.add.text(10, y, `${getDisplayName(hero.spriteKey)}`, {
      fontSize: '16px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    });
    this.container.add(nameText);
    this.elements.push(nameText);

    const titleText = this.scene.add.text(10, y + 20, hd.title, {
      fontSize: '11px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif',
    });
    this.container.add(titleText);
    this.elements.push(titleText);
    y += 40;

    // 等级
    const levelText = this.scene.add.text(10, y, `⭐ Lv ${hero.level}/${hero.maxLevel}`, {
      fontSize: '14px', color: '#ffd700', fontFamily: 'Arial, sans-serif',
    });
    this.container.add(levelText);
    this.elements.push(levelText);
    y += 22;

    // XP 进度条
    const xpBg = this.scene.add.rectangle(10, y, XP_BAR_W, 8, 0x333333).setOrigin(0);
    this.container.add(xpBg);
    this.elements.push(xpBg);

    const xpPct = hero.level >= hero.maxLevel ? 1 : Math.max(0, Math.min(1, hero.xp / Math.max(1, hero.xpToNextLevel)));
    const xpFill = this.scene.add.rectangle(10, y, XP_BAR_W * xpPct, 8, 0x2ecc71).setOrigin(0);
    this.container.add(xpFill);
    this.elements.push(xpFill);

    const xpText = this.scene.add.text(10, y + 10,
      hero.level >= hero.maxLevel ? 'XP MAX' : `XP ${hero.xp}/${hero.xpToNextLevel}`,
      { fontSize: '10px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif' },
    );
    this.container.add(xpText);
    this.elements.push(xpText);
    y += 30;

    // 属性
    const s = hd.stats;
    const props = [
      `攻击: ${Math.round(hero.attackDamage)} (${s.dmgType})`,
      `护甲: ${hero.armor} (${hero.armorType})`,
      `移速: ${s.speed}  射程: ${s.range}`,
      `视野: ${s.sight}  HP: ${Math.round(hero.hp)}/${hero.maxHp}`,
    ];
    for (const p of props) {
      const t = this.scene.add.text(10, y, p, {
        fontSize: '11px', color: '#a0a0c0', fontFamily: 'Arial, sans-serif',
      });
      this.container.add(t);
      this.elements.push(t);
      y += 16;
    }
    y += 4;

    // 被动技能
    const passiveText = this.scene.add.text(10, y, `【被动】${hd.passive}`, {
      fontSize: '10px', color: '#9b59b6', fontFamily: 'Arial, sans-serif', wordWrap: { width: PANEL_W - 20 },
    });
    this.container.add(passiveText);
    this.elements.push(passiveText);
    y += 30;

    // 技能树 (5 级)
    const slotLevels = [1, 2, 3, 4, 5];
    for (let i = 0; i < hd.skillTree.length; i++) {
      const skill = hd.skillTree[i];
      const requiredLv = slotLevels[i];
      const unlocked = hero.level >= requiredLv;
      const color = unlocked ? '#c8a2c8' : '#555555';

      const skillText = this.scene.add.text(10, y,
        `${unlocked ? '◆' : '◇'} Lv${requiredLv} ${skill.name}`,
        { fontSize: '10px', color, fontFamily: 'Arial, sans-serif' },
      );
      this.container.add(skillText);
      this.elements.push(skillText);
      y += 14;

      const descText = this.scene.add.text(20, y, skill.description, {
        fontSize: '9px', color: unlocked ? '#7f6a8e' : '#444444',
        fontFamily: 'Arial, sans-serif', wordWrap: { width: PANEL_W - 30 },
      });
      this.container.add(descText);
      this.elements.push(descText);
      y += 14;
    }
  }

  /** 隐藏面板 */
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
