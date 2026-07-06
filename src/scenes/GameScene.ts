/**
 * 游戏主场景 — 核心游戏循环
 *
 * 管理 GameWorld、渲染所有实体、协调各 System 的 update
 */

import Phaser from 'phaser';
import { GameWorld } from '../core/GameWorld';
import { CameraController } from '../core/CameraController';
import { InputController } from '../core/InputController';
import { FogOfWar } from '../core/FogOfWar';
import { MovementSystem } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { ProductionSystem } from '../systems/ProductionSystem';
import { TechTreeSystem } from '../systems/TechTreeSystem';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceField } from '../entities/ResourceField';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { tileToWorld } from '../utils/MathUtils';

export class GameScene extends Phaser.Scene {
  world!: GameWorld;
  private cameraCtrl!: CameraController;
  private inputCtrl!: InputController;
  private techTree!: TechTreeSystem;

  // 实体列表
  private units: Unit[] = [];
  private buildings: Building[] = [];
  private resourceFields: ResourceField[] = [];

  // 单位精灵映射
  private unitSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private buildingSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private resourceSprites = new Map<string, Phaser.GameObjects.Rectangle>();

  // 地图瓦片渲染
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private fogOverlay!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    const mapW = 64;
    const mapH = 64;
    const tileSize = 32;

    // 初始化 GameWorld
    this.world = new GameWorld(mapW, mapH, tileSize);
    this.world.addPlayer('arcane_empire', ['mages_guild', 'alchemists_society'], false);
    this.world.addPlayer('hammer_federation', ['mechanists_guild', 'alchemists_society'], true);

    // 初始化摄影机
    this.cameraCtrl = new CameraController(this.cameras.main, mapW, mapH, tileSize);

    // 初始化输入
    this.inputCtrl = new InputController(this, 0);

    // 初始化科技树
    this.techTree = new TechTreeSystem();

    // 绘制地图瓦片
    this.renderTiles();

    // 放置起始资源点
    this.placeInitialResources();

    // 放置起始单位和建筑
    this.placeStartingUnits();

    // 初始探索玩家出生点周围区域
    this.initializeFogOfWar();

    // 注册输入回调
    this.setupInputCallbacks();
  }

  /** 渲染地图瓦片 */
  private renderTiles(): void {
    this.tileGraphics = this.add.graphics();
    const map = this.world.map;
    const ts = map.config.tileSize;

    const colors: Record<string, number> = {
      grass: 0x2d5a27,
      sand: 0xc2b280,
      water: 0x2244aa,
      mountain: 0x666666,
      forest: 0x1a4a1a,
    };

    for (let y = 0; y < map.config.height; y++) {
      for (let x = 0; x < map.config.width; x++) {
        const terrain = map.getTile(x, y);
        const color = colors[terrain] ?? 0x2d5a27;
        this.tileGraphics.fillStyle(color, 1);
        this.tileGraphics.fillRect(x * ts, y * ts, ts, ts);
      }
    }
  }

  /** 放置初始资源 */
  private placeInitialResources(): void {
    // 临时：在地图上放置几个水晶矿脉
    const positions = [
      { x: 8, y: 10 }, { x: 10, y: 16 },
      { x: 52, y: 48 }, { x: 48, y: 54 },
      { x: 28, y: 30 }, { x: 34, y: 28 },
    ];

    for (const pos of positions) {
      const field = new ResourceField(pos.x, pos.y, 'crystal', 5000, 3);
      this.resourceFields.push(field);

      // 渲染资源点
      const world = tileToWorld(pos.x, pos.y);
      const rect = this.add.rectangle(world.x, world.y, 20, 20, 0x9b59b6, 0.8);
      rect.setDepth(1);
      this.resourceSprites.set(field.id, rect);
    }
  }

  /** 放置玩家起始单位和建筑 */
  private placeStartingUnits(): void {
    // 玩家(0)起始——地图左上
    const playerStart = { x: 6, y: 6 };

    // 帝国指挥中心
    const cc = new Building(
      0, 'arcane_empire', playerStart.x, playerStart.y,
      2000, 'structure', 'production', 'bld_cc_empire', 0, 50
    );
    cc.complete(); // 直接完成建造
    this.buildings.push(cc);
    this.addBuildingSprite(cc);

    // 三个工兵
    for (let i = 0; i < 3; i++) {
      const worker = new Unit(
        0, 'arcane_empire',
        playerStart.x + 1 + i, playerStart.y + 2,
        80, 'light', 'infantry',
        2.0, 5, 'physical', 3, 1.0, 5,
        'unit_worker'
      );
      this.units.push(worker);
      this.addUnitSprite(worker);
    }

    // 一个奥术守卫
    const guard = new Unit(
      0, 'arcane_empire',
      playerStart.x + 2, playerStart.y + 2,
      350, 'heavy', 'infantry',
      1.8, 30, 'magic', 1, 1.0, 6,
      'unit_arcane_heavy', []
    );
    this.units.push(guard);
    this.addUnitSprite(guard);

    // AI(1)起始——地图右下
    const aiStart = { x: 56, y: 56 };
    const aiCC = new Building(
      1, 'hammer_federation', aiStart.x, aiStart.y,
      2000, 'structure', 'production', 'bld_cc_federation', 0, 80
    );
    aiCC.complete();
    this.buildings.push(aiCC);
    this.addBuildingSprite(aiCC);

    for (let i = 0; i < 4; i++) {
      const aiRifle = new Unit(
        1, 'hammer_federation',
        aiStart.x + 1 + i, aiStart.y + 2,
        120, 'light', 'infantry',
        2.2, 18, 'physical', 5, 0.8, 7,
        'unit_rifleman'
      );
      this.units.push(aiRifle);
      this.addUnitSprite(aiRifle);
    }
  }

  /** 初始迷雾：双方出生点附近都标记为已探索 */
  private initializeFogOfWar(): void {
    const fog = this.world.fogOfWar;

    // 公开 API：双方出生点周围区域设为已探索
    fog.revealArea(3, 3, 12, 12);    // 玩家区域
    fog.revealArea(53, 53, 12, 12);  // AI 区域

    // 再用单位视野更新一次（玩家可见自己单位周围）
    fog.update(
      this.units.map(u => ({
        tileX: Math.round(u.tileX),
        tileY: Math.round(u.tileY),
        sight: u.sight,
        owner: u.owner,
      })),
      0
    );
  }

  /** 为单位创建精灵 */
  private addUnitSprite(unit: Unit): void {
    const w = tileToWorld(unit.tileX, unit.tileY);
    const size = unit.spriteKey.startsWith('unit_magitech_mech') ||
                 unit.spriteKey.startsWith('unit_transport') ||
                 unit.spriteKey.startsWith('unit_scout_bike') ? 24 : 16;
    const color = unit.owner === 0 ? 0x00ff00 : 0xff4444;
    const rect = this.add.rectangle(w.x, w.y, size, size, color, 0.8);
    rect.setDepth(10);
    this.unitSprites.set(unit.id, rect);
  }

  /** 为建筑创建精灵 */
  private addBuildingSprite(building: Building): void {
    const w = tileToWorld(building.tileX, building.tileY);
    const color = building.owner === 0 ? 0x00ff88 : 0xff6644;
    const rect = this.add.rectangle(w.x, w.y, 24, 24, color, 0.9);
    rect.setDepth(5);
    this.buildingSprites.set(building.id, rect);
  }

  /** 输入回调 */
  private setupInputCallbacks(): void {
    // 单击：选中单个单位
    this.inputCtrl.onSingleClick((tile) => {
      const clickedUnit = this.units.find(u =>
        u.owner === 0 && u.isAlive &&
        Math.round(u.tileX) === tile.x && Math.round(u.tileY) === tile.y
      );
      if (clickedUnit) {
        this.inputCtrl.setSelection([clickedUnit.id]);
      } else {
        this.inputCtrl.clearSelection();
      }
      this.updateSelectionHighlight();
      EventBus.emit(GameEvent.SELECTION_CHANGED, {
        unitIds: this.inputCtrl.getSelection(),
        playerIndex: 0,
      });
    });

    // 框选
    this.inputCtrl.onSelection((box) => {
      this.inputCtrl.clearSelection();
      for (const unit of this.units) {
        if (unit.owner !== 0 || !unit.isAlive) continue;
        const w = tileToWorld(unit.tileX, unit.tileY);
        if (w.x >= box.x && w.x <= box.x + box.width &&
            w.y >= box.y && w.y <= box.y + box.height) {
          this.inputCtrl.addToSelection([unit.id]);
        }
      }
      this.updateSelectionHighlight();
      EventBus.emit(GameEvent.SELECTION_CHANGED, {
        unitIds: this.inputCtrl.getSelection(),
        playerIndex: 0,
      });
    });

    // 右键移动
    this.inputCtrl.onRightClick((tile) => {
      const selection = this.inputCtrl.getSelection();
      if (selection.length === 0) return;

      for (const unit of this.units) {
        if (selection.includes(unit.id) && unit.isAlive) {
          MovementSystem.navigate(unit, tile, this.world.map);
        }
      }
    });
  }

  /** 更新选中高亮 */
  private updateSelectionHighlight(): void {
    const selected = new Set(this.inputCtrl.getSelection());
    for (const [id, sprite] of this.unitSprites) {
      if (sprite instanceof Phaser.GameObjects.Rectangle) {
        const isSelected = selected.has(id);
        sprite.setStrokeStyle(isSelected ? 2 : 0, 0xffff00);
      }
    }
  }

  update(_time: number, delta: number): void {
    const deltaSec = delta / 1000;

    // 更新摄像机
    this.cameraCtrl.update(this.input.activePointer);

    // 更新单位移动
    for (const unit of this.units) {
      if (!unit.isAlive) continue;
      MovementSystem.updateMovement(unit, deltaSec, this.world.map);
    }

    // 更新战斗
    CombatSystem.updateCombat(this.units, this.buildings, deltaSec);

    // 更新资源
    ResourceSystem.updateResources(this.world.players, this.units, this.buildings);

    // 更新生产
    ProductionSystem.updateProduction(this.buildings, deltaSec);

    // 更新精灵位置
    this.syncSprites();

    // 更新迷雾
    this.world.fogOfWar.update(
      this.units.map(u => ({ tileX: Math.round(u.tileX), tileY: Math.round(u.tileY), sight: u.sight, owner: u.owner })),
      0
    );
    this.renderFogOfWar();
  }

  /** 同步实体 tile 坐标到精灵世界坐标 */
  private syncSprites(): void {
    for (const unit of this.units) {
      const sprite = this.unitSprites.get(unit.id);
      if (sprite && unit.isAlive) {
        const w = tileToWorld(unit.tileX, unit.tileY);
        sprite.setPosition(w.x, w.y);
      }
    }
  }

  /** 渲染战争迷雾覆盖层 */
  private renderFogOfWar(): void {
    if (!this.fogOverlay) {
      this.fogOverlay = this.add.graphics();
      this.fogOverlay.setDepth(50);
    }

    this.fogOverlay.clear();
    const fog = this.world.fogOfWar;
    const ts = 32;
    const map = this.world.map;

    for (let y = 0; y < map.config.height; y++) {
      for (let x = 0; x < map.config.width; x++) {
        const state = fog.getState(x, y);
        if (state === 0) {
          // Hidden: 不透明黑
          this.fogOverlay.fillStyle(0x000000, 1);
          this.fogOverlay.fillRect(x * ts, y * ts, ts, ts);
        } else if (state === 1) {
          // Explored: 半透明暗
          this.fogOverlay.fillStyle(0x000000, 0.5);
          this.fogOverlay.fillRect(x * ts, y * ts, ts, ts);
        }
        // Visible: 不画覆盖层
      }
    }
  }
}