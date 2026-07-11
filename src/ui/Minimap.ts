/**
 * 小地图 — 右下角缩略图
 *
 * 显示地形、单位位置、视野范围
 */

import Phaser from 'phaser';
import { GameMap } from '../core/GameMap';
import { FogOfWar } from '../core/FogOfWar';
import type { CameraController } from '../core/CameraController';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';

export class Minimap {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private map: GameMap;
  private fog: FogOfWar;
  private cameraCtrl: CameraController | null = null;
  private x: number;
  private y: number;
  private size: number;
  private scale: number;
  private hitZone: Phaser.GameObjects.Rectangle | null = null;

  constructor(
    scene: Phaser.Scene,
    map: GameMap,
    fog: FogOfWar,
    x: number,
    y: number,
    size = 150
  ) {
    this.scene = scene;
    this.map = map;
    this.fog = fog;
    this.x = x;
    this.y = y;
    this.size = size;
    this.scale = size / Math.max(map.config.width, map.config.height);
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(200);
    this.graphics.setScrollFactor(0);

    // 点击小地图跳转视角
    this.hitZone = scene.add.rectangle(x, y, size, size, 0xffffff, 0)
      .setOrigin(0)
      .setDepth(201)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const tileX = Math.round((pointer.x - this.x) / this.scale);
      const tileY = Math.round((pointer.y - this.y) / this.scale);
      if (this.cameraCtrl) {
        this.cameraCtrl.centerOn(tileX * 32 + 16, tileY * 32 + 16);
      }
    });
  }

  /** 每帧调用 */
  update(units: Unit[], buildings: Building[], playerIndex: number): void {
    this.graphics.clear();

    // 背景
    this.graphics.fillStyle(0x000000, 0.8);
    this.graphics.fillRect(this.x, this.y, this.size, this.size);

    const s = this.scale;

    // 地形
    for (let ty = 0; ty < this.map.config.height; ty++) {
      for (let tx = 0; tx < this.map.config.width; tx++) {
        if (!this.fog.isExplored(tx, ty)) continue;
        const terrain = this.map.getTile(tx, ty);
        const color = terrain === 'water' ? 0x2244aa
          : terrain === 'mountain' ? 0x555555
          : terrain === 'forest' ? 0x1a3a1a
          : 0x2d5a27;
        this.graphics.fillStyle(color, 0.7);
        this.graphics.fillRect(this.x + tx * s, this.y + ty * s, Math.ceil(s), Math.ceil(s));
      }
    }

    // 建筑
    for (const b of buildings) {
      if (!b.isAlive) continue;
      const color = b.owner === playerIndex ? 0x00ff00 : 0xff4444;
      this.graphics.fillStyle(color, 0.9);
      this.graphics.fillRect(this.x + b.tileX * s - 1, this.y + b.tileY * s - 1, 3, 3);
    }

    // 单位
    for (const u of units) {
      if (!u.isAlive) continue;
      if (!this.fog.isVisible(Math.round(u.tileX), Math.round(u.tileY))) continue;
      const color = u.owner === playerIndex ? 0x00ff00 : 0xff0000;
      this.graphics.fillStyle(color, 0.9);
      this.graphics.fillRect(this.x + u.tileX * s, this.y + u.tileY * s, 2, 2);
    }

    // 视野框
    const cam = this.scene.cameras.main;
    this.graphics.lineStyle(1, 0xffffff, 0.5);
    this.graphics.strokeRect(
      this.x + (cam.scrollX / 32) * s,
      this.y + (cam.scrollY / 32) * s,
      (cam.width / 32) * s,
      (cam.height / 32) * s
    );
  }

  destroy(): void {
    this.graphics.destroy();
    this.hitZone?.destroy();
  }

  /** 注入摄影机控制器，支持点击导航 */
  setCameraCtrl(ctrl: CameraController): void {
    this.cameraCtrl = ctrl;
  }
}