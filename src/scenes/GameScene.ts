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
import { GuildSystem } from '../systems/GuildSystem';
import { HeroSystem } from '../systems/HeroSystem';
import { TechTreeSystem } from '../systems/TechTreeSystem';
import { Hero } from '../entities/Hero';
import { FogRenderer } from '../rendering/FogRenderer';
import { HpBarRenderer } from '../rendering/HpBarRenderer';
import { ProjectileController } from '../controllers/ProjectileController';
import { BuildController } from '../controllers/BuildController';
import { UnitSpawner } from '../controllers/UnitSpawner';
import { getFactionHero } from '../config/heroData';
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
import { UNIT_DEFS, BUILDING_DEFS, getBuildingCost, getFactionBonuses, FACTION_DEFS, TECH_DEFS } from '../config/unitData';
import { SoundManager } from '../utils/SoundManager';

// 运行时从配置生成（兼容现有代码）
const UNIT_COSTS = Object.fromEntries(
  Object.entries(UNIT_DEFS).map(([k, v]) => [k, { ...v.cost, category: v.stats.category }])
) as Record<string, { crystal: number; supply: number; time: number; category: string }>;
// P0修复: 移除不含阵营倍率的BUILDING_COSTS常量
// 统一使用 getBuildingCost(buildingDefId, factionId) 含联邦-20%加成
// const BUILDING_COSTS 已删除

export class GameScene extends Phaser.Scene {
  world!: GameWorld;
  private cameraCtrl!: CameraController;
  private inputCtrl!: InputController;
  private techTree!: TechTreeSystem;
  private aiController!: AIController;

  /** 科技效果缓存（从 techTree 计算，每次研究完成时刷新） */
  private techEffects = { gatherMult: 1.0, infantryArmor: 0, buildingHpMult: 1.0 };

  /** 刷新科技效果缓存 */
  private refreshTechEffects(): void {
    this.techEffects = {
      gatherMult: this.techTree.isResearched('tech:advanced_mining') ? 1.2 : 1.0,
      infantryArmor: this.techTree.isResearched('tech:infantry_armor') ? 5 : 0,
      buildingHpMult: this.techTree.isResearched('tech:structure_reinforce') ? 1.2 : 1.0,
    };
  }

  /** 将科技效果应用到单位（新建单位时调用） */
  private applyTechToUnit(unit: Unit): void {
    const te = this.techEffects;
    if (unit.category === 'infantry' && te.infantryArmor > 0) {
      unit.armor = te.infantryArmor;
    }
  }

  /** 将科技效果应用到建筑（新建建筑时调用） */
  private applyTechToBuilding(bld: Building): void {
    const te = this.techEffects;
    if (te.buildingHpMult !== 1.0) {
      bld.maxHp = Math.round(bld.maxHp * te.buildingHpMult);
      bld.hp = Math.min(bld.hp, bld.maxHp);
    }
  }

  // 实体列表 + 快速查找
  private units: Unit[] = [];
  private heroes: Hero[] = [];
  private buildings: Building[] = [];
  private resourceFields: ResourceField[] = [];
  // projectiles 已迁移至 ProjectileController

  private unitMap = new Map<string, Unit>();
  private buildingMap = new Map<string, Building>();
  private fieldMap = new Map<string, ResourceField>();

  // 精灵映射（改用 Phaser Image 替代 Rectangle，支持 PNG纹理+tint）
  private unitSprites = new Map<string, Phaser.GameObjects.Image>();
  private buildingSprites = new Map<string, Phaser.GameObjects.Image>();
  private resourceSprites = new Map<string, Phaser.GameObjects.Image>();
  // projectileSprites 已迁移至 ProjectileController

  // 地图渲染（不再持有 Graphics，改为大量 Image 对象由 Phaser 自动批处理）
  private fogOverlay!: Phaser.GameObjects.Graphics;

  // 选中状态（同时支持单位和建筑）
  private selectedBuildingId: string | null = null;

  // HUD 资源更新计时
  private _lastHudTick: number = 0;

  // 战斗视觉
  private flashTimers = new Map<string, number>();  // 单位→剩余闪光秒数
  private attackMoveMode = false;                    // A键攻击移动模式

  // 建造系统
  private buildController!: BuildController;
  // 向后兼容旧引用
  private buildMode: { buildingDefId: string; builderId: string } | null = null;
  private buildPreview: Phaser.GameObjects.Image | null = null;
  // 弹射物控制器
  private projectileController!: ProjectileController;
  // 血条渲染器
  private hpBarRenderer!: HpBarRenderer;
  private unitSpawner!: UnitSpawner;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ============ 初始化 ============

  private _mapId: string = 'map_valley';
  private _playerFaction: string = 'arcane_empire';
  private _aiDifficulty: string = 'normal';

  init(data?: { map?: string; playerFaction?: string; aiDifficulty?: string }): void {
    this._mapId = data?.map ?? 'map_valley';
    this._playerFaction = data?.playerFaction ?? 'arcane_empire';
    this._aiDifficulty = data?.aiDifficulty ?? 'normal';
  }

  preload(): void {
    // 加载地图 JSON
    this.load.json('mapData', `data/maps/${this._mapId}.json`);
  }

  create(): void {
    const mapJson = this.cache.json.get('mapData') as any;
    const mapW = mapJson?.width ?? 64;
    const mapH = mapJson?.height ?? 64;
    const tileSize = 32;

    // 初始化 GameWorld
    this.world = new GameWorld(mapW, mapH, tileSize);

    // 如果 JSON 有 tiles 数据，加载到地图
    if (mapJson?.tiles) {
      this.world.map.loadFromData(mapJson);
    }

    // 玩家选择的阵营 → AI 使用对立阵营
    const playerFaction = this._playerFaction as 'arcane_empire' | 'hammer_federation';
    const aiFaction = playerFaction === 'arcane_empire' ? 'hammer_federation' : 'arcane_empire';
    const playerCC = playerFaction === 'arcane_empire' ? 'bld_cc_empire' : 'bld_cc_federation';
    const aiCC = aiFaction === 'arcane_empire' ? 'bld_cc_empire' : 'bld_cc_federation';

    this.world.addPlayer(playerFaction, ['mages_guild', 'alchemists_society'], false);
    this.world.addPlayer(aiFaction, ['mechanists_guild', 'alchemists_society'], true);

    // 初始化子系统
    this.cameraCtrl = new CameraController(this.cameras.main, mapW, mapH, tileSize);
    this.inputCtrl = new InputController(this, 0);
    this.techTree = new TechTreeSystem();
    this.aiController = new AIController(this.world, 1, this._aiDifficulty as 'easy' | 'normal' | 'hard');
    this.projectileController = new ProjectileController(this);
    this.buildController = new BuildController(this);
    this.hpBarRenderer = new HpBarRenderer(this);
    this.unitSpawner = new UnitSpawner(this.world.map,
      (u) => this.addUnit(u),
      (b) => { this.applyTechToBuilding(b); this.addBuilding(b); },
      (owner) => this.world.players[owner]?.faction ?? 'arcane_empire',
    );

    // 渲染世界
    this.renderTiles();
    // 用 JSON 中的水晶矿数据替代硬编码
    if (mapJson?.crystalFields && mapJson.crystalFields.length > 0) {
      for (const cf of mapJson.crystalFields) {
        const field = new ResourceField(cf.x, cf.y, 'crystal', cf.amount ?? 5000, 3);
        this.addResourceField(field);
      }
    } else {
      this.placeInitialResources();
    }
    // 读取地图出生点
    const p0Start = mapJson?.startPositions?.find((s: any) => s.player === 0);
    const p1Start = mapJson?.startPositions?.find((s: any) => s.player === 1);
    const p0x = p0Start?.x ?? 6;
    const p0y = p0Start?.y ?? 6;
    const p1x = p1Start?.x ?? 56;
    const p1y = p1Start?.y ?? 56;

    this.unitSpawner.placeStartingUnits({x: p0x, y: p0y}, {x: p1x, y: p1y}, this._playerFaction, aiFaction);
    this.initializeFogOfWar();
    this.setupInputCallbacks();

    // 键盘快捷键
    this.setupKeyboard();

    // 开局聚焦玩家实际出生点
    this.cameraCtrl.centerOn(p0x * tileSize + tileSize/2, p0y * tileSize + tileSize/2);

    // 通知 HUDScene 初始化小地图
    const hudScene = this.scene.get('HUDScene') as any;
    if (hudScene && hudScene.initMinimap) {
      hudScene.initMinimap(this.world.map, this.world.fogOfWar, this.cameraCtrl);
    }

    // 开局跑一次资源计算（让 population/industry 正确反映建筑提供值）
    ResourceSystem.updateResources(this.world.players, this.units, this.buildings, 0);

    // 发射初始资源事件（让 HUD 正确显示）
    const p0 = this.world.players[0];
    EventBus.emit(GameEvent.RESOURCE_CHANGED, {
      playerIndex: 0,
      resource: 'crystal',
      newValue: p0.resources.crystal,
      delta: p0.resources.crystal,
    });
    // HUDScene 并行启动（在 create 末尾）
    if (!this.scene.isActive('HUDScene')) {
      this.scene.launch('HUDScene');
    }

    EventBus.emit(GameEvent.GAME_STARTED, {});

    // 音效事件监听
    this.setupSoundListeners();
  }

  // ============ 地图渲染 ============

  /** 用 AssetGenerator 已生成的 tile_* 纹理绘制地图瓦片 */
  private renderTiles(): void {
    const map = this.world.map;
    const ts = map.config.tileSize;

    for (let y = 0; y < map.config.height; y++) {
      for (let x = 0; x < map.config.width; x++) {
        const terrain = map.getTile(x, y);
        const texKey = `tile_${terrain}`;
        // 如果 terrain 是合法值则纹理一定已生成，否则回退到 tile_grass
        const key = this.textures.exists(texKey) ? texKey : 'tile_grass';
        const img = this.add.image(x * ts + ts / 2, y * ts + ts / 2, key);
        img.setDepth(0);
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

  private placeStartingUnits(p0x: number, p0y: number, p1x: number, p1y: number): void {
    const pf = this._playerFaction;
    const af = pf === 'arcane_empire' ? 'hammer_federation' : 'arcane_empire';
    const pCC = pf === 'arcane_empire' ? 'bld_cc_empire' : 'bld_cc_federation';
    const aCC = af === 'arcane_empire' ? 'bld_cc_empire' : 'bld_cc_federation';
    this.spawnFactionStartingUnits(0, pf, p0x, p0y, pCC);
    this.spawnFactionStartingUnits(1, af, p1x, p1y, aCC);
  }

  /** 按阵营配置生成起始单位 */
  private spawnFactionStartingUnits(
    owner: number, factionId: string, bx: number, by: number, ccBldId: string
  ): void {
    const fd = FACTION_DEFS[factionId];
    if (!fd) return;

    // 指挥中心
    const cc = new Building(owner, factionId as any, bx, by, 2000, 'structure', 'production',
      ccBldId, 50, fd.startingIndustry);
    cc.complete();
    this.applyTechToBuilding(cc);
    this.addBuilding(cc);

    // 起始单位 — 使用安全出生点搜索
    let nextSpawnX = bx + 1;
    let nextSpawnY = by + 2;
    for (const [unitDefId, count] of fd.startingUnits) {
      const def = UNIT_DEFS[unitDefId];
      if (!def) continue;
      const s = def.stats;
      for (let i = 0; i < count; i++) {
        const safe = this.world.map.findNearbyPassable(nextSpawnX, nextSpawnY, 8);
        const ux = safe ? safe.x : nextSpawnX;
        const uy = safe ? safe.y : nextSpawnY;
        const unit = new Unit(owner, factionId as any, ux, uy,
          s.hp, s.armor, s.category, s.speed, s.damage, s.dmgType,
          s.range, s.cooldown, s.sight, unitDefId, def.abilities ?? []);
        this.applyTechToUnit(unit);
        this.addUnit(unit);
        nextSpawnX = ux + 1;
        nextSpawnY = uy;
      }
    }
  }

  private initializeFogOfWar(): void {
    const fog = this.world.fogOfWar;
    // 环绕双方出生点 12×12 区域
    const cc = this.buildings.find(b => b.owner === 0 && b.isAlive);
    const aiCC = this.buildings.find(b => b.owner === 1 && b.isAlive);
    if (cc) fog.revealArea(cc.tileX - 3, cc.tileY - 3, 12, 12);
    if (aiCC) fog.revealArea(aiCC.tileX - 3, aiCC.tileY - 3, 12, 12);
    fog.update(
      this.units.map(u => ({ tileX: Math.round(u.tileX), tileY: Math.round(u.tileY), sight: u.sight, owner: u.owner })),
      0,
    );
  }

  // ============ 实体增删 ============

  addUnit(unit: Unit): void {
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

      // 检查点击位置是否有己方运输卡车（装载逻辑）
      const ownTransportAtTile = selection.length > 0
        ? this.units.find(u =>
            u.owner === 0 && u.isAlive && u.spriteKey === 'unit_transport' &&
            Math.round(u.tileX) === tile.x && Math.round(u.tileY) === tile.y
          )
        : null;

      for (const id of selection) {
        const unit = this.unitMap.get(id);
        if (!unit || !unit.isAlive) continue;

        // 运输卡车装载：选中步兵右键点击己方运输卡车
        if (ownTransportAtTile && unit.category === 'infantry' && unit.id !== ownTransportAtTile.id) {
          if (ownTransportAtTile.cargo.length < 12) {
            ownTransportAtTile.cargo.push(unit);
            // 从地图上移除单位进入装载状态
            const sprite = this.unitSprites.get(unit.id);
            if (sprite) sprite.setAlpha(0);
            unit.isActive = false;
            unit.state = 'idle';
          }
          continue;
        }

        if (enemyAtTile) {
          // 攻击命令
          unit.stopAttacking();
          unit.attackTarget(enemyAtTile.id);
          MovementSystem.navigate(unit, tile, this.world.map);
          unit.state = 'pursuing';
        } else if (unit.spriteKey === 'unit_transport' && unit.cargo.length > 0) {
          // 运输卡车卸载：右键地面卸下所有乘员
          unit.stopAttacking();
          MovementSystem.navigate(unit, tile, this.world.map);
          // 到达后卸载（由每帧检查 proximity 触发）
          (unit as any)._unloadTarget = { x: tile.x, y: tile.y };
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

    // 滚轮缩放
    this.input.on('wheel', (_pointer: any, _gx: any, _gy: any, _gz: any, delta: any) => {
      if (delta && delta.y) this.cameraCtrl.zoomAt(delta.y);
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
    // 选中视觉由 syncSprites() 统一处理（tint 方式），
    // 此处只确保输入状态已更新（selection 已在调用方设置好）
  }

  // ============ 主循环 ============

  update(_time: number, delta: number): void {
    if (this._gameOver) return;
    const deltaSec = delta / 1000;

    // 0. 建造预览跟随鼠标
    if (this.buildController.isActive) this.buildController.updatePreview(this.input.activePointer, this.world.map, this.buildings);

    // 1. 摄像机
    this.cameraCtrl.update(this.input.activePointer);

    // 2. 单位移动
    for (const unit of this.units) {
      if (!unit.isAlive) continue;
      const wasMoving = unit.state === 'moving';
      MovementSystem.updateMovement(unit, deltaSec, this.world.map);

      // 移动结束 → 运输卡车卸载、工人采集
      if (wasMoving && unit.state === 'idle') {
        // 运输卡车卸载
        const unloadTarget = (unit as any)._unloadTarget;
        if (unit.spriteKey === 'unit_transport' && unloadTarget) {
          for (const passenger of unit.cargo) {
            passenger.tileX = unit.tileX + (Math.random() - 0.5) * 2;
            passenger.tileY = unit.tileY + (Math.random() - 0.5) * 2;
            passenger.isActive = true;
            const sp = this.unitSprites.get(passenger.id);
            if (sp) sp.setAlpha(1);
          }
          unit.cargo = [];
          (unit as any)._unloadTarget = null;
        }
        // 工人采集
        if (unit.targetResourceId) {
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
    }

    // 3. AI 决策 → 执行命令
    const aiCmds = this.aiController.update(deltaSec, this.units, this.buildings, this.resourceFields);
    for (const cmd of aiCmds) {
      this.executeCommand(cmd);
    }

    // 3.5. 迷雾更新（必须在战斗之前，确保索敌时可见性正确）
    this.world.fogOfWar.update(
      this.units.map(u => ({
        tileX: Math.round(u.tileX),
        tileY: Math.round(u.tileY),
        sight: u.sight,
        owner: u.owner,
      })),
      0,
    );

    // 4. 战斗（索敌 + 伤害 + 弹射事件）
    const combatEvents = CombatSystem.updateCombat(
      this.units, this.buildings,
      this.units, this.buildings,
      this.world.map,
      deltaSec,
      this.world.fogOfWar,
    );
    for (const evt of combatEvents) {
      EventBus.emit(GameEvent.UNIT_ATTACK_START, {
        attackerId: evt.attackerId,
        targetId: evt.targetId,
      });

      if (evt.isMelee) {
        // 近战：伤害已即时结算，只需闪光反馈
        this.flashTimers.set(evt.targetId, 0.12);
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
      } else {
        // 远程：生成弹道，伤害由弹道命中时结算
        const attacker = this.unitMap.get(evt.attackerId);
        if (attacker) {
          this.projectileController.spawn(attacker, evt.targetId, evt.damage, evt.attackEffect);
        }
      }
    }

    // 4.5 行会机制（奥术充能 / 流水线协议）
    GuildSystem.update(this.world.players, this.units, this.buildings, deltaSec);

    // 4.6 英雄系统（被动光环 + 主动技能）
    const heroCmds = HeroSystem.update(this.heroes, this.units, this.buildings, this.world, deltaSec);
    for (const cmd of heroCmds) {
      this.executeCommand(cmd);
    }

    // 5. 采集
    const gatherMults = new Map<number, number>();
    // 玩家0科技采集加成
    gatherMults.set(0, this.techEffects.gatherMult);
    // AI也享受（共享科技树，简化处理）
    gatherMults.set(1, this.techEffects.gatherMult);
    const gatherEvents = ResourceSystem.updateGathering(
      this.units,
      this.resourceFields,
      this.world.players,
      deltaSec,
      this.buildings,
      gatherMults,
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

    // 6. 资源（补给/工业上限 + 工业自然增长）
    ResourceSystem.updateResources(this.world.players, this.units, this.buildings, deltaSec);

    // 7. 生产 → 生成单位
    const completed = ProductionSystem.updateProduction(this.buildings, deltaSec);
    for (const item of completed) {
      const building = this.buildingMap.get(item.buildingId);
      if (building) {
        this.unitSpawner.spawnUnit(item.unitDefId, item.position, building.owner);

        EventBus.emit(GameEvent.PRODUCTION_COMPLETE, {
          buildingId: item.buildingId,
          playerIndex: building.owner,
          unitDefId: item.unitDefId,
        });
      }
    }

    // 7.1 建造进度
    this.updateBuildingConstruction(deltaSec);

    // 7.2 研究进度
    this.updateResearch(deltaSec);

    // 8. 弹射物更新
    this.projectileController.update(deltaSec, this.unitMap, this.buildingMap, this.units, this.buildings, this.flashTimers);

    // 9. 死亡清理
    this.cleanupDeadEntities();

    // 胜负检测
    this.checkGameOver();

    // 10. 精灵同步 + 迷雾渲染
    this.syncSprites();
    FogRenderer.render(this.fogOverlay, this.world.fogOfWar, this.world.map.config.width, this.world.map.config.height, 32, this.cameras.main);

    // 11. HUD 资源更新（每 0.5 秒发一次，减少事件频率）
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
            // navigate 会 setPath 覆盖 state='moving'
            // 如果单位有攻击目标 → 改为 pursuing，让 CombatSystem 接管攻击
            if (cmd.type === 'attack_move' && unit.targetEntityId) {
              unit.state = 'pursuing';
            }
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
        // AI自动放置建造 — 搜索 CC 附近可行走位置
        const bc = cmd as any;
        const aiFaction = this.world.players[cmd.playerIndex]?.faction ?? 'hammer_federation';
        const cost = getBuildingCost(bc.buildingDefId, aiFaction);
        if (!cost) break;
        if (!this.world.canAfford(cmd.playerIndex, { crystal: cost.crystal })) break;
        const aiCC = this.buildings.find(b => b.owner === cmd.playerIndex && b.isAlive);
        if (!aiCC) break;
        // 从 CC 周围搜索第一个可通过瓦片
        const safePos = this.world.map.findNearbyPassable(aiCC.tileX + 3, aiCC.tileY + 3, 15);
        if (!safePos) break;
        // 检查是否已有建筑在此位置
        if (this.buildings.some(b => b.isAlive && b.tileX === safePos.x && b.tileY === safePos.y)) break;
        this.world.spend(cmd.playerIndex, { crystal: cost.crystal });
        const bldDef = BUILDING_DEFS[bc.buildingDefId];
        const bldHp = bldDef ? bldDef.hp : 800;
        const bld = new Building(cmd.playerIndex, aiFaction, safePos.x, safePos.y, bldHp, 'structure', 'production', bc.buildingDefId, cost.providesSupply, cost.providesIndustry);
        this.applyTechToBuilding(bld);
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
              field.currentGatherers++;
              unit.state = 'gathering';
              unit.targetResourceId = field.id;
              (unit as any)._gatherTimer = 0;
              MovementSystem.navigate(unit, { x: field.tileX, y: field.tileY }, this.world.map);
            }
          }
        }
        break;
      }
      case 'research': {
        const rc = cmd as any;
        const bld = this.buildingMap.get(rc.buildingId);
        if (!bld || bld.owner !== cmd.playerIndex) break;

        const tech = TECH_DEFS[rc.techDefId];
        if (!tech) break;
        if (!this.world.canAfford(cmd.playerIndex, { crystal: tech.crystal })) break;
        if (this.techTree.isResearched(rc.techDefId)) break;
        if (bld.researchingTechId) break; // 已在研究
        if (bld.state !== 'idle') break;

        this.world.spend(cmd.playerIndex, { crystal: tech.crystal });
        bld.researchingTechId = rc.techDefId;
        bld.researchProgress = 0;
        // 帝国研究速度+15%，联邦研究速度不变
        const factionBonuses = getFactionBonuses(bld.faction);
        bld.researchTotalTime = tech.time * factionBonuses.researchSpeedMult;
        bld.state = 'researching';
        EventBus.emit(GameEvent.PRODUCTION_STARTED, {
          buildingId: bld.id, playerIndex: cmd.playerIndex,
          unitDefId: rc.techDefId, totalTime: tech.time,
        });
        break;
      }
      case 'spawn': {
        // 马库斯空投：在指定位置生成单位
        const sc = cmd as any;
        for (let i = 0; i < (sc.count ?? 1); i++) {
          const sPos = this.world.map.findNearbyPassable(sc.position.x, sc.position.y, 5);
          if (sPos) {
            this.unitSpawner.spawnUnit(sc.unitDefId, sPos, sc.playerIndex);
          }
        }
        break;
      }
      case 'stop':
      case 'hold_position': {
        for (const id of cmd.unitIds) {
          const unit = this.unitMap.get(id);
          if (!unit || !unit.isAlive) continue;
          unit.stopAttacking();
          unit.clearPath();
          unit.holdPosition = cmd.type === 'hold_position';
          unit.aiLockedAction = null;
          if (cmd.type === 'stop') {
            unit.state = 'idle';
          }
        }
        break;
      }
    }
  }

  // ============ 单位生成 ============

  private spawnUnit(unitDefId: string, pos: Point, owner: number): void {
    // 英雄路径
    if (unitDefId.startsWith('hero:')) {
      const faction = this.world.players[owner]?.faction ?? 'arcane_empire';
      const hero = HeroSystem.trainHero(unitDefId, owner, faction, pos.x, pos.y);
      if (hero) {
        this.heroes.push(hero);
        this.units.push(hero);
        this.unitMap.set(hero.id, hero);
        this.addUnitSprite(hero);
        EventBus.emit(GameEvent.UNIT_CREATED, {
          unitId: hero.id, playerIndex: owner,
          defId: unitDefId, position: { x: pos.x, y: pos.y },
        });
      }
      return;
    }

    const def = UNIT_DEFS[unitDefId];
    if (!def) return;
    // ... rest unchanged

    // 出生点安全检查：如果瓦片不可通过，搜索附近可通过位置
    let spawnX = pos.x;
    let spawnY = pos.y;
    if (!this.world.map.isPassable(spawnX, spawnY)) {
      const safe = this.world.map.findNearbyPassable(spawnX, spawnY, 10);
      if (safe) { spawnX = safe.x; spawnY = safe.y; }
    }

    const faction = this.world.players[owner]?.faction ?? (owner === 0 ? 'arcane_empire' : 'hammer_federation') as any;
    const s = def.stats;
    const unit = new Unit(owner, faction, spawnX, spawnY, s.hp, s.armor, s.category,
      s.speed, s.damage, s.dmgType, s.range, s.cooldown, s.sight, unitDefId, def.abilities ?? []);

    this.applyTechToUnit(unit);

    // 奥术守卫：初始护盾 200
    if (unitDefId === 'unit_arcane_guard') {
      unit.shieldHp = 200;
      unit.maxShieldHp = 200;
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
    if (this.buildController.tryEnter(buildingDefId, builderId, this._playerFaction, this.world)) {
      this.buildMode = this.buildController['mode']; // 同步兼容字段
      this.buildPreview = this.buildController['preview'];
    }
  }

  /** 退出建造模式 */
  cancelBuildMode(): void {
    this.buildController.cancel();
    this.buildMode = null;
    this.buildPreview = null;
  }

  /** 更新建造预览位置 */
  private updateBuildPreviewPosition(): void {
    this.buildController.updatePreview(this.input.activePointer, this.world.map, this.buildings);
  }

  /** 确认放置建筑 */
  confirmBuild(tileX: number, tileY: number): void {
    this.buildController.confirm(tileX, tileY, this._playerFaction, this.world, this.world.map, this.buildings, (b) => { this.applyTechToBuilding(b); this.addBuilding(b); }, (id) => this.unitMap.get(id));
    this.buildMode = null;
    this.buildPreview = null;
  }

  /** 每帧更新建造中的建筑进度 */
  private updateBuildingConstruction(deltaSec: number): void {
    // 更新预览位置
    this.updateBuildPreviewPosition();

    for (const bld of this.buildings) {
      if (!bld.isAlive || bld.state !== 'constructing') continue;
      const cost = getBuildingCost(bld.spriteKey, bld.faction);
      if (!cost) { bld.complete(); continue; }

      bld.buildProgress += deltaSec / cost.time;
      if (bld.buildProgress >= 1) {
        bld.complete();
        EventBus.emit(GameEvent.BUILDING_COMPLETE, {});
      }
    }
  }

  /** 每帧推进研究进度 */
  private updateResearch(deltaSec: number): void {
    for (const bld of this.buildings) {
      if (!bld.isAlive || bld.state !== 'researching' || !bld.researchingTechId) continue;
      bld.researchProgress += deltaSec / bld.researchTotalTime;
      if (bld.researchProgress >= 1) {
        this.techTree.completeTech(bld.researchingTechId);
        const techId = bld.researchingTechId;
        bld.researchingTechId = null;
        bld.researchProgress = 0;
        bld.state = 'idle';

        // 刷新科技效果缓存
        this.refreshTechEffects();

        // 回溯应用科技效果到现有实体
        const te = this.techEffects;
        if (techId === 'tech:infantry_armor') {
          for (const u of this.units) {
            if (u.category === 'infantry' && u.isAlive) u.armor = te.infantryArmor;
          }
        }
        if (techId === 'tech:structure_reinforce') {
          for (const b of this.buildings) {
            if (b.isAlive) {
              b.maxHp = Math.round(b.maxHp * te.buildingHpMult);
              b.hp = Math.min(b.hp, b.maxHp);
            }
          }
        }

        EventBus.emit(GameEvent.RESEARCH_COMPLETE, {
          buildingId: bld.id, playerIndex: bld.owner, techDefId: techId,
        });
      }
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
    const selected = new Set(this.inputCtrl.getSelection());
    const selectedBuilding = this.selectedBuildingId;

    for (const unit of this.units) {
      const sprite = this.unitSprites.get(unit.id);
      if (!sprite) continue;

      const w = tileToWorld(unit.tileX, unit.tileY);
      sprite.setPosition(w.x, w.y);

      if (unit.isAlive) {
        // 击中闪光（白色）优先级最高
        const flashRemain = this.flashTimers.get(unit.id);
        if (flashRemain && flashRemain > 0) {
          sprite.setTint(0xffffff);
          sprite.setAlpha(1.0);
          this.flashTimers.set(unit.id, flashRemain - dt);
        } else {
          this.flashTimers.delete(unit.id);
          sprite.setAlpha(0.9);
          // 选中高亮（黄色）
          if (selected.has(unit.id)) {
            sprite.setTint(0xffff55);
          } else {
            sprite.clearTint();
          }
        }

        // 头顶血条（仅受伤时显示 — 委托 HpBarRenderer）
        if (unit.hpPercent < 1.0) {
          this.hpBarRenderer.draw(unit.id, w.x - 8, w.y - 14, unit.hpPercent);
        } else {
          this.hpBarRenderer.clear(unit.id);
        }
      } else {
        sprite.setAlpha(0);
        this.hpBarRenderer.clear(unit.id);
      }
    }

    // 清理残留血条
    const activeIds = new Set([...this.unitMap.keys(), ...this.buildingMap.keys()]);
    this.hpBarRenderer.cleanup(activeIds);

    // === 建筑血条 ===
    for (const bld of this.buildings) {
      const sprite = this.buildingSprites.get(bld.id);
      if (!sprite || !bld.isAlive) continue;

      const w = tileToWorld(bld.tileX, bld.tileY);
      sprite.setPosition(w.x, w.y);

      // 受伤建筑显示血条
      if (bld.hpPercent < 1.0) {
        this.hpBarRenderer.draw(bld.id, w.x - 12, w.y - 16, bld.hpPercent);
      } else {
        this.hpBarRenderer.clear(bld.id);
      }

      // 建筑闪光（被攻击时）
      const flashRemain = this.flashTimers.get(bld.id);
      if (flashRemain && flashRemain > 0) {
        sprite.setTint(0xffffff);
        sprite.setAlpha(1.0);
        this.flashTimers.set(bld.id, flashRemain - dt);
      } else if (bld.hpPercent < 1.0) {
        this.flashTimers.delete(bld.id);
        // 受伤建筑：也显示选中高亮
        if (bld.id === selectedBuilding) {
          sprite.setTint(0xffff55);
        } else {
          sprite.clearTint();
        }
        sprite.setAlpha(0.9);
      } else {
        // 满血建筑：选中高亮
        this.flashTimers.delete(bld.id);
        if (bld.id === selectedBuilding) {
          sprite.setTint(0xffff55);
        } else {
          sprite.clearTint();
        }
        sprite.setAlpha(0.9);
      }
    }
  }

  // ============ 声音 ============

  private setupSoundListeners(): void {
    // 攻击
    EventBus.on(GameEvent.UNIT_ATTACK_START, () => {
      SoundManager.play('attack', 0.15);
    });

    // 建造完成
    EventBus.on(GameEvent.BUILDING_COMPLETE, () => {
      SoundManager.play('build', 0.25);
    });

    // 单位死亡
    EventBus.on(GameEvent.UNIT_KILLED, () => {
      SoundManager.play('death', 0.2);
    });

    // 生产完成
    EventBus.on(GameEvent.PRODUCTION_COMPLETE, () => {
      SoundManager.play('produce', 0.25);
    });

    // 胜利/失败
    EventBus.on(GameEvent.GAME_OVER, (data) => {
      const d = data as { winnerIndex: number };
      if (d.winnerIndex === 0) {
        SoundManager.play('victory', 0.4);
      } else {
        SoundManager.play('defeat', 0.4);
      }
    });

    // 选择单位（非空选择时发声）
    EventBus.on(GameEvent.SELECTION_CHANGED, (data) => {
      const d = data as { unitIds: string[] };
      if (d.unitIds.length > 0) {
        SoundManager.play('select', 0.12);
      }
    });
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

