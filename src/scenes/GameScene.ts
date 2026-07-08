/**
 * 游戏主场景 — 核心游戏循环
 *
 * 管理 GameWorld、渲染所有实体、协调各 System 的 update
 */

import Phaser from 'phaser';
import { GameWorld } from '../core/GameWorld';
import { CameraController } from '../core/CameraController';
import { InputController } from '../core/InputController';
import { MovementSystem } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { ProductionSystem } from '../systems/ProductionSystem';
import { TechTreeSystem } from '../systems/TechTreeSystem';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceField } from '../entities/ResourceField';
import { Projectile } from '../entities/Projectile';
import { Entity } from '../entities/Entity';
import { AIController } from '../ai/AIController';
import type { AnyCommand, TrainCommand, MoveCommand, AttackCommand } from '../types/commands';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { tileToWorld } from '../utils/MathUtils';
import type { Point } from '../types/entity';

/** 单位训练成本（临时硬编码，后续从 JSON 加载） */
const UNIT_COSTS: Record<string, { crystal: number; supply: number; time: number; category: string }> = {
  unit_worker:       { crystal: 100, supply: 1, time: 8,  category: 'infantry' },
  unit_rifleman:     { crystal: 150, supply: 1, time: 10, category: 'infantry' },
  unit_battle_mage:  { crystal: 250, supply: 2, time: 15, category: 'infantry' },
};

/** 建筑建造成本 */
const BUILDING_COSTS: Record<string, { crystal: number; industry: number; time: number; providesSupply: number; providesIndustry: number }> = {
  bld_barracks: { crystal: 300, industry: 0, time: 15, providesSupply: 20, providesIndustry: 0 },
};

export class GameScene extends Phaser.Scene {
  world!: GameWorld;
  private cameraCtrl!: CameraController;
  private inputCtrl!: InputController;
  private techTree!: TechTreeSystem;
  private aiController!: AIController;

  // 实体列表 + 快速查找
  private units: Unit[] = [];
  private buildings: Building[] = [];
  private resourceFields: ResourceField[] = [];
  private projectiles: Projectile[] = [];

  private unitMap = new Map<string, Unit>();
  private buildingMap = new Map<string, Building>();
  private fieldMap = new Map<string, ResourceField>();

  // 精灵映射（改用 Phaser Image 替代 Rectangle，支持 PNG纹理+tint）
  private unitSprites = new Map<string, Phaser.GameObjects.Image>();
  private buildingSprites = new Map<string, Phaser.GameObjects.Image>();
  private resourceSprites = new Map<string, Phaser.GameObjects.Image>();
  private projectileSprites = new Map<string, Phaser.GameObjects.Rectangle>();

  // 地图瓦片渲染
  private tileGraphics!: Phaser.GameObjects.Graphics;
  private fogOverlay!: Phaser.GameObjects.Graphics;

  // 选中状态（同时支持单位和建筑）
  private selectedBuildingId: string | null = null;

  // HUD 资源更新计时
  private _lastHudTick: number = 0;

  // 战斗视觉
  private flashTimers = new Map<string, number>();  // 单位→剩余闪光秒数
  private attackMoveMode = false;                    // A键攻击移动模式

  // 建造系统
  private buildMode: { buildingDefId: string; builderId: string } | null = null;
  private buildPreview: Phaser.GameObjects.Image | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ============ 初始化 ============

  create(): void {
    const mapW = 64;
    const mapH = 64;
    const tileSize = 32;

    // 初始化 GameWorld
    this.world = new GameWorld(mapW, mapH, tileSize);
    this.world.addPlayer('arcane_empire', ['mages_guild', 'alchemists_society'], false);
    this.world.addPlayer('hammer_federation', ['mechanists_guild', 'alchemists_society'], true);

    // 初始化子系统
    this.cameraCtrl = new CameraController(this.cameras.main, mapW, mapH, tileSize);
    this.inputCtrl = new InputController(this, 0);
    this.techTree = new TechTreeSystem();
    this.aiController = new AIController(this.world, 1, 'normal');

    // 渲染世界
    this.renderTiles();
    this.placeInitialResources();
    this.placeStartingUnits();
    this.initializeFogOfWar();
    this.setupInputCallbacks();

    // 键盘快捷键
    this.setupKeyboard();

    // 开局聚焦玩家基地
    this.cameraCtrl.centerOn(6 * 32 + 16, 6 * 32 + 16);

    // 通知 HUDScene 初始化小地图
    const hudScene = this.scene.get('HUDScene') as any;
    if (hudScene && hudScene.initMinimap) {
      hudScene.initMinimap(this.world.map, this.world.fogOfWar);
    }

    // 开局跑一次资源计算（让 population/industry 正确反映建筑提供值）
    ResourceSystem.updateResources(this.world.players, this.units, this.buildings);

    // 发射初始资源事件（让 HUD 正确显示）
    const p0 = this.world.players[0];
    EventBus.emit(GameEvent.RESOURCE_CHANGED, {
      playerIndex: 0,
      resource: 'crystal',
      newValue: p0.resources.crystal,
      delta: p0.resources.crystal,
    });
    EventBus.emit(GameEvent.GAME_STARTED, {});
  }

  // ============ 地图渲染 ============

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

  private placeInitialResources(): void {
    const positions = [
      { x: 8, y: 10 }, { x: 10, y: 16 },
      { x: 52, y: 48 }, { x: 48, y: 54 },
      { x: 28, y: 30 }, { x: 34, y: 28 },
    ];

    for (const pos of positions) {
      const field = new ResourceField(pos.x, pos.y, 'crystal', 5000, 3);
      this.addResourceField(field);
    }
  }

  private placeStartingUnits(): void {
    // 玩家(0) — 左上
    const ps = { x: 6, y: 6 };
    const cc = new Building(0, 'arcane_empire', ps.x, ps.y, 2000, 'structure', 'production', 'bld_cc_empire', 50, 50);
    cc.complete();
    this.addBuilding(cc);

    for (let i = 0; i < 3; i++) {
      const w = new Unit(0, 'arcane_empire', ps.x + 1 + i, ps.y + 2, 80, 'light', 'infantry', 2.0, 5, 'physical', 3, 1.0, 5, 'unit_worker');
      this.addUnit(w);
    }
    const guard = new Unit(0, 'arcane_empire', ps.x + 2, ps.y + 2, 350, 'heavy', 'infantry', 1.8, 30, 'magic', 1, 1.0, 6, 'unit_arcane_heavy');
    this.addUnit(guard);

    // AI(1) — 右下
    const as = { x: 56, y: 56 };
    const aiCC = new Building(1, 'hammer_federation', as.x, as.y, 2000, 'structure', 'production', 'bld_cc_federation', 50, 80);
    aiCC.complete();
    this.addBuilding(aiCC);

    for (let i = 0; i < 4; i++) {
      const r = new Unit(1, 'hammer_federation', as.x + 1 + i, as.y + 2, 120, 'light', 'infantry', 2.2, 18, 'physical', 5, 0.8, 7, 'unit_rifleman');
      this.addUnit(r);
    }
  }

  private initializeFogOfWar(): void {
    const fog = this.world.fogOfWar;
    fog.revealArea(3, 3, 12, 12);
    fog.revealArea(53, 53, 12, 12);
    fog.update(
      this.units.map(u => ({ tileX: Math.round(u.tileX), tileY: Math.round(u.tileY), sight: u.sight, owner: u.owner })),
      0,
    );
  }

  // ============ 实体增删 ============

  private addUnit(unit: Unit): void {
    this.units.push(unit);
    this.unitMap.set(unit.id, unit);
    this.addUnitSprite(unit);
  }

  private removeUnit(id: string): void {
    const idx = this.units.findIndex(u => u.id === id);
    if (idx !== -1) this.units.splice(idx, 1);
    this.unitMap.delete(id);
    const sprite = this.unitSprites.get(id);
    if (sprite) { sprite.destroy(); this.unitSprites.delete(id); }
  }

  private addBuilding(building: Building): void {
    this.buildings.push(building);
    this.buildingMap.set(building.id, building);
    this.addBuildingSprite(building);
  }

  private removeBuilding(id: string): void {
    const idx = this.buildings.findIndex(b => b.id === id);
    if (idx !== -1) this.buildings.splice(idx, 1);
    this.buildingMap.delete(id);
    const sprite = this.buildingSprites.get(id);
    if (sprite) { sprite.destroy(); this.buildingSprites.delete(id); }
  }

  private addResourceField(field: ResourceField): void {
    this.resourceFields.push(field);
    this.fieldMap.set(field.id, field);
    this.addResourceFieldSprite(field);
  }

  // ============ 精灵创建 ============

  private addUnitSprite(unit: Unit): void {
    const w = tileToWorld(unit.tileX, unit.tileY);
    // 使用 PNG 纹理，fallback 到 AssetGenerator 的占位纹理
    const texKey = this.textures.exists(unit.spriteKey) ? unit.spriteKey : '__DEFAULT';
    const img = this.add.image(w.x, w.y, texKey);
    img.setDisplaySize(32, 32);
    img.setDepth(10);
    this.unitSprites.set(unit.id, img);
  }

  private addBuildingSprite(building: Building): void {
    const w = tileToWorld(building.tileX, building.tileY);
    const texKey = this.textures.exists(building.spriteKey) ? building.spriteKey : '__DEFAULT';
    const img = this.add.image(w.x, w.y, texKey);
    img.setDisplaySize(48, 48);
    img.setDepth(5);
    this.buildingSprites.set(building.id, img);
  }

  private addResourceFieldSprite(field: ResourceField): void {
    const w = tileToWorld(field.tileX, field.tileY);
    const img = this.add.image(w.x, w.y, 'ui_crystal');
    img.setDisplaySize(24, 24);
    img.setDepth(1);
    this.resourceSprites.set(field.id, img);
  }

  // ============ 输入回调 ============

  private setupInputCallbacks(): void {
    // 单击：选中单位 或 建筑
    this.inputCtrl.onSingleClick((tile) => {
      // 建造模式：单击确认放置
      if (this.buildMode) {
        this.confirmBuild(tile.x, tile.y);
        return;
      }

      this.selectedBuildingId = null;

      // 先检查单位
      const clickedUnit = this.units.find(u =>
        u.owner === 0 && u.isAlive &&
        Math.round(u.tileX) === tile.x && Math.round(u.tileY) === tile.y
      );
      if (clickedUnit) {
        this.inputCtrl.setSelection([clickedUnit.id]);
        this.updateSelectionHighlight();
        EventBus.emit(GameEvent.SELECTION_CHANGED, {
          unitIds: this.inputCtrl.getSelection(),
          playerIndex: 0,
        });
        return;
      }

      // 再检查建筑
      const clickedBuilding = this.buildings.find(b =>
        b.owner === 0 && b.isAlive &&
        b.tileX === tile.x && b.tileY === tile.y
      );
      if (clickedBuilding) {
        this.inputCtrl.clearSelection();
        this.selectedBuildingId = clickedBuilding.id;
        this.updateSelectionHighlight();
        EventBus.emit(GameEvent.BUILDING_SELECTED, {
          buildingId: clickedBuilding.id,
          buildingType: clickedBuilding.buildingType,
          playerIndex: 0,
        } as any);
        return;
      }

      // 点空地 → 取消选择
      this.inputCtrl.clearSelection();
      this.selectedBuildingId = null;
      this.updateSelectionHighlight();
      EventBus.emit(GameEvent.SELECTION_CHANGED, {
        unitIds: [],
        playerIndex: 0,
      });
    });

    // 框选
    this.inputCtrl.onSelection((box) => {
      this.inputCtrl.clearSelection();
      this.selectedBuildingId = null;
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

    // 右键智能命令
    this.inputCtrl.onRightClick((tile) => {
      const selection = this.inputCtrl.getSelection();
      if (selection.length === 0) return;

      // 攻击移动模式：强制移动（自动索敌会处理沿途攻击）
      if (this.attackMoveMode) {
        this.attackMoveMode = false;
        EventBus.emit('attackmove:toggle' as any, { active: false });
        for (const id of selection) {
          const unit = this.unitMap.get(id);
          if (!unit || !unit.isAlive) continue;
          unit.stopAttacking();
          MovementSystem.navigate(unit, tile, this.world.map);
        }
        return;
      }

      // 检查点击位置是否有敌方单位/建筑
      const enemyAtTile = this.findEnemyAtTile(tile.x, tile.y);

      // 检查点击位置是否有资源田
      const fieldAtTile = this.resourceFields.find(f =>
        f.isActive && !f.isDepleted &&
        f.tileX === tile.x && f.tileY === tile.y
      );

      for (const id of selection) {
        const unit = this.unitMap.get(id);
        if (!unit || !unit.isAlive) continue;

        if (enemyAtTile) {
          // 攻击命令：设目标→设路径→强制进入追击状态（覆盖 navigate 的 moving）
          unit.stopAttacking();
          unit.attackTarget(enemyAtTile.id);
          MovementSystem.navigate(unit, tile, this.world.map);
          unit.state = 'pursuing';
        } else if (fieldAtTile && unit.spriteKey === 'unit_worker') {
          // 工人采集 — 先走向资源田，到位后自动切换为采集
          unit.stopAttacking();
          unit.targetResourceId = fieldAtTile.id;
          (unit as any)._gatherTimer = 0;
          MovementSystem.navigate(unit, tile, this.world.map);
        } else {
          // 移动命令：先清除攻击目标，再移动
          unit.stopAttacking();
          MovementSystem.navigate(unit, tile, this.world.map);
        }
      }
    });
  }

  private setupKeyboard(): void {
    // S: 停止
    this.input.keyboard!.on('keydown-S', () => {
      for (const id of this.inputCtrl.getSelection()) {
        const unit = this.unitMap.get(id);
        if (unit && unit.isAlive) {
          unit.stopAttacking();
          unit.clearPath();
          unit.state = 'idle';
        }
      }
    });

    // H: 坚守位置
    this.input.keyboard!.on('keydown-H', () => {
      for (const id of this.inputCtrl.getSelection()) {
        const unit = this.unitMap.get(id);
        if (unit && unit.isAlive) {
          unit.stopAttacking();
          unit.clearPath();
          unit.state = 'idle';
        }
      }
    });

    // DELETE: 消灭选中单位（调试）
    this.input.keyboard!.on('keydown-DELETE', () => {
      const sel = [...this.inputCtrl.getSelection()];
      for (const id of sel) {
        const unit = this.unitMap.get(id);
        if (unit) {
          unit.hp = 0;
          unit.isActive = false;
        }
      }
    });

    // A: 攻击移动模式（切换）
    this.input.keyboard!.on('keydown-A', () => {
      this.attackMoveMode = !this.attackMoveMode;
      EventBus.emit('attackmove:toggle' as any, { active: this.attackMoveMode });
    });

    // F2: 全选作战单位
    this.input.keyboard!.on('keydown-F2', () => {
      const combatIds = this.units
        .filter(u => u.owner === 0 && u.isAlive && u.spriteKey !== 'unit_worker')
        .map(u => u.id);
      this.inputCtrl.setSelection(combatIds);
      this.selectedBuildingId = null;
      this.updateSelectionHighlight();
      EventBus.emit(GameEvent.SELECTION_CHANGED, {
        unitIds: combatIds,
        playerIndex: 0,
      });
    });

    // ESC：退出建造模式 或 退出攻击移动模式
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.buildMode) {
        this.cancelBuildMode();
        return;
      }
      if (this.attackMoveMode) {
        this.attackMoveMode = false;
        EventBus.emit('attackmove:toggle' as any, { active: false });
      }
    });
  }

  private findEnemyAtTile(tx: number, ty: number): Entity | null {
    // 敌方单位
    const unit = this.units.find(u =>
      u.owner !== 0 && u.isAlive &&
      Math.round(u.tileX) === tx && Math.round(u.tileY) === ty
    );
    if (unit) return unit;
    // 敌方建筑
    const bld = this.buildings.find(b =>
      b.owner !== 0 && b.isAlive &&
      b.tileX === tx && b.tileY === ty
    );
    return bld ?? null;
  }

  private updateSelectionHighlight(): void {
    const selected = new Set(this.inputCtrl.getSelection());
    for (const [id, sprite] of this.unitSprites) {
      if (sprite instanceof Phaser.GameObjects.Rectangle) {
        sprite.setStrokeStyle(selected.has(id) ? 2 : 0, 0xffff00);
      }
    }
    // 建筑选中高亮
    for (const [id, sprite] of this.buildingSprites) {
      if (sprite instanceof Phaser.GameObjects.Rectangle) {
        sprite.setStrokeStyle(id === this.selectedBuildingId ? 2 : 0, 0xffff00);
      }
    }
  }

  // ============ 主循环 ============

  update(_time: number, delta: number): void {
    if (this._gameOver) return;
    const deltaSec = delta / 1000;

    // 1. 摄像机
    this.cameraCtrl.update(this.input.activePointer);

    // 2. 单位移动
    for (const unit of this.units) {
      if (!unit.isAlive) continue;
      const wasMoving = unit.state === 'moving';
      MovementSystem.updateMovement(unit, deltaSec, this.world.map);

      // 移动结束 → 如果工人有采集目标，切换到采集状态
      if (wasMoving && unit.state === 'idle' && unit.targetResourceId) {
        const field = this.fieldMap.get(unit.targetResourceId);
        if (field && field.isActive && !field.isDepleted) {
          // 检查是否在采集点附近（相邻或同一格）
          const dist = Math.abs(unit.tileX - field.tileX) + Math.abs(unit.tileY - field.tileY);
          if (dist <= 1.5) {
            unit.state = 'gathering';
            (unit as any)._gatherTimer = 0;
            field.currentGatherers++;
          }
        } else {
          unit.targetResourceId = null;
        }
      }
    }

    // 3. AI 决策 → 执行命令
    const aiCmds = this.aiController.update(deltaSec, this.units, this.buildings, this.resourceFields);
    for (const cmd of aiCmds) {
      this.executeCommand(cmd);
    }

    // 4. 战斗（索敌 + 伤害 + 弹射事件）
    const combatEvents = CombatSystem.updateCombat(
      this.units, this.buildings,
      this.units, this.buildings,
      this.world.map,
      deltaSec,
    );
    for (const evt of combatEvents) {
      // 受伤闪光
      this.flashTimers.set(evt.targetId, 0.12);

      EventBus.emit(GameEvent.UNIT_ATTACK_START, {
        attackerId: evt.attackerId,
        targetId: evt.targetId,
      });
      if (evt.targetDied) {
        this.flashTimers.delete(evt.targetId);
        const targetUnit = this.unitMap.get(evt.targetId);
        const targetBld = this.buildingMap.get(evt.targetId);
        const owner = targetUnit?.owner ?? targetBld?.owner ?? -1;
        EventBus.emit(GameEvent.UNIT_KILLED, {
          unitId: evt.targetId,
          killerId: evt.attackerId,
          playerIndex: owner,
        });
      }
    }

    // 5. 采集
    const gatherEvents = ResourceSystem.updateGathering(
      this.units,
      this.resourceFields,
      this.world.players,
      deltaSec,
    );
    for (const ge of gatherEvents) {
      EventBus.emit(GameEvent.RESOURCE_GATHERED, {
        fieldId: ge.fieldId,
        workerId: ge.workerId,
        playerIndex: ge.playerIndex,
        amount: ge.amount,
      });
      const player = this.world.players[ge.playerIndex];
      if (player) {
        EventBus.emit(GameEvent.RESOURCE_CHANGED, {
          playerIndex: ge.playerIndex,
          resource: 'crystal',
          newValue: player.resources.crystal,
          delta: ge.amount,
        });
      }
    }

    // 6. 资源（补给/工业上限）
    ResourceSystem.updateResources(this.world.players, this.units, this.buildings);

    // 7. 生产 → 生成单位
    const completed = ProductionSystem.updateProduction(this.buildings, deltaSec);
    for (const item of completed) {
      const building = this.buildingMap.get(item.buildingId);
      if (building) {
        this.spawnUnit(item.unitDefId, item.position, building.owner);

        EventBus.emit(GameEvent.PRODUCTION_COMPLETE, {
          buildingId: item.buildingId,
          playerIndex: building.owner,
          unitDefId: item.unitDefId,
        });
      }
    }

    // 7.1 建造进度
    this.updateBuildingConstruction(deltaSec);

    // 8. 弹射物更新
    this.updateProjectiles(deltaSec);

    // 9. 死亡清理
    this.cleanupDeadEntities();

    // 胜负检测
    this.checkGameOver();

    // 10. 精灵同步
    this.syncSprites();

    // 11. 迷雾
    this.world.fogOfWar.update(
      this.units.map(u => ({
        tileX: Math.round(u.tileX),
        tileY: Math.round(u.tileY),
        sight: u.sight,
        owner: u.owner,
      })),
      0,
    );
    this.renderFogOfWar();

    // 12. HUD 资源更新（每 0.5 秒发一次，减少事件频率）
    this._lastHudTick += deltaSec;
    if (this._lastHudTick >= 0.5) {
      this._lastHudTick = 0;
      const p0 = this.world.players[0];
      EventBus.emit(GameEvent.RESOURCE_CHANGED, {
        playerIndex: 0,
        resource: 'crystal',
        newValue: p0.resources.crystal,
        delta: 0,
      });
      EventBus.emit(GameEvent.RESOURCE_CHANGED, {
        playerIndex: 0,
        resource: 'supply',
        newValue: p0.resources.supplyCap - p0.resources.supply,
        delta: 0,
      });
    }
  }

  // ============ 命令执行 ============

  private executeCommand(cmd: AnyCommand): void {
    switch (cmd.type) {
      case 'train': {
        const tc = cmd as TrainCommand;
        const bld = this.buildingMap.get(tc.buildingId);
        if (!bld || bld.owner !== cmd.playerIndex) return;

        // 队列满 → 拒绝
        if (!bld.canEnqueue()) return;

        const cost = UNIT_COSTS[tc.unitDefId];
        if (!cost) return;

        // 检查资源和补给
        if (!this.world.canAfford(cmd.playerIndex, { crystal: cost.crystal, supply: cost.supply })) return;

        this.world.spend(cmd.playerIndex, { crystal: cost.crystal, supply: cost.supply });
        ProductionSystem.startProduction(bld, tc.unitDefId, cost.time);
        EventBus.emit(GameEvent.PRODUCTION_STARTED, {
          buildingId: bld.id,
          playerIndex: cmd.playerIndex,
          unitDefId: tc.unitDefId,
          totalTime: cost.time,
        });
        break;
      }
      case 'move':
      case 'attack_move': {
        const mc = cmd as MoveCommand;
        for (const id of cmd.unitIds) {
          const unit = this.unitMap.get(id);
          if (unit && unit.isAlive) {
            MovementSystem.navigate(unit, mc.target, this.world.map);
          }
        }
        break;
      }
      case 'attack_target': {
        const ac = cmd as AttackCommand;
        for (const id of cmd.unitIds) {
          const unit = this.unitMap.get(id);
          if (unit && unit.isAlive) {
            unit.attackTarget(ac.targetEntityId);
          }
        }
        break;
      }
      case 'build': {
        // AI自动放置建造
        const bc = cmd as any;
        const cost = BUILDING_COSTS[bc.buildingDefId];
        if (!cost) break;
        if (!this.world.canAfford(cmd.playerIndex, { crystal: cost.crystal })) break;
        const aiCC = this.buildings.find(b => b.owner === cmd.playerIndex && b.isAlive);
        if (!aiCC) break;
        let px = aiCC.tileX + 3; let py = aiCC.tileY + 3;
        if (!this.world.map.isPassable(px, py)) { px = aiCC.tileX + 4; py = aiCC.tileY + 2; }
        this.world.spend(cmd.playerIndex, { crystal: cost.crystal });
        const bld = new Building(cmd.playerIndex, 'hammer_federation', px, py, 800, 'structure', 'production', bc.buildingDefId, cost.providesSupply, cost.providesIndustry);
        this.addBuilding(bld);
        break;
      }
      case 'gather': {
        // AI 采集命令
        for (const id of cmd.unitIds) {
          const unit = this.unitMap.get(id);
          const gc = cmd as any;
          if (unit && unit.isAlive && gc.resourceFieldId) {
            const field = this.fieldMap.get(gc.resourceFieldId);
            if (field && field.isActive && !field.isDepleted) {
              unit.state = 'gathering';
              unit.targetResourceId = field.id;
              (unit as any)._gatherTimer = 0;
              MovementSystem.navigate(unit, { x: field.tileX, y: field.tileY }, this.world.map);
            }
          }
        }
        break;
      }
    }
  }

  // ============ 单位生成 ============

  private spawnUnit(unitDefId: string, pos: Point, owner: number): void {
    const cost = UNIT_COSTS[unitDefId];
    if (!cost) return;

    const faction = owner === 0 ? 'arcane_empire' as const : 'hammer_federation' as const;

    let unit: Unit;
    switch (unitDefId) {
      case 'unit_worker':
        unit = new Unit(owner, faction, pos.x, pos.y, 80, 'light', 'infantry', 2.0, 5, 'physical', 3, 1.0, 5, 'unit_worker');
        break;
      case 'unit_rifleman':
        unit = new Unit(owner, faction, pos.x, pos.y, 120, 'light', 'infantry', 2.2, 18, 'physical', 5, 0.8, 7, 'unit_rifleman');
        break;
      case 'unit_battle_mage':
        unit = new Unit(owner, faction, pos.x, pos.y, 150, 'light', 'infantry', 2.5, 30, 'magic', 6, 1.2, 6, 'unit_battle_mage');
        break;
      default:
        return;
    }

    this.addUnit(unit);
    EventBus.emit(GameEvent.UNIT_CREATED, {
      unitId: unit.id,
      playerIndex: owner,
      defId: unitDefId,
      position: { x: pos.x, y: pos.y },
    });
  }

  // ============ 建造系统 ============

  /** 进入建造模式 */
  enterBuildMode(buildingDefId: string, builderId: string): void {
    const cost = BUILDING_COSTS[buildingDefId];
    if (!cost) return;
    if (!this.world.canAfford(0, { crystal: cost.crystal, industry: cost.industry })) return;

    this.buildMode = { buildingDefId, builderId };
    // 创建预览精灵（半透明）
    if (!this.buildPreview) {
      this.buildPreview = this.add.image(0, 0, buildingDefId);
      this.buildPreview.setAlpha(0.5);
      this.buildPreview.setDepth(30);
      this.buildPreview.setDisplaySize(48, 48);
    }
  }

  /** 退出建造模式 */
  cancelBuildMode(): void {
    this.buildMode = null;
    if (this.buildPreview) { this.buildPreview.destroy(); this.buildPreview = null; }
  }

  /** 更新建造预览位置 */
  private updateBuildPreviewPosition(): void {
    if (!this.buildMode || !this.buildPreview) return;
    const pointer = this.input.activePointer;
    const tile = { x: Math.floor(pointer.worldX / 32), y: Math.floor(pointer.worldY / 32) };
    const world = { x: tile.x * 32 + 16, y: tile.y * 32 + 16 };

    this.buildPreview.setPosition(world.x, world.y);

    // 检查是否可放置
    const map = this.world.map;
    const inBounds = map.inBounds(tile.x, tile.y) && map.isPassable(tile.x, tile.y);
    const noOverlap = !this.buildings.some(b => b.isAlive && b.tileX === tile.x && b.tileY === tile.y);
    this.buildPreview.setTint(inBounds && noOverlap ? 0x88ff88 : 0xff4444);
  }

  /** 确认放置建筑 */
  confirmBuild(tileX: number, tileY: number): void {
    if (!this.buildMode) return;

    const defId = this.buildMode.buildingDefId;
    const cost = BUILDING_COSTS[defId];
    if (!cost) return;

    const map = this.world.map;
    if (!map.inBounds(tileX, tileY) || !map.isPassable(tileX, tileY)) return;
    if (this.buildings.some(b => b.isAlive && b.tileX === tileX && b.tileY === tileY)) return;
    if (!this.world.canAfford(0, { crystal: cost.crystal, industry: cost.industry })) return;

    this.world.spend(0, { crystal: cost.crystal, industry: cost.industry });

    // 创建建筑
    const bld = new Building(
      0, 'arcane_empire', tileX, tileY, 800, 'structure', 'production',
      defId, cost.providesSupply, cost.providesIndustry,
    );
    this.addBuilding(bld);

    // 通知建造者走到建筑旁
    const builder = this.unitMap.get(this.buildMode.builderId);
    if (builder && builder.isAlive) {
      builder.stopAttacking();
      MovementSystem.navigate(builder, { x: tileX, y: tileY + 1 }, this.world.map);
    }

    this.cancelBuildMode();
  }

  /** 每帧更新建造中的建筑进度 */
  private updateBuildingConstruction(deltaSec: number): void {
    // 更新预览位置
    this.updateBuildPreviewPosition();

    for (const bld of this.buildings) {
      if (!bld.isAlive || bld.state !== 'constructing') continue;
      const cost = BUILDING_COSTS[bld.spriteKey];
      if (!cost) { bld.complete(); continue; }

      bld.buildProgress += deltaSec / cost.time;
      if (bld.buildProgress >= 1) {
        bld.complete();
        EventBus.emit(GameEvent.BUILDING_COMPLETE, {});
      }
    }
  }

  // ============ 弹射物 ============

  private spawnProjectile(attacker: Unit, targetId: string): void {
    const proj = new Projectile(
      attacker.owner,
      attacker.faction,
      attacker.tileX, attacker.tileY,
      attacker.id, targetId,
      15, // 弹速 tiles/s
      attacker.attackDamage,
      attacker.attackType,
      true,
    );
    this.projectiles.push(proj);

    const w = tileToWorld(proj.tileX, proj.tileY);
    const rect = this.add.rectangle(w.x, w.y, 4, 4, 0xffff00, 1);
    rect.setDepth(20);
    this.projectileSprites.set(proj.id, rect);
  }

  private updateProjectiles(deltaSec: number): void {
    const toRemove: string[] = [];

    for (const proj of this.projectiles) {
      if (!proj.isActive) continue;

      // 查找目标
      const target = this.unitMap.get(proj.targetId) ?? this.buildingMap.get(proj.targetId);
      if (!target || !target.isAlive) {
        proj.isActive = false;
        toRemove.push(proj.id);
        continue;
      }

      // 向目标移动
      const dx = target.tileX - proj.tileX;
      const dy = target.tileY - proj.tileY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.3) {
        // 命中
        target.takeDamage(proj.damage);
        proj.isActive = false;
        toRemove.push(proj.id);

        if (!target.isAlive) {
          EventBus.emit(GameEvent.UNIT_KILLED, {
            unitId: target.id,
            killerId: proj.sourceId,
            playerIndex: target.owner,
          });
        }
      } else {
        const move = proj.speed * deltaSec;
        const ratio = move / dist;
        proj.tileX += dx * ratio;
        proj.tileY += dy * ratio;
      }

      // 同步精灵
      const sprite = this.projectileSprites.get(proj.id);
      if (sprite) {
        const w = tileToWorld(proj.tileX, proj.tileY);
        sprite.setPosition(w.x, w.y);
      }
    }

    for (const id of toRemove) {
      const idx = this.projectiles.findIndex(p => p.id === id);
      if (idx !== -1) this.projectiles.splice(idx, 1);
      const sprite = this.projectileSprites.get(id);
      if (sprite) { sprite.destroy(); this.projectileSprites.delete(id); }
    }
  }

  // ============ 死亡清理 ============

  private cleanupDeadEntities(): void {
    const deadUnits = this.units.filter(u => !u.isAlive);

    for (const unit of deadUnits) {
      // 返还占用的 supply
      const player = this.world.players[unit.owner];
      if (player && player.resources.supply > 0) {
        player.resources.supply -= 1;
      }

      // 如果正在采集，释放采集位
      if (unit.targetResourceId) {
        const f = this.fieldMap.get(unit.targetResourceId);
        if (f && f.currentGatherers > 0) f.currentGatherers--;
        unit.targetResourceId = null;
      }
      // 从选中列表中移除
      const sel = this.inputCtrl.getSelection();
      if (sel.includes(unit.id)) {
        this.inputCtrl.clearSelection();
        this.updateSelectionHighlight();
        EventBus.emit(GameEvent.SELECTION_CHANGED, { unitIds: [], playerIndex: 0 });
      }
      this.removeUnit(unit.id);
    }

    const deadBuildings = this.buildings.filter(b => !b.isAlive);
    for (const bld of deadBuildings) {
      if (this.selectedBuildingId === bld.id) {
        this.selectedBuildingId = null;
        this.updateSelectionHighlight();
      }
      this.removeBuilding(bld.id);
    }

    // 清理枯竭资源田
    const depleted = this.resourceFields.filter(f => f.isDepleted || !f.isActive);
    for (const field of depleted) {
      const idx = this.resourceFields.indexOf(field);
      if (idx !== -1) this.resourceFields.splice(idx, 1);
      this.fieldMap.delete(field.id);
      const sprite = this.resourceSprites.get(field.id);
      if (sprite) { sprite.destroy(); this.resourceSprites.delete(field.id); }
    }
  }

  // ============ 胜负检测 ============

  private _gameOver = false;

  private checkGameOver(): void {
    if (this._gameOver) return;

    const aliveBuildings = (owner: number) =>
      this.buildings.some(b => b.owner === owner && b.isAlive);

    const playerDead = !aliveBuildings(0);
    const aiDead = !aliveBuildings(1);

    if (!playerDead && !aiDead) return;

    this._gameOver = true;
    const winner = aiDead ? 0 : 1;

    EventBus.emit(GameEvent.GAME_OVER, {
      winnerIndex: winner,
      reason: 'annihilated',
    });

    // 屏幕中央提示
    const text = winner === 0 ? '🏆 胜利！敌方基地已被摧毁' : '💀 失败…我方基地已被摧毁';
    const color = winner === 0 ? '#ffd700' : '#ff4444';
    this.add.text(1280 / 2, 720 / 2 - 20, text, {
      fontSize: '32px',
      color,
      backgroundColor: '#1a1a2ecc',
      padding: { x: 24, y: 12 },
      fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setDepth(500).setScrollFactor(0);

    // 暂停游戏循环（_gameOver 标记会阻断 update）
  }

  // ============ 精灵同步 ============

  private syncSprites(): void {
    // 衰减闪光计时器
    const dt = this.game.loop.delta / 1000;

    for (const unit of this.units) {
      const sprite = this.unitSprites.get(unit.id);
      if (!sprite) continue;

      const w = tileToWorld(unit.tileX, unit.tileY);
      sprite.setPosition(w.x, w.y);

      if (unit.isAlive) {
        // 击中闪光：tint 白色
        const flashRemain = this.flashTimers.get(unit.id);
        if (flashRemain && flashRemain > 0) {
          sprite.setTint(0xffffff);
          sprite.setAlpha(1.0);
          this.flashTimers.set(unit.id, flashRemain - dt);
        } else {
          this.flashTimers.delete(unit.id);
          sprite.setAlpha(0.9);
          sprite.clearTint();
        }

        // 头顶血条（仅受伤时显示）
        if (unit.hpPercent < 1.0) {
          this.drawHpBar(unit.id, w.x - 8, w.y - 14, unit.hpPercent);
        } else {
          this.clearHpBar(unit.id);
        }
      } else {
        sprite.setAlpha(0);
        this.clearHpBar(unit.id);
      }
    }

    // 清理已死亡单位残留的血条
    for (const [id] of this._hpBarCache) {
      if (!this.unitMap.has(id) && !this.buildingMap.has(id)) this.clearHpBar(id);
    }

    // === 建筑血条 ===
    for (const bld of this.buildings) {
      const sprite = this.buildingSprites.get(bld.id);
      if (!sprite || !bld.isAlive) continue;

      const w = tileToWorld(bld.tileX, bld.tileY);
      sprite.setPosition(w.x, w.y);

      // 受伤建筑显示血条
      if (bld.hpPercent < 1.0) {
        this.drawHpBar(bld.id, w.x - 12, w.y - 16, bld.hpPercent);
      } else {
        this.clearHpBar(bld.id);
      }

      // 建筑闪光（被攻击时）
      const flashRemain = this.flashTimers.get(bld.id);
      if (flashRemain && flashRemain > 0) {
        sprite.setTint(0xffffff);
        sprite.setAlpha(1.0);
        this.flashTimers.set(bld.id, flashRemain - dt);
      } else if (bld.hpPercent < 1.0) {
        this.flashTimers.delete(bld.id);
        sprite.clearTint();
        sprite.setAlpha(0.9);
      }
    }
  }

  // 血条缓存：每个单位一个 Graphics
  private _hpBarCache = new Map<string, Phaser.GameObjects.Graphics>();

  private drawHpBar(unitId: string, x: number, y: number, hpPct: number): void {
    let bar = this._hpBarCache.get(unitId);
    if (!bar) {
      bar = this.add.graphics();
      bar.setDepth(15);
      this._hpBarCache.set(unitId, bar);
    }
    bar.clear();

    const barW = 16;
    const barH = 2;

    // 背景
    bar.fillStyle(0x333333, 0.8);
    bar.fillRect(x, y, barW, barH);

    // 血量颜色：绿(满血) → 黄(半血) → 红(残血)
    const r = hpPct < 0.5 ? 255 : Math.floor(255 * (1 - hpPct) * 2);
    const g = hpPct > 0.5 ? 255 : Math.floor(255 * hpPct * 2);
    const color = (r << 16) | (g << 8) | 0;

    bar.fillStyle(color, 1);
    bar.fillRect(x, y, barW * hpPct, barH);
  }

  private clearHpBar(unitId: string): void {
    const bar = this._hpBarCache.get(unitId);
    if (bar) { bar.destroy(); this._hpBarCache.delete(unitId); }
  }

  // ============ 迷雾渲染 ============

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
          this.fogOverlay.fillStyle(0x000000, 1);
          this.fogOverlay.fillRect(x * ts, y * ts, ts, ts);
        } else if (state === 1) {
          this.fogOverlay.fillStyle(0x000000, 0.5);
          this.fogOverlay.fillRect(x * ts, y * ts, ts, ts);
        }
      }
    }
  }
}

