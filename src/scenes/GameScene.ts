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
import { BUILDING_DEFS, UNIT_DEFS, TECH_DEFS } from '../config/unitData';
import { HERO_DEFS } from '../config/heroData';
import { Hero } from '../entities/Hero';
import { EntityRegistry } from '../core/EntityRegistry';
import { FogRenderer } from '../rendering/FogRenderer';
import { HpBarRenderer } from '../rendering/HpBarRenderer';
import { ProjectileController } from '../controllers/ProjectileController';
import { BuildController } from '../controllers/BuildController';
import { UnitSpawner } from '../controllers/UnitSpawner';
import { CommandExecutor } from '../controllers/CommandExecutor';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceField } from '../entities/ResourceField';
import { Entity } from '../entities/Entity';
import { AIController } from '../ai/AIController';
import type { AnyCommand } from '../types/commands';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { tileToWorld } from '../utils/MathUtils';
import { registerSoundBindings } from '../rendering/SoundBindings';
import { SpriteRenderer } from '../rendering/SpriteRenderer';

export class GameScene extends Phaser.Scene {
  world!: GameWorld;
  private cameraCtrl!: CameraController;
  private inputCtrl!: InputController;
  private aiController!: AIController;

/** 科技效果缓存（per-player，每次研究完成时刷新） */
  private techEffects = new Map<number, { gatherMult: number; infantryArmor: number; buildingHpMult: number }>();

  // EventBus 监听器引用（供 shutdown 精确移除）
  private _onUnitKilled: ((data: any) => void) | null = null;

  /** 计算采集倍率（多个科技叠乘） */
  private calcGatherMult(tt: TechTreeSystem): number {
    let m = 1.0;
    if (tt.isResearched('tech:advanced_mining')) m *= 1.2;
    if (tt.isResearched('tech:crystal_smelting')) m *= 1.15;
    if (tt.isResearched('tech:refining_tech')) m *= 1.25;
    return m;
  }

  /** 初始化玩家科技效果缓存 */
  private initTechEffects(): void {
    for (let i = 0; i < this.world.players.length; i++) {
      this.refreshTechEffects(i);
    }
  }

  /** 刷新指定玩家的科技效果缓存 */
  private refreshTechEffects(playerIndex: number): void {
    const tt = this.getTechTree(playerIndex);
    this.techEffects.set(playerIndex, {
      gatherMult: this.calcGatherMult(tt),
      infantryArmor: tt.isResearched('tech:infantry_armor') ? 5 : 0,
      buildingHpMult: tt.isResearched('tech:structure_reinforce') ? 1.2 : 1.0,
    });
  }

  /** 获取某玩家的科技效果 */
  private getTechEffects(playerIndex: number) {
    return this.techEffects.get(playerIndex) ?? { gatherMult: 1.0, infantryArmor: 0, buildingHpMult: 1.0 };
  }

  /** 将科技效果应用到单位（新建单位时调用） */
  private applyTechToUnit(unit: Unit): void {
    const te = this.getTechEffects(unit.owner);
    if (unit.category === 'infantry' && te.infantryArmor > 0) {
      unit.armor = unit.baseArmor + te.infantryArmor;
    }
  }

  /** 将科技效果应用到建筑（新建建筑时调用） */
  private applyTechToBuilding(bld: Building): void {
    const te = this.getTechEffects(bld.owner);
    if (te.buildingHpMult !== 1.0) {
      bld.maxHp = Math.round(bld.maxHp * te.buildingHpMult);
      bld.hp = Math.min(bld.hp, bld.maxHp);
    }
  }

  // 实体注册表 — 统一管理所有实体
  private entities = new EntityRegistry();
  // 向后兼容 getter（供 HUDScene / 外部通过 gs.units 等访问）
  get units(): Unit[] { return this.entities.units; }
  get heroes(): Hero[] { return this.entities.heroes; }
  get buildings(): Building[] { return this.entities.buildings; }
  get resourceFields(): ResourceField[] { return this.entities.fields; }
  // projectiles 已迁移至 ProjectileController

  // 精灵映射（改用 Phaser Image 替代 Rectangle，支持 PNG纹理+tint）
  private unitSprites = new Map<string, Phaser.GameObjects.Image>();
  private buildingSprites = new Map<string, Phaser.GameObjects.Image>();
  private resourceSprites = new Map<string, Phaser.GameObjects.Image>();
  // projectileSprites 已迁移至 ProjectileController

  // 地图渲染
  private fogRenderer!: FogRenderer;

  // 选中状态（同时支持单位和建筑）
  private selectedBuildingId: string | null = null;

  // HUD 资源更新计时
  private _lastHudTick: number = 0;

  // 战斗视觉
  private flashTimers = new Map<string, number>();  // 单位→剩余闪光秒数
  private attackMoveMode = false;
  private _soundDispose: (() => void) | null = null;

  // 建造系统
  private buildController!: BuildController;
  // 弹射物控制器
  private projectileController!: ProjectileController;
  // 血条渲染器
  private hpBarRenderer!: HpBarRenderer;
  private unitSpawner!: UnitSpawner;
  private commandExecutor!: CommandExecutor;
  private spriteRenderer!: SpriteRenderer;

  /** 获取某玩家科技树 */
  private getTechTree(playerIndex: number): TechTreeSystem {
    const tt = this.world.techTrees.get(playerIndex);
    if (!tt) throw new Error(`TechTree not found for player ${playerIndex}`);
    return tt;
  }

  constructor() {
    super({ key: 'GameScene' });
  }

  // ============ 初始化 ============

  private _mapId: string = 'map_valley';
  private _playerFaction: string = 'arcane_empire';
  private _aiDifficulty: string = 'normal';
  /** 玩家所选行会 */
  private _playerGuilds: string[] = ['mages_guild', 'alchemists_society'];

  init(data?: { map?: string; playerFaction?: string; aiDifficulty?: string; playerGuilds?: string[] }): void {
    this._mapId = data?.map ?? 'map_valley';
    this._playerFaction = data?.playerFaction ?? 'arcane_empire';
    this._aiDifficulty = data?.aiDifficulty ?? 'normal';
    this._playerGuilds = data?.playerGuilds ?? ['mages_guild', 'alchemists_society'];
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

    // AI 行会：与玩家组合不同（优先选对立组合）
    const aiGuilds = this._playerGuilds.includes('mages_guild')
      ? ['mechanists_guild', 'alchemists_society']  // 机械+炼金 vs 法师+炼金
      : ['mages_guild', 'alchemists_society'];

    this.world.addPlayer(playerFaction, [...this._playerGuilds], false);
    this.world.addPlayer(aiFaction, [...aiGuilds], true);

    // 初始化 per-player 科技效果缓存
    this.initTechEffects();

    // 初始化子系统
    this.cameraCtrl = new CameraController(this.cameras.main, mapW, mapH, tileSize);
    this.inputCtrl = new InputController(this, 0);
    this.aiController = new AIController(this.world, 1, this._aiDifficulty as 'easy' | 'normal' | 'hard');
    this.projectileController = new ProjectileController(this);
    this.buildController = new BuildController(this);
    this.hpBarRenderer = new HpBarRenderer(this);
    this.unitSpawner = new UnitSpawner(this.world.map,
      (u) => { this.applyTechToUnit(u); this.addUnit(u); },
      (b) => { this.applyTechToBuilding(b); this.addBuilding(b); },
      (owner) => this.world.players[owner]?.faction ?? 'arcane_empire',
    );
    this.commandExecutor = new CommandExecutor(
      this.world, this.entities, this.unitSpawner,
      (b) => this.applyTechToBuilding(b),
      (b) => this.addBuilding(b),
    );
    this.spriteRenderer = new SpriteRenderer(
      this.unitSprites, this.buildingSprites, this.flashTimers, this.hpBarRenderer,
    );
    // 迷雾渲染器初始化
    this.fogRenderer = new FogRenderer(this);
    this.fogRenderer.init(mapW, mapH, tileSize);

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

    // 击杀奖励 XP → 英雄（保存引用以便 shutdown 精确移除）
    this._onUnitKilled = (data: any) => { this.rewardHeroXp(data.killerId); };
    EventBus.on(GameEvent.UNIT_KILLED, this._onUnitKilled);

    // 注册 Phaser 场景关闭/销毁时的清理
    this.events.on('shutdown', this.shutdown, this);
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
    this.entities.addUnit(unit);
    this.addUnitSprite(unit);
  }

  private removeUnit(id: string): void {
    this.entities.removeUnit(id);
    const sprite = this.unitSprites.get(id);
    if (sprite) { sprite.destroy(); this.unitSprites.delete(id); }
  }

  private addBuilding(building: Building): void {
    // 配置防御建筑战斗属性
    const bldDef = BUILDING_DEFS[building.spriteKey];
    if (bldDef?.combat) {
      building.attackDamage = bldDef.combat.damage;
      building.attackRange = bldDef.combat.range;
      building.attackCooldown = bldDef.combat.cooldown;
      building.attackType = bldDef.combat.dmgType;
    }
    this.entities.addBuilding(building);
    this.addBuildingSprite(building);
    // 建筑占位 → 标记不可通过
    this.world.map.markBlocked(building.tileX, building.tileY, 1, 1, true);
  }

  private removeBuilding(id: string): void {
    const building = this.entities.getBuilding(id);
    if (building) {
      this.world.map.markBlocked(building.tileX, building.tileY, 1, 1, false);
    }
    this.entities.removeBuilding(id);
    const sprite = this.buildingSprites.get(id);
    if (sprite) { sprite.destroy(); this.buildingSprites.delete(id); }
  }

  private addResourceField(field: ResourceField): void {
    this.entities.addField(field);
    this.addResourceFieldSprite(field);
  }

  // ============ 精灵创建 ============

  private addUnitSprite(unit: Unit): void {
    const w = tileToWorld(unit.tileX, unit.tileY);
    const texKey = this.textures.exists(unit.spriteKey) ? unit.spriteKey : '__DEFAULT';
    const img = this.add.image(w.x, w.y, texKey);
    img.setDisplaySize(40, 40); // 增大交互区域
    img.setDepth(10);
    img.setInteractive(); // 可直接点击精灵
    this.unitSprites.set(unit.id, img);
  }

  private addBuildingSprite(building: Building): void {
    const w = tileToWorld(building.tileX, building.tileY);
    const texKey = this.textures.exists(building.spriteKey) ? building.spriteKey : '__DEFAULT';
    const img = this.add.image(w.x, w.y, texKey);
    img.setDisplaySize(56, 56);
    img.setDepth(5);
    img.setInteractive();
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
      if (this.buildController.isActive) {
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
      // 建造模式：右键取消（玩家的直觉操作）
      if (this.buildController.isActive) {
        this.buildController.cancel();
        return;
      }

      const selection = this.inputCtrl.getSelection();
      if (selection.length === 0) return;

      // 攻击移动模式：强制移动（自动索敌会处理沿途攻击）
      if (this.attackMoveMode) {
        this.attackMoveMode = false;
        EventBus.emit(GameEvent.ATTACK_MOVE_TOGGLE, { active: false });
        for (const id of selection) {
          const unit = this.entities.getUnit(id);
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
        const unit = this.entities.getUnit(id);
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
          unit.unloadTarget = { x: tile.x, y: tile.y };
        } else if (fieldAtTile && unit.spriteKey === 'unit_worker') {
          // 工人采集 — 先走向资源田，到位后自动切换为采集
          unit.stopAttacking();
          unit.targetResourceId = fieldAtTile.id;
          unit.gatherTimer = 0;
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
        const unit = this.entities.getUnit(id);
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
        const unit = this.entities.getUnit(id);
        if (unit && unit.isAlive) {
          unit.stopAttacking();
          unit.clearPath();
          unit.state = 'idle';
        }
      }
    });

    // DELETE: 消灭选中单位（仅开发环境）
    if (import.meta.env.DEV) {
      this.input.keyboard!.on('keydown-DELETE', () => {
        const sel = [...this.inputCtrl.getSelection()];
        for (const id of sel) {
          const unit = this.entities.getUnit(id);
          if (unit) {
            unit.hp = 0;
            unit.isActive = false;
          }
        }
      });
    }

    // A: 攻击移动模式（切换）
    this.input.keyboard!.on('keydown-A', () => {
      this.attackMoveMode = !this.attackMoveMode;
      EventBus.emit(GameEvent.ATTACK_MOVE_TOGGLE, { active: this.attackMoveMode });
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
      if (this.buildController.isActive) {
        this.cancelBuildMode();
        return;
      }
      if (this.attackMoveMode) {
        this.attackMoveMode = false;
        EventBus.emit(GameEvent.ATTACK_MOVE_TOGGLE, { active: false });
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
    const ds = delta / 1000;

    this.stepBuildPreview();
    this.stepCamera();
    this.stepMovement(ds);
    this.stepAI(ds);
    this.stepFogOfWar();
    this.stepCombat(ds);
    this.stepGuildAndHero(ds);
    this.stepHeroRevive();
    this.stepGathering(ds);
    this.stepResources(ds);
    this.stepProduction(ds);
    this.stepConstructionResearch(ds);
    this.stepProjectiles(ds);
    this.stepCleanup();
    this.stepTimer(ds);
    this.stepGameOver();
    this.stepRender(ds);
  }

  // ---------- Step Methods ----------

  private stepBuildPreview(): void {
    if (this.buildController.isActive) {
      this.buildController.updatePreview(this.input.activePointer, this.world.map, this.buildings);
    }
  }

  private stepCamera(): void {
    this.cameraCtrl.update(this.input.activePointer);
  }

  private stepMovement(ds: number): void {
    // 每帧重建单位占用（用于碰撞检测）
    this.world.map.rebuildUnitOccupancy(this.units);
    for (const unit of this.units) {
      if (!unit.isAlive) continue;
      const wasMoving = unit.state === 'moving';
      MovementSystem.updateMovement(unit, ds, this.world.map);

      if (wasMoving && unit.state === 'idle') {
        // 运输卡车卸载
        const unloadTarget = unit.unloadTarget;
        if (unit.spriteKey === 'unit_transport' && unloadTarget) {
          for (const passenger of unit.cargo) {
            passenger.tileX = unit.tileX + (Math.random() - 0.5) * 2;
            passenger.tileY = unit.tileY + (Math.random() - 0.5) * 2;
            passenger.isActive = true;
            const sp = this.unitSprites.get(passenger.id);
            if (sp) sp.setAlpha(1);
          }
          unit.cargo = [];
          unit.unloadTarget = null;
        }
        // 工人采集切换
        if (unit.targetResourceId) {
          const field = this.entities.getField(unit.targetResourceId);
          if (field && field.isActive && !field.isDepleted) {
            const dist = Math.abs(unit.tileX - field.tileX) + Math.abs(unit.tileY - field.tileY);
            if (dist <= 1.5) {
              unit.state = 'gathering';
              unit.gatherTimer = 0;
              field.currentGatherers++;
            }
          } else {
            unit.targetResourceId = null;
          }
        }
      }
    }
  }

  private stepAI(ds: number): void {
    const aiCmds = this.aiController.update(ds, this.units, this.buildings, this.resourceFields);
    for (const cmd of aiCmds) {
      this.executeCommand(cmd);
    }
  }

  private stepFogOfWar(): void {
    // 直接传 units 引用（避免每帧 units.map() 新数组分配）
    this.world.fogOfWar.update(this.units, 0);
  }

  private stepCombat(ds: number): void {
    const combatEvents = CombatSystem.updateCombat(
      this.units, this.buildings,
      this.units, this.buildings,
      this.world.map, ds, this.world.fogOfWar,
      this.entities,
    );
    for (const evt of combatEvents) {
      EventBus.emit(GameEvent.UNIT_ATTACK_START, {
        attackerId: evt.attackerId, targetId: evt.targetId,
      });
      if (evt.isMelee) {
        this.flashTimers.set(evt.targetId, 0.12);
        if (evt.targetDied) {
          this.flashTimers.delete(evt.targetId);
          const targetUnit = this.entities.getUnit(evt.targetId);
          const targetBld = this.entities.getBuilding(evt.targetId);
          const owner = targetUnit?.owner ?? targetBld?.owner ?? -1;
          EventBus.emit(GameEvent.UNIT_KILLED, {
            unitId: evt.targetId, killerId: evt.attackerId, playerIndex: owner,
          });
        }
      } else {
        const attacker = this.entities.getUnit(evt.attackerId);
        if (attacker) {
          this.projectileController.spawn(attacker, evt.targetId, evt.damage, evt.attackEffect, evt.corrosionPenalty ?? 0);
        }
      }
    }
  }

  /** 为击杀者阵营的英雄分配 XP */
  private rewardHeroXp(killerId: string): void {
    const killer = this.entities.getUnit(killerId);
    if (!killer) return;
    // 查找同阵营的存活英雄
    const allyHeroes = this.heroes.filter(
      h => h.owner === killer.owner && h.isAlive,
    );
    for (const hero of allyHeroes) {
      // 单位击杀=20 XP，建筑=50 XP（由事件上下文判断）
      const xpAmount = 20; // 默认单位击杀
      const leveled = hero.gainXp(xpAmount);
      if (leveled) {
        EventBus.emit(GameEvent.HERO_LEVELED, {
          unitId: hero.id, heroId: hero.spriteKey, newLevel: hero.level, playerIndex: hero.owner,
        });
      }
    }
  }

  /** 建筑被摧毁时为英雄分配额外 XP */
  private rewardHeroXpBuilding(killerId: string): void {
    const killer = this.entities.getUnit(killerId);
    if (!killer) return;
    const allyHeroes = this.heroes.filter(
      h => h.owner === killer.owner && h.isAlive,
    );
    for (const hero of allyHeroes) {
      const leveled = hero.gainXp(50);
      if (leveled) {
        EventBus.emit(GameEvent.HERO_LEVELED, {
          unitId: hero.id, heroId: hero.spriteKey, newLevel: hero.level, playerIndex: hero.owner,
        });
      }
    }
  }

  private stepGuildAndHero(ds: number): void {
    GuildSystem.update(
      this.world.players, this.units, this.buildings, ds,
      this.world.techTrees,
      this.world.arcaneChargeTimers,
    );
    const result = HeroSystem.update(this.heroes, this.units, this.buildings, this.world, ds);
    // 处理英雄派生指令（如马库斯空投）
    for (const spawn of result.spawnCommands) {
      const faction = this.world.getPlayer(spawn.playerIndex)?.faction ?? 'arcane_empire';
      for (let i = 0; i < spawn.count; i++) {
        this.unitSpawner.spawnUnit(
          spawn.unitDefId,
          { x: spawn.position.x + i * 0.5, y: spawn.position.y },
          spawn.playerIndex,
        );
      }
    }
  }

  private stepHeroRevive(): void {
    for (const hero of this.heroes) {
      if (!hero.isAlive && hero.reviveTimer === -1) {
        const playerCC = this.entities.aliveBuildings.find(
          b => b.owner === hero.owner && b.isAlive
        );
        if (playerCC) {
          const spawnPos = this.world.map.findNearbyPassable(
            playerCC.tileX + 1, playerCC.tileY + 2, 8
          ) ?? { x: playerCC.tileX + 1, y: playerCC.tileY + 2 };
          hero.reviveTimer = 0; // 0=存活
          hero.hp = hero.maxHp;
          hero.shieldHp = 0;
          hero.tileX = spawnPos.x;
          hero.tileY = spawnPos.y;
          hero.clearPath();
          hero.state = 'idle';
          hero.isActive = true;
          const sprite = this.unitSprites.get(hero.id);
          if (sprite) sprite.setAlpha(0.9);
          EventBus.emit(GameEvent.HERO_REVIVED, { heroId: hero.id, playerIndex: hero.owner });
        }
      }
    }
  }

  private stepGathering(ds: number): void {
    const gMult0 = this.getTechEffects(0).gatherMult;
    const gMult1 = this.getTechEffects(1).gatherMult;
    const gatherEvents = ResourceSystem.updateGathering(
      this.units, this.resourceFields, this.world.players, ds, this.buildings, gMult0, gMult1,
    );
    for (const ge of gatherEvents) {
      EventBus.emit(GameEvent.RESOURCE_GATHERED, {
        fieldId: ge.fieldId, workerId: ge.workerId, playerIndex: ge.playerIndex, amount: ge.amount,
      });
      const player = this.world.players[ge.playerIndex];
      if (player) {
        EventBus.emit(GameEvent.RESOURCE_CHANGED, {
          playerIndex: ge.playerIndex, resource: 'crystal',
          newValue: player.resources.crystal, delta: ge.amount,
        });
      }
    }
  }

  private stepResources(ds: number): void {
    ResourceSystem.updateResources(this.world.players, this.units, this.buildings, ds);
  }

  private stepProduction(ds: number): void {
    const completed = ProductionSystem.updateProduction(
      this.buildings, this.world.players, this.world.techTrees, ds,
    );
    for (const item of completed) {
      const building = this.entities.getBuilding(item.buildingId);
      if (building) {
        this.unitSpawner.spawnUnit(item.unitDefId, item.position, building.owner);
        EventBus.emit(GameEvent.PRODUCTION_COMPLETE, {
          buildingId: item.buildingId, playerIndex: building.owner, unitDefId: item.unitDefId,
        });
      }
    }
  }

  private stepConstructionResearch(ds: number): void {
    this.buildController.updateConstruction(
      ds, this.buildings, (id) => this.entities.getUnit(id),
      (cost) => {
        // 建造失败退款
        const p = this.world.players[0];
        p.resources.crystal += cost.crystal;
        p.resources.industry += cost.industry;
        EventBus.emit(GameEvent.RESOURCE_CHANGED, {
          playerIndex: 0, resource: 'crystal', newValue: p.resources.crystal, delta: cost.crystal,
        });
      },
    );
    this.updateResearch(ds);
  }

  private stepProjectiles(ds: number): void {
    this.projectileController.update(ds, this.entities.unitIndex, this.entities.buildingIndex, this.units, this.buildings, this.flashTimers);
  }

  private stepCleanup(): void {
    this.cleanupDeadEntities();
  }

  private stepGameOver(): void {
    this.checkGameOver();
  }

  private stepRender(_ds: number): void {
    this.syncSprites();
    this.fogRenderer.render(this.world.fogOfWar);
    this.flushHud();
  }

  private flushHud(): void {
    this._lastHudTick += this.game.loop.delta / 1000;
    if (this._lastHudTick >= 0.5) {
      this._lastHudTick = 0;
      const p0 = this.world.players[0];
      EventBus.emit(GameEvent.RESOURCE_CHANGED, {
        playerIndex: 0, resource: 'crystal',
        newValue: p0.resources.crystal, delta: 0,
      });
      EventBus.emit(GameEvent.RESOURCE_CHANGED, {
        playerIndex: 0, resource: 'supply',
        newValue: p0.resources.supplyCap - p0.resources.supply, delta: 0,
      });
    }
  }

  // ============ 命令执行 ============

  private executeCommand(cmd: AnyCommand): void {
    this.commandExecutor.execute(cmd);
  }

  // ============ 建造系统 ============

  /** 进入建造模式 */
  enterBuildMode(buildingDefId: string, builderId: string): void {
    // 检查建造者是否正在建造其他建筑
    if (this.buildings.some(b => b.isAlive && b.state === 'constructing' && b.builderId === builderId)) {
      EventBus.emit(GameEvent.SELECTION_CHANGED, { unitIds: [], playerIndex: 0 });
      return; // 已在建造，忽略新指令
    }
    this.buildController.tryEnter(buildingDefId, builderId, this._playerFaction, this.world, (id) => this.entities.getUnit(id));
  }

  /** 退出建造模式 */
  cancelBuildMode(): void {
    this.buildController.cancel();
  }

  /** 确认放置建筑 */
  confirmBuild(tileX: number, tileY: number): void {
    this.buildController.confirm(tileX, tileY, this._playerFaction, this.world, this.world.map, this.buildings, (b) => { this.applyTechToBuilding(b); this.addBuilding(b); }, (id) => this.entities.getUnit(id));
  }

  /** 每帧推进研究进度 */
  private updateResearch(deltaSec: number): void {
    for (const bld of this.buildings) {
      if (!bld.isAlive || bld.state !== 'researching' || !bld.researchingTechId) continue;
      bld.researchProgress += deltaSec / bld.researchTotalTime;
      if (bld.researchProgress >= 1) {
        const playerTT = this.getTechTree(bld.owner);
        playerTT.completeTech(bld.researchingTechId);
        const techId = bld.researchingTechId;
        bld.researchingTechId = null;
        bld.researchProgress = 0;
        bld.state = 'idle';

        // 刷新该玩家科技效果缓存
        const owner = bld.owner;
        this.refreshTechEffects(owner);

        // 回溯应用科技效果到该玩家的现有实体
        const te = this.getTechEffects(owner);
        if (techId === 'tech:infantry_armor') {
          for (const u of this.units) {
            if (u.owner === owner && u.category === 'infantry' && u.isAlive) u.armor = u.baseArmor + te.infantryArmor;
          }
        }
        if (techId === 'tech:structure_reinforce') {
          for (const b of this.buildings) {
            if (b.owner === owner && b.isAlive) {
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
    // 用 for-of 即时处理替代 filter() 新数组分配
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (!u.isAlive && !(u instanceof Hero && (u as Hero).reviveTimer !== 0)) {
        const player = this.world.players[u.owner];
        if (player) {
          const refund = (u as Unit).supplyCost ?? 1;
          player.resources.supply = Math.max(0, player.resources.supply - refund);
        }
        if (u.targetResourceId) {
          const f = this.entities.getField(u.targetResourceId);
          if (f && f.currentGatherers > 0) f.currentGatherers--;
          u.targetResourceId = null;
        }
        const sel = this.inputCtrl.getSelection();
        if (sel.includes(u.id)) {
          this.inputCtrl.clearSelection();
          this.updateSelectionHighlight();
          EventBus.emit(GameEvent.SELECTION_CHANGED, { unitIds: [], playerIndex: 0 });
        }
        this.removeUnit(u.id);
      }
    }

    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const bld = this.buildings[i];
      if (!bld.isAlive) {
        const player = this.world.players[bld.owner];
        // 退还进行中的训练队列（兵营/工厂=训练建造者，它死了→生产过程失败）
        if (bld.productionQueue.length > 0 && player) {
          for (const item of bld.productionQueue) {
            const ud = UNIT_DEFS[item.unitDefId];
            const heroD = HERO_DEFS[item.unitDefId];
            if (ud) {
              player.resources.crystal += ud.cost.crystal;
              player.resources.supply = Math.max(0, player.resources.supply - (ud.cost.supply ?? 1));
            } else if (heroD) {
              player.resources.crystal += heroD.cost.crystal;
              player.resources.supply = Math.max(0, player.resources.supply - heroD.cost.supply);
            }
          }
          bld.productionQueue.length = 0;
        }
        // 退还进行中的科技研究
        if (bld.researchingTechId && player) {
          const tech = TECH_DEFS[bld.researchingTechId];
          if (tech) {
            player.resources.crystal += tech.crystal;
          }
          bld.researchingTechId = null;
        }
        // supplyCap/industryCap 由 ResourceSystem 每帧自动重算，此处不手动扣减（避免双重扣除）
        // 通知 HUD 刷新资源
        if (player) {
          EventBus.emit(GameEvent.RESOURCE_CHANGED, {
            playerIndex: bld.owner, resource: 'crystal', newValue: player.resources.crystal, delta: 0,
          });
        }
        // 如果建筑正在建造中，释放工人
        if (bld.builderId) {
          const builder = this.entities.getUnit(bld.builderId);
          if (builder?.isAlive) {
            builder.state = 'idle';
            builder.aiLockedAction = null;
          }
        }
        if (this.selectedBuildingId === bld.id) {
          this.selectedBuildingId = null;
          this.updateSelectionHighlight();
        }
        this.removeBuilding(bld.id);
      }
    }

    for (let i = this.resourceFields.length - 1; i >= 0; i--) {
      const field = this.resourceFields[i];
      if (field.isDepleted || !field.isActive) {
        this.entities.removeField(field.id);
        const sprite = this.resourceSprites.get(field.id);
        if (sprite) { sprite.destroy(); this.resourceSprites.delete(field.id); }
      }
    }
  }

  // ============ 胜负检测 ============

  private _gameOver = false;
  private _gameTimer: number = 0;       // 累计游戏时间（秒）
  private _scoreTimerDisplay: Phaser.GameObjects.Text | null = null;

  private checkGameOver(): void {
    if (this._gameOver) return;

    const aliveBuildings = (owner: number) =>
      this.buildings.some(b => b.owner === owner && b.isAlive);

    const playerDead = !aliveBuildings(0);
    const aiDead = !aliveBuildings(1);

    // 歼灭胜利
    if (playerDead || aiDead) {
      this._gameOver = true;
      const winner = aiDead ? 0 : 1;
      EventBus.emit(GameEvent.GAME_OVER, { winnerIndex: winner, reason: 'annihilated' });
      const text = winner === 0 ? '🏆 胜利！敌方基地已被摧毁' : '💀 失败…我方基地已被摧毁';
      const color = winner === 0 ? '#ffd700' : '#ff4444';
      this.add.text(1280 / 2, 720 / 2 - 20, text, {
        fontSize: '32px', color, backgroundColor: '#1a1a2ecc',
        padding: { x: 24, y: 12 },
      }).setOrigin(0.5).setDepth(200).setScrollFactor(0);
      return;
    }

    // 30分钟限时胜利（按分数）
    const MAX_TIME = 30 * 60; // 1800秒 = 30分钟
    if (this._gameTimer >= MAX_TIME) {
      this._gameOver = true;
      const p0Score = this.calcScore(0);
      const p1Score = this.calcScore(1);
      const winner = p0Score > p1Score ? 0 : p1Score > p0Score ? 1 : -1;
      EventBus.emit(GameEvent.GAME_OVER, { winnerIndex: winner, reason: 'timeout' });
      const resultText = winner === 0 ? '🏆 时间到！你赢了！' : winner === 1 ? '💀 时间到…你输了' : '🤝 平局！';
      const scoreText = `\n你的分数: ${p0Score}  |  敌方分数: ${p1Score}`;
      this.add.text(1280 / 2, 720 / 2 - 20, resultText + scoreText, {
        fontSize: '28px', color: winner === 0 ? '#ffd700' : '#ff6644',
        backgroundColor: '#1a1a2ecc', padding: { x: 24, y: 12 },
        align: 'center',
      }).setOrigin(0.5).setDepth(200).setScrollFactor(0);
    }
  }

  /** 计算玩家分数（用于限时判定） */
  private calcScore(playerIndex: number): number {
    const player = this.world.players[playerIndex];
    let score = player?.resources.crystal ?? 0;
    for (const u of this.units) {
      if (u.owner !== playerIndex || !u.isAlive) continue;
      score += (u.maxHp + u.attackDamage * 10) * 0.5;
    }
    for (const b of this.buildings) {
      if (b.owner !== playerIndex || !b.isAlive) continue;
      score += b.maxHp * 0.3;
    }
    return Math.round(score);
  }

  private stepTimer(ds: number): void {
    if (this._gameOver) return;
    this._gameTimer += ds;
    // HUD 计时器显示
    const mins = Math.floor(this._gameTimer / 60);
    const secs = Math.floor(this._gameTimer % 60);
    const timeStr = `⏱ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (!this._scoreTimerDisplay) {
      this._scoreTimerDisplay = this.add.text(1280 / 2, 10, timeStr, {
        fontSize: '16px', color: '#ffd700',
        backgroundColor: '#1a1a2ecc', padding: { x: 12, y: 4 },
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0.5, 0).setDepth(250).setScrollFactor(0);
    } else {
      this._scoreTimerDisplay.setText(timeStr);
    }
  }

// ============ 精灵同步 ============

  private syncSprites(): void {
    const dt = this.game.loop.delta / 1000;
    const selected = new Set(this.inputCtrl.getSelection());
    this.spriteRenderer.sync(dt, this.units, this.buildings, selected, this.selectedBuildingId);
  }

  // ============ 声音 ============

  private setupSoundListeners(): void {
    this._soundDispose = registerSoundBindings();
  }

  /** Phaser 场景关闭时清理 */
  shutdown(): void {
    this._soundDispose?.();
    this.fogRenderer?.destroy();
    this.projectileController?.destroy();
    this.buildController?.destroy();
    if (this._scoreTimerDisplay) { this._scoreTimerDisplay.destroy(); this._scoreTimerDisplay = null; }
    // 精确移除 EventBus 监听器（防止内存泄漏）
    if (this._onUnitKilled) {
      EventBus.off(GameEvent.UNIT_KILLED, this._onUnitKilled);
      this._onUnitKilled = null;
    }
    this.entities.clear();
  }

}

