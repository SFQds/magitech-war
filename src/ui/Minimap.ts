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
import { UITheme as T } from './theme/UITheme';

export class Minimap {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private terrainGraphics: Phaser.GameObjects.Graphics;
  private frame: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image | null = null;
  private map: GameMap;
  private fog: FogOfWar;
  private cameraCtrl: CameraController | null = null;
  private x: number;
  private y: number;
  private size: number;
  private scale: number;
  private hitZone: Phaser.GameObjects.Rectangle | null = null;
  // 地形层缓存：仅在迷雾探索变化时重绘，避免每帧全量重绘 4096 格地形
  private terrainDirty = true;

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
    // 动态层（单位/建筑/视野框）：每帧重绘；绘制于地形层之上
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(201);
    this.graphics.setScrollFactor(0);
    // 静态地形层：仅在探索变化时重绘；置于边框(199)之上、动态层(201)之下
    this.terrainGraphics = scene.add.graphics();
    this.terrainGraphics.setDepth(200);
    this.terrainGraphics.setScrollFactor(0);
    this.terrainDirty = true;

    // 雕花边框: 有贴图用 ui_minimap_frame (中央紫色衬底作地图底板), 否则代码金色描边
    if (scene.textures.exists('ui_minimap_frame')) {
      const frameImg = scene.add.image(this.x - 8, this.y - 8, 'ui_minimap_frame')
        .setDisplaySize(this.size + 16, this.size + 16).setOrigin(0);
      frameImg.setDepth(199); // 地图图形 (200) 之下
      frameImg.setScrollFactor(0);
      this.frame = frameImg;
    } else {
      this.frame = scene.add.graphics();
      this.frame.lineStyle(2, T.Color.ACCENT_GOLD, 0.8);
      this.frame.strokeRect(this.x - 1, this.y - 1, this.size + 2, this.size + 2);
      this.frame.setDepth(201);
      this.frame.setScrollFactor(0);
    }

    // 点击小地图跳转视角
    this.hitZone = scene.add.rectangle(x, y, size, size, 0xffffff, 0)
      .setOrigin(0)
      .setDepth(202)
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

  /**
   * 联机(修复4): 客户端应用主机快照后 world 被替换, 更新本 minimap 持有的迷雾引用。
   */
  setFog(fog: FogOfWar): void {
    if (fog !== this.fog) {
      this.fog = fog;
      // 新迷雾（联机快照替换）→ 地形探索可能变化，强制重绘地形层
      this.terrainDirty = true;
    }
  }

  /** 每帧调用 */
  update(units: Unit[], buildings: Building[], playerIndex: number): void {
    // === 地形层：仅在迷雾探索变化时重绘 ===
    // 说明：之前每帧全量循环 64×64=4096 格地形是最大开销。地形在本局内不变，
    // 迷雾只增不减，故用 getChangedKeys() 增量重绘新探索瓦片即可保持相同画面。
    let redrawTerrain = this.terrainDirty;
    if (!redrawTerrain) {
      const keys = this.fog.getChangedKeys();
      if (keys.length > 0) redrawTerrain = true;
    }
    if (redrawTerrain) {
      this.redrawTerrain();
      this.terrainDirty = false;
    }

    // === 动态层：单位/建筑/视野框（每帧） ===
    this.graphics.clear();
    const s = this.scale;

    // 建筑
    for (const b of buildings) {
      if (!b.isAlive) continue;
      if (b.owner !== playerIndex && !this.fog.isVisible(Math.round(b.tileX), Math.round(b.tileY))) continue;
      const color = b.owner === playerIndex ? T.Color.MM_FRIENDLY : T.Color.MM_ENEMY;
      this.graphics.fillStyle(color, 0.9);
      this.graphics.fillRect(this.x + b.tileX * s - 1, this.y + b.tileY * s - 1, 3, 3);
    }

    // 资源点
    const resFields = (this.scene.scene.get('GameScene') as any)?.resourceFields ?? [];
    for (const f of resFields) {
      if (!f.isAlive || f.isDepleted) continue;
      if (!this.fog.isExplored(f.tileX, f.tileY)) continue;
      this.graphics.fillStyle(T.Color.MM_RESOURCE, 0.8);
      this.graphics.fillRect(this.x + f.tileX * s - 1, this.y + f.tileY * s - 1, 3, 3);
    }

    // 单位
    for (const u of units) {
      if (!u.isAlive) continue;
      if (!this.fog.isVisible(Math.round(u.tileX), Math.round(u.tileY))) continue;
      const color = u.owner === playerIndex ? T.Color.MM_FRIENDLY : T.Color.MM_ENEMY;
      this.graphics.fillStyle(color, 0.9);
      this.graphics.fillRect(this.x + u.tileX * s, this.y + u.tileY * s, 2, 2);
    }

    // 视野框 (金色半透明)
    const cam = this.scene.cameras.main;
    this.graphics.lineStyle(1, T.Color.ACCENT_GOLD, 0.6);
    this.graphics.strokeRect(
      this.x + (cam.worldView.x / 32) * s,
      this.y + (cam.worldView.y / 32) * s,
      (cam.worldView.width / 32) * s,
      (cam.worldView.height / 32) * s
    );
  }

  /** 重绘静态地形层（含背景），仅在探索变化时调用 */
  private redrawTerrain(): void {
    this.terrainGraphics.clear();

    // 背景
    this.terrainGraphics.fillStyle(T.Color.PANEL_BG, 0.85);
    this.terrainGraphics.fillRect(this.x, this.y, this.size, this.size);

    const s = this.scale;
    for (let ty = 0; ty < this.map.config.height; ty++) {
      for (let tx = 0; tx < this.map.config.width; tx++) {
        if (!this.fog.isExplored(tx, ty)) continue;
        const terrain = this.map.getTile(tx, ty);
        const color = terrain === 'water' ? T.Color.MM_WATER
          : terrain === 'mountain' ? T.Color.MM_MOUNTAIN
          : terrain === 'forest' ? T.Color.MM_FOREST
          : T.Color.MM_GRASS;
        this.terrainGraphics.fillStyle(color, 0.7);
        this.terrainGraphics.fillRect(this.x + tx * s, this.y + ty * s, Math.ceil(s), Math.ceil(s));
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.terrainGraphics.destroy();
    this.frame?.destroy();
    this.hitZone?.destroy();
  }

  /** 注入摄影机控制器，支持点击导航 */
  setCameraCtrl(ctrl: CameraController): void {
    this.cameraCtrl = ctrl;
  }
}