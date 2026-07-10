/**
 * 主菜单场景
 *
 * 支持：阵营选择 + 地图选择 + 难度选择
 */

import Phaser from 'phaser';
import { FACTION_DEFS } from '../config/unitData';
import { SoundManager } from '../utils/SoundManager';

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

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    // === 背景 ===
    const bg = this.add.graphics();
    bg.fillStyle(0x0d0a1a, 1);
    bg.fillRect(0, 0, width, height);
    bg.setDepth(-1);

    // === 标题 ===
    this.add.text(cx, 50, '魔导工业革命', {
      fontSize: '38px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.add.text(cx, 90, 'Magitech Industrial Revolution', {
      fontSize: '14px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // === 阵营选择 ===
    this.add.text(cx, 140, '— 选择阵营 —', {
      fontSize: '14px', color: '#9b7db8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.factionCards = [];
    FACTIONS.forEach((fi, idx) => {
      const fd = FACTION_DEFS[fi.id];
      const fx = cx - 100 + idx * 200;
      const fy = 210;
      const cardW = 170;
      const cardH = 140;

      const container = this.add.container(0, 0);
      const cardBg = this.add.graphics();
      this.drawFactionCard(cardBg, fx, fy, cardW, cardH, fi, false);
      container.add(cardBg);

      // 阵营名
      const nameText = this.add.text(fx + cardW / 2, fy + 28, fd.name, {
        fontSize: '18px', color: fi.color, fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5);
      container.add(nameText);

      // 被动描述
      const econText = this.add.text(fx + 10, fy + 55, `经济: ${fd.econPassive}`, {
        fontSize: '11px', color: '#a0a0c0', fontFamily: 'Arial, sans-serif', wordWrap: { width: 150 },
      });
      container.add(econText);
      const milText = this.add.text(fx + 10, fy + 75, `军事: ${fd.milPassive}`, {
        fontSize: '11px', color: '#a0a0c0', fontFamily: 'Arial, sans-serif', wordWrap: { width: 150 },
      });
      container.add(milText);

      // 起始单位
      const units = fd.startingUnits.map(([uid, n]) => `${n}×工兵`).join('/');
      const startText = this.add.text(fx + 10, fy + 95, `起始: ${units}`, {
        fontSize: '10px', color: '#7878a0', fontFamily: 'Arial, sans-serif',
      });
      container.add(startText);

      // 点击热区
      const hitZone = this.add.rectangle(fx, fy, cardW, cardH, 0xffffff, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });

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

    // === 地图选择 ===
    const mapY = 370;
    this.add.text(cx, mapY, '— 选择地图 —', {
      fontSize: '14px', color: '#9b7db8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    const leftArrow = this.add.text(cx - 140, mapY + 30, '◀', {
      fontSize: '24px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.mapNameText = this.add.text(cx, mapY + 30, '', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.mapDescText = this.add.text(cx, mapY + 55, '', {
      fontSize: '12px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    const rightArrow = this.add.text(cx + 140, mapY + 30, '▶', {
      fontSize: '24px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
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
    const diffY = mapY + 90;
    this.add.text(cx, diffY, '— AI 难度 —', {
      fontSize: '14px', color: '#9b7db8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.diffText = this.add.text(cx, diffY + 30, '', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    const diffLeft = this.add.text(cx - 80, diffY + 30, '◀', {
      fontSize: '22px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const diffRight = this.add.text(cx + 80, diffY + 30, '▶', {
      fontSize: '22px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
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
    const startY = height - 80;
    const startBtn = this.add.text(cx, startY, '▶  开始游戏', {
      fontSize: '24px',
      color: '#ffffff',
      backgroundColor: '#4a3060',
      padding: { x: 40, y: 14 },
      fontFamily: 'Arial, sans-serif',
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
      });
      this.scene.start('HUDScene');
    });

    // === 初始化显示 ===
    this.updateFactionCards();
    this.updateMapDisplay();
    this.updateDiffDisplay();

    // 版本号
    this.add.text(width - 10, height - 10, 'v0.2.1', {
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
      // Redraw the first child (the graphics)
      const cardBg = container.getAt(0) as Phaser.GameObjects.Graphics;
      cardBg.clear();
      const fx = i === 0 ? this.cameras.main.width / 2 - 100 : this.cameras.main.width / 2 + 100;
      this.drawFactionCard(cardBg, fx, 210, 170, 140, fi, false);
    });
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