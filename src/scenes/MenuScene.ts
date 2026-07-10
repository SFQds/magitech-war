/**
 * 主菜单场景
 */

import Phaser from 'phaser';
import { SoundManager } from '../utils/SoundManager';

const MAPS = [
  { id: 'map_valley', name: '山谷', desc: '中央开阔地，两侧山脉' },
  { id: 'map_river', name: '河战', desc: '河流贯穿战场，三座桥梁' },
  { id: 'map_islands', name: '群岛', desc: '水域分隔，群岛争夺' },
];

export class MenuScene extends Phaser.Scene {
  private currentMapIdx = 0;
  private mapNameText!: Phaser.GameObjects.Text;
  private mapDescText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // 标题
    this.add.text(width / 2, height / 3 - 60, '魔导工业革命', {
      fontSize: '42px',
      color: '#c8a2c8',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 3 - 10, 'Magitech Industrial Revolution', {
      fontSize: '16px',
      color: '#7f6a8e',
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // 地图选择
    const mapLabel = this.add.text(width / 2, height / 2 - 50, '— 选择地图 —', {
      fontSize: '14px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // 左箭头
    const leftArrow = this.add.text(width / 2 - 120, height / 2 - 15, '◀', {
      fontSize: '28px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // 地图名
    this.mapNameText = this.add.text(width / 2, height / 2 - 15, '', {
      fontSize: '22px', color: '#ffffff', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // 地图描述
    this.mapDescText = this.add.text(width / 2, height / 2 + 15, '', {
      fontSize: '13px', color: '#7f6a8e', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);

    // 右箭头
    const rightArrow = this.add.text(width / 2 + 120, height / 2 - 15, '▶', {
      fontSize: '28px', color: '#c8a2c8', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // 开始按钮
    const startBtn = this.add.text(width / 2, height / 2 + 60, '▶  开始游戏', {
      fontSize: '22px',
      color: '#ffffff',
      backgroundColor: '#4a3060',
      padding: { x: 32, y: 12 },
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    // 切换地图
    const updateMapDisplay = () => {
      const m = MAPS[this.currentMapIdx];
      this.mapNameText.setText(m.name);
      this.mapDescText.setText(m.desc);
    };

    leftArrow.on('pointerdown', () => {
      this.currentMapIdx = (this.currentMapIdx - 1 + MAPS.length) % MAPS.length;
      updateMapDisplay();
    });
    rightArrow.on('pointerdown', () => {
      this.currentMapIdx = (this.currentMapIdx + 1) % MAPS.length;
      updateMapDisplay();
    });

    startBtn.on('pointerover', () => startBtn.setStyle({ backgroundColor: '#5e3d78' }));
    startBtn.on('pointerout', () => startBtn.setStyle({ backgroundColor: '#4a3060' }));
    startBtn.on('pointerdown', () => {
      SoundManager.init();
      const mapId = MAPS[this.currentMapIdx].id;
      this.scene.start('GameScene', { map: mapId });
      this.scene.start('HUDScene');
    });

    updateMapDisplay();

    // 版本号
    this.add.text(width - 10, height - 10, 'v0.2.0', {
      fontSize: '12px', color: '#3a2a4a', fontFamily: 'Arial, sans-serif',
    }).setOrigin(1, 1);
  }
}