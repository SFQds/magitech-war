/**
 * 主菜单场景
 *
 * 支持：阵营选择 + 行会选择 + 地图选择 + 难度选择
 */

import Phaser from 'phaser';
import { FACTION_DEFS } from '../config/unitData';
import { SoundManager } from '../utils/SoundManager';
import { GUILD_NAMES, GUILD_DESC, GUILD_HOSTILITY, VALID_GUILD_PAIRS } from '../types/data';
import type { GuildId } from '../types/data';

const MAPS = [
  { id: 'map_valley', name: '山谷', desc: '中央开阔地，两侧山脉' },
  { id: 'map_river', name: '河战', desc: '河流贯穿战场，三座桥梁' },
  { id: 'map_islands', name: '群岛', desc: '水域分隔，群岛争夺' },
];

const FACTIONS = [
  { id: 'arcane_empire', color: '#6a4fff', darkColor: '#2a1f5e' },
  { id: 'hammer_federation', color: '#ff6a2e', darkColor: '#5e2a1a' },
];

const DIFFICULTIES = [
  { id: 'easy', label: '简单' },
  { id: 'normal', label: '普通' },
  { id: 'hard', label: '困难' },
];

export class MenuScene extends Phaser.Scene {
  private selectedFactionId = 'arcane_empire';
  private currentMapIdx = 0;
  private difficultyIdx = 1; // 'normal'
  private factionCards: Phaser.GameObjects.Container[] = [];
  private mapNameText!: Phaser.GameObjects.Text;
  private mapDescText!: Phaser.GameObjects.Text;
  private diffText!: Phaser.GameObjects.Text;

  // === 行会双选 ===
  private selectedGuildIds: GuildId[] = ['mages_guild', 'alchemists_society'];
  private guildToggles: Map<string, { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics }> = new Map();
  private guildPairText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const cx = width / 2;

    // === 背景 ===
    const bg = this.add.graphics();
    bg.fillStyle(0x0d0a1a, 1);
    bg.fillRect(0, 0, width, height);
    bg.setDepth(-1);

    // === 标题 ===
    this.add.text(cx, 40, '魔导工业革命', {
      fontSize: '34px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    this.add.text(cx, 72, 'Magitech Industrial Revolution', {
      fontSize: '12px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // === 阵营选择 ===
    this.add.text(cx, 105, '— 选择阵营 —', {
      fontSize: '14px', color: '#9b7db8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.factionCards = [];
    FACTIONS.forEach((fi, idx) => {
      const fd = FACTION_DEFS[fi.id];
      const fx = cx - 100 + idx * 200;
      const fy = 135;
      const cardW = 170;
      const cardH = 120;

      const container = this.add.container(0, 0);
      const cardBg = this.add.graphics();
      this.drawFactionCard(cardBg, fx, fy, cardW, cardH, fi, false);
      container.add(cardBg);

      const nameText = this.add.text(fx + cardW / 2, fy + 22, fd.name, {
        fontSize: '16px', color: fi.color, fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5);
      container.add(nameText);

      const econText = this.add.text(fx + 8, fy + 44, `经济: ${fd.econPassive}`, {
        fontSize: '10px', color: '#a0a0c0', fontFamily: 'Arial, sans-serif', wordWrap: { width: 154 },
      });
      container.add(econText);
      const milText = this.add.text(fx + 8, fy + 64, `军事: ${fd.milPassive}`, {
        fontSize: '10px', color: '#a0a0c0', fontFamily: 'Arial, sans-serif', wordWrap: { width: 154 },
      });
      container.add(milText);

      // 点击热区
      const hitZone = this.add.rectangle(fx, fy, cardW, cardH, 0xffffff, 0)
        .setOrigin(0).setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => {
        this.selectedFactionId = fi.id;
        this.updateFactionCards();
      });
      hitZone.on('pointerover', () => {
        if (this.selectedFactionId !== fi.id) {
          cardBg.clear();
          this.drawFactionCard(cardBg, fx, fy, cardW, cardH, fi, true);
        }
      });
      hitZone.on('pointerout', () => {
        if (this.selectedFactionId !== fi.id) {
          cardBg.clear();
          this.drawFactionCard(cardBg, fx, fy, cardW, cardH, fi, false);
        }
      });
      container.add(hitZone);
      this.factionCards.push(container);
    });

    // === 行会选择（双选） ===
    this.add.text(cx, 280, '— 选择行会组合 —', {
      fontSize: '14px', color: '#9b7db8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    const GUILD_IDS: GuildId[] = ['mages_guild', 'mechanists_guild', 'alchemists_society', 'void_institute'];
    const guildColors: Record<string, string> = {
      mages_guild: '#6e8fff',
      mechanists_guild: '#ff9a3c',
      alchemists_society: '#3cd08f',
      void_institute: '#b85adb',
    };
    const guildCardW = 150;
    const guildCardH = 52;
    const guildStartX = cx - (GUILD_IDS.length * (guildCardW + 8)) / 2 + guildCardW / 2;
    const guildY = 308;

    GUILD_IDS.forEach((gid, gi) => {
      const gx = guildStartX + gi * (guildCardW + 8);
      const name = GUILD_NAMES[gid];

      const gBg = this.add.graphics();
      const gText = this.add.text(gx, guildY + guildCardH / 2, name, {
        fontSize: '13px', color: '#ffffff', fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5);

      const hitRect = this.add.rectangle(
        gx - guildCardW / 2, guildY, guildCardW, guildCardH,
        0xffffff, 0,
      ).setOrigin(0).setInteractive({ useHandCursor: true });

      hitRect.on('pointerdown', () => this.toggleGuild(gid));
      hitRect.on('pointerover', () => {
        this.guildPairText.setText(GUILD_DESC[gid]);
      });
      hitRect.on('pointerout', () => {
        this.updateGuildPairText();
      });

      this.guildToggles.set(gid, { text: gText, bg: gBg });
      this.drawGuildButton(gBg, gx, guildY, guildCardW, guildCardH, gid, false);
    });

    this.guildPairText = this.add.text(cx, guildY + guildCardH + 14, '', {
      fontSize: '11px', color: '#9b7db8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    this.updateGuildAll();
    this.updateGuildPairText();

    // === 地图选择 ===
    const mapY = 390;
    this.add.text(cx, mapY, '— 选择地图 —', {
      fontSize: '14px', color: '#9b7db8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    const leftArrow = this.add.text(cx - 140, mapY + 28, '◀', {
      fontSize: '22px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.mapNameText = this.add.text(cx, mapY + 28, '', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    this.mapDescText = this.add.text(cx, mapY + 50, '', {
      fontSize: '11px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    const rightArrow = this.add.text(cx + 140, mapY + 28, '▶', {
      fontSize: '22px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    leftArrow.on('pointerdown', () => {
      this.currentMapIdx = (this.currentMapIdx - 1 + MAPS.length) % MAPS.length;
      this.updateMapDisplay();
    });
    rightArrow.on('pointerdown', () => {
      this.currentMapIdx = (this.currentMapIdx + 1) % MAPS.length;
      this.updateMapDisplay();
    });

    // === 难度选择 ===
    const diffY = mapY + 80;
    this.add.text(cx, diffY, '— AI 难度 —', {
      fontSize: '14px', color: '#9b7db8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    this.diffText = this.add.text(cx, diffY + 28, '', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    const diffLeft = this.add.text(cx - 80, diffY + 28, '◀', {
      fontSize: '20px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const diffRight = this.add.text(cx + 80, diffY + 28, '▶', {
      fontSize: '20px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    diffLeft.on('pointerdown', () => {
      this.difficultyIdx = (this.difficultyIdx - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
      this.updateDiffDisplay();
    });
    diffRight.on('pointerdown', () => {
      this.difficultyIdx = (this.difficultyIdx + 1) % DIFFICULTIES.length;
      this.updateDiffDisplay();
    });

    // === 开始按钮 ===
    const startY = height - 70;
    const startBtn = this.add.text(cx, startY, '▶  开始游戏', {
      fontSize: '22px', color: '#ffffff', backgroundColor: '#4a3060',
      padding: { x: 40, y: 12 }, fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => startBtn.setStyle({ backgroundColor: '#5e3d78' }));
    startBtn.on('pointerout', () => startBtn.setStyle({ backgroundColor: '#4a3060' }));
    startBtn.on('pointerdown', () => {
      SoundManager.init();
      const mapId = MAPS[this.currentMapIdx].id;
      const diff = DIFFICULTIES[this.difficultyIdx].id;
      this.scene.start('GameScene', {
        map: mapId,
        playerFaction: this.selectedFactionId,
        aiDifficulty: diff,
        playerGuilds: [...this.selectedGuildIds],
      });
    });

    // === 初始化显示 ===
    this.updateFactionCards();
    this.updateMapDisplay();
    this.updateDiffDisplay();

    // 版本号
    this.add.text(width - 10, height - 10, 'v0.3.0', {
      fontSize: '12px', color: '#3a2a4a', fontFamily: 'Arial, sans-serif',
    }).setOrigin(1, 1);
  }

  private drawFactionCard(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    fi: { id: string; color: string; darkColor: string },
    hover: boolean,
  ): void {
    const alpha = hover ? 0.45 : 0.3;
    g.fillStyle(Phaser.Display.Color.HexStringToColor(fi.darkColor).color, alpha);
    g.fillRoundedRect(x, y, w, h, 8);
    const borderColor = this.selectedFactionId === fi.id ? Phaser.Display.Color.HexStringToColor(fi.color).color : 0x3a2a5a;
    const borderAlpha = this.selectedFactionId === fi.id ? 1 : 0.6;
    g.lineStyle(this.selectedFactionId === fi.id ? 2 : 1, borderColor, borderAlpha);
    g.strokeRoundedRect(x, y, w, h, 8);
  }

  private updateFactionCards(): void {
    this.factionCards.forEach((container, i) => {
      const fi = FACTIONS[i];
      const cardBg = container.getAt(0) as Phaser.GameObjects.Graphics;
      cardBg.clear();
      const fx = i === 0 ? this.cameras.main.width / 2 - 100 : this.cameras.main.width / 2 + 100;
      this.drawFactionCard(cardBg, fx, 135, 170, 120, fi, false);
    });
  }

  // ===== 行会选择逻辑 =====

  /** 点击行会卡片切换选中状态 */
  private toggleGuild(guildId: GuildId): void {
    const idx = this.selectedGuildIds.indexOf(guildId);
    if (idx >= 0) {
      // 已选中 → 取消
      this.selectedGuildIds.splice(idx, 1);
    } else {
      // 未选中 → 检查是否需要替换
      if (this.selectedGuildIds.length >= 2) {
        // 替换第二个行会
        this.selectedGuildIds[1] = guildId;
      } else {
        this.selectedGuildIds.push(guildId);
      }
    }

    // 自动修正：检查行会组合是否有效
    if (this.selectedGuildIds.length === 2) {
      const [a, b] = this.selectedGuildIds;
      const isHostile = GUILD_HOSTILITY[a]?.includes(b) || GUILD_HOSTILITY[b]?.includes(a);
      if (isHostile) {
        // 替换为炼金协会（与任意行会兼容）
        this.selectedGuildIds = [a, 'alchemists_society'];
      }
      // 检查是否在有效组合中
      const isValid = VALID_GUILD_PAIRS.some(
        ([x, y]) => (x === this.selectedGuildIds[0] && y === this.selectedGuildIds[1])
          || (x === this.selectedGuildIds[1] && y === this.selectedGuildIds[0]),
      );
      if (!isValid) {
        this.selectedGuildIds = ['mages_guild', 'alchemists_society']; // 默认组合
      }
    }

    this.updateGuildAll();
    this.updateGuildPairText();
  }

  private drawGuildButton(
    g: Phaser.GameObjects.Graphics,
    cx: number, y: number, w: number, h: number,
    guildId: GuildId,
    hover: boolean,
  ): void {
    const colors: Record<string, number> = {
      mages_guild: 0x6e8fff,
      mechanists_guild: 0xff9a3c,
      alchemists_society: 0x3cd08f,
      void_institute: 0xb85adb,
    };
    const selected = this.selectedGuildIds.includes(guildId);
    const alpha = selected ? 0.5 : hover ? 0.35 : 0.2;
    const borderColor = selected ? colors[guildId] : 0x3a2a5a;
    const borderAlpha = selected ? 1 : 0.5;

    g.fillStyle(colors[guildId], alpha);
    g.fillRoundedRect(cx - w / 2, y, w, h, 6);
    g.lineStyle(selected ? 2 : 1, borderColor, borderAlpha);
    g.strokeRoundedRect(cx - w / 2, y, w, h, 6);
  }

  private updateGuildAll(): void {
    const GUILD_IDS: GuildId[] = ['mages_guild', 'mechanists_guild', 'alchemists_society', 'void_institute'];
    const guildCardW = 150;
    const guildStartX = this.cameras.main.width / 2 - (GUILD_IDS.length * (guildCardW + 8)) / 2 + guildCardW / 2;
    const guildY = 308;

    GUILD_IDS.forEach((gid, gi) => {
      const entry = this.guildToggles.get(gid);
      if (!entry) return;
      entry.bg.clear();
      const gx = guildStartX + gi * (guildCardW + 8);
      this.drawGuildButton(entry.bg, gx, guildY, guildCardW, 52, gid, false);

      // 检查敌对行会
      const hostility = GUILD_HOSTILITY[gid];
      const hasHostileSelected = hostility?.some(h => this.selectedGuildIds.includes(h));
      // 既不可选原因：已经选中2个且都不是此gid，或者敌对行会已选中
      const locked = (this.selectedGuildIds.length >= 2 && !this.selectedGuildIds.includes(gid))
        || (hasHostileSelected ?? false);
      const selected = this.selectedGuildIds.includes(gid);

      entry.text.setAlpha(locked && !selected ? 0.3 : 1);
      entry.text.setColor(selected ? '#ffffff' : locked ? '#555555' : '#d0d0d0');
    });
  }

  private updateGuildPairText(): void {
    if (this.selectedGuildIds.length === 2) {
      const [a, b] = this.selectedGuildIds;
      const comboName = this.getComboName(a, b);
      this.guildPairText.setText(`${GUILD_NAMES[a]} + ${GUILD_NAMES[b]}  【${comboName}】`);
    } else if (this.selectedGuildIds.length === 1) {
      this.guildPairText.setText(`${GUILD_NAMES[this.selectedGuildIds[0]]} — 请选择第二个行会`);
    } else {
      this.guildPairText.setText('请选择1-2个行会');
    }
  }

  private getComboName(a: GuildId, b: GuildId): string {
    const key = [a, b].sort().join('+');
    const combos: Record<string, string> = {
      'alchemists_society+mages_guild': '学术正统',
      'mages_guild+void_institute': '禁忌探索',
      'alchemists_society+mechanists_guild': '工业化学',
      'mechanists_guild+void_institute': '疯狂工程',
      'alchemists_society+void_institute': '嬗变极限',
    };
    return combos[key] ?? '未知组合';
  }

  private updateMapDisplay(): void {
    const m = MAPS[this.currentMapIdx];
    this.mapNameText.setText(m.name);
    this.mapDescText.setText(m.desc);
  }

  private updateDiffDisplay(): void {
    this.diffText.setText(DIFFICULTIES[this.difficultyIdx].label);
  }
}