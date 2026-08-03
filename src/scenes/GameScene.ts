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
import { ALCHEMY_POTIONS } from '../systems/GuildSystem';
import { HeroSystem } from '../systems/HeroSystem';
import { BuildingSystem } from '../systems/BuildingSystem';
import { UnitSpecialSystem } from '../systems/UnitSpecialSystem';
import { SuperWeaponSystem } from '../systems/SuperWeaponSystem';
import { TechTreeSystem } from '../systems/TechTreeSystem';
import { TechSystem } from '../systems/TechSystem';
import { ResearchSystem } from '../systems/ResearchSystem';
import { GameOverController } from '../controllers/GameOverController';
import { DeathCleanupSystem } from '../systems/DeathCleanupSystem';
import { BUILDING_DEFS, FACTION_DEFS } from '../config/unitData';
import type { FactionId } from '../types/data';
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
import { serialize, deserialize } from '../save/SaveLoadSystem';
import type { SaveData } from '../save/SaveData';
import { NetHost } from '../net/NetServer';
import { NetClient } from '../net/NetClient';

export class GameScene extends Phaser.Scene {
  world!: GameWorld;
  private cameraCtrl!: CameraController;
  private inputCtrl!: InputController;
  private aiController!: AIController;

/** 科技效果缓存（per-player，每次研究完成时刷新） */
  /** 科技系统（从 GameScene 抽离的科技效果缓存与应用） */
  private techSystem!: TechSystem;
  /** 研究系统（从 GameScene 抽离的科技研究推进） */
  private researchSystem!: ResearchSystem;
  /** 胜负/计时控制器（从 GameScene 抽离） */
  private gameOverCtrl!: GameOverController;
  /** 死亡清理系统（从 GameScene 抽离，回调注入解耦） */
  private deathCleanup!: DeathCleanupSystem;

  // EventBus 监听器引用（供 shutdown 精确移除）
  private _onUnitKilled: ((data: any) => void) | null = null;

  // ===== 科技效果：委托 TechSystem（GameScene 保留同名薄包装，外部回调不变）=====

  private initTechEffects(): void { this.techSystem.initAll(); }

  private refreshTechEffects(playerIndex: number): void { this.techSystem.refresh(playerIndex); }

  private getTechEffects(playerIndex: number) { return this.techSystem.getEffects(playerIndex); }

  private applyTechToUnit(unit: Unit): void { this.techSystem.applyToUnit(unit); }

  private applyTechToBuilding(bld: Building): void { this.techSystem.applyToBuilding(bld); }

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
  /** P2-质疑34: 防御塔射程可视化 */
  private _rangeIndicator: Phaser.GameObjects.Graphics | null = null;

  // HUD 资源更新计时
  private _lastHudTick: number = 0;

  // 战斗视觉
  private flashTimers = new Map<string, number>();  // 单位→剩余闪光秒数
  private attackMoveMode = false;
  private _soundDispose: (() => void) | null = null;
  // P0-B1: 炼金药剂轮换索引（Q 键循环 4 种药剂）
  private _potionIndex = 0;
  /** P0-C6 修复：炼金药剂全局 cooldown 截止时间（ms），避免多选连按秒空水晶 */
  private _potionCooldownUntil = 0;
  private _voidCooldownUntil = 0;
  /** P1-FOG2: fog update tick counter for throttling (every 4 frames) */
  private _fogTick = 0;
  // P1-D8: SHIFT key reference for additive selection
  private shiftKey: Phaser.Input.Keyboard.Key | null = null;

  // 建造系统
  private buildController!: BuildController;
  // 弹射物控制器
  private projectileController!: ProjectileController;
  // 血条渲染器
  private hpBarRenderer!: HpBarRenderer;
  private unitSpawner!: UnitSpawner;
  private commandExecutor!: CommandExecutor;
  private spriteRenderer!: SpriteRenderer;

  /** 获取某玩家科技树（委托 TechSystem） */
  private getTechTree(playerIndex: number): TechTreeSystem { return this.techSystem.getTree(playerIndex); }


  constructor() {
    super({ key: 'GameScene' });
  }

  // ============ 初始化 ============

  private _mapId: string = 'map_valley';
  private _playerFaction: string = 'arcane_empire';
  private _aiDifficulty: string = 'normal';
  /** 玩家所选行会 */
  private _playerGuilds: string[] = ['mages_guild', 'alchemists_society'];
  /** 存档数据（读档时由 init 注入） */
  private _loadSave: SaveData | null = null;
  /** 联机模式: single(单机默认) / host(主机) / client(客户端) */
  private _netMode: 'single' | 'host' | 'client' = 'single';
  /** 联机对手阵营 (host/client 各自的对方) */
  private _opponentFaction: string = 'hammer_federation';
  /** 联机对手行会 */
  private _opponentGuilds: string[] = ['mages_guild', 'alchemists_society'];
  /** 主机端网络连接器 */
  private _netHost: NetHost | null = null;
  /** 客户端网络连接器 */
  private _netClient: NetClient | null = null;
  /** 快照广播计时器 (host 模式, 每 100ms 广播一次) */
  private _snapshotTimer = 0;
  /** 客户端最新收到的快照帧号 */
  private _latestSnapshotFrame = 0;
  /** 本地玩家索引: single/host=0, client=1 */
  private _localPlayerIndex = 0;

  init(data?: { map?: string; playerFaction?: string; aiDifficulty?: string; playerGuilds?: string[]; loadFromSave?: SaveData; netMode?: 'single' | 'host' | 'client'; opponentFaction?: string; opponentGuilds?: string[] }): void {
    // P2-7 修复：mapId 白名单校验，防止路径穿越
    this._loadSave = data?.loadFromSave ?? null;
    const VALID_MAPS = ['map_valley', 'map_river', 'map_islands'];
    const rawMap = data?.map ?? 'map_valley';
    this._mapId = VALID_MAPS.includes(rawMap) ? rawMap : 'map_valley';
    this._playerFaction = data?.playerFaction ?? 'arcane_empire';
    this._aiDifficulty = data?.aiDifficulty ?? 'normal';
    this._playerGuilds = data?.playerGuilds ?? ['mages_guild', 'alchemists_society'];
    this._netMode = data?.netMode ?? 'single';
    this._opponentFaction = data?.opponentFaction ?? 'hammer_federation';
    this._opponentGuilds = data?.opponentGuilds ?? ['mages_guild', 'alchemists_society'];
    // 本地玩家索引: client 模式是 owner 1, 其他 owner 0
    this._localPlayerIndex = this._netMode === 'client' ? 1 : 0;
  }

  preload(): void {
    // 加载地图 JSON
    this.load.json('mapData', `data/maps/${this._mapId}.json`);
  }

  create(): void {
    const mapJson = this.cache.json.get('mapData') as any;

    // 读档分支：从存档重建游戏状态
    if (this._loadSave) {
      this.createFromSave(this._loadSave);
      return;
    }

    const mapW = mapJson?.width ?? 64;
    const mapH = mapJson?.height ?? 64;
    const tileSize = 32;

    // 初始化 GameWorld
    this.world = new GameWorld(mapW, mapH, tileSize);
    this.techSystem = new TechSystem(this.world);
    this.researchSystem = new ResearchSystem(this.world, this.entities, this.techSystem);
    this.gameOverCtrl = new GameOverController(this, this.world, this.entities);
    this.deathCleanup = new DeathCleanupSystem(this.world, this.entities, {
      removeUnitSprite: (id) => {
        const sp = this.unitSprites.get(id); if (sp) { sp.destroy(); this.unitSprites.delete(id); }
      },
      removeBuildingSprite: (id) => {
        const sp = this.buildingSprites.get(id); if (sp) { sp.destroy(); this.buildingSprites.delete(id); }
      },
      removeFieldSprite: (id) => {
        const sp = this.resourceSprites.get(id); if (sp) { sp.destroy(); this.resourceSprites.delete(id); }
      },
      onUnitRemoved: (id) => this.removeUnit(id),
      onBuildingRemoved: (id) => this.removeBuilding(id),
      rewardBuildingXp: (destroyedOwner) => this.rewardHeroXpBuilding(destroyedOwner),
      updateSelectionHighlight: () => this.updateSelectionHighlight(),
      getSelection: () => this.inputCtrl.getSelection(),
      setSelection: (ids) => this.inputCtrl.setSelection(ids),
      clearSelection: () => this.inputCtrl.clearSelection(),
      consumeIfSelectedBuilding: (id) => this._consumeIfSelectedBuilding(id),
    });

    // 如果 JSON 有 tiles 数据，加载到地图
    if (mapJson?.tiles) {
      this.world.map.loadFromData(mapJson);
    }

    // 玩家选择的阵营 → AI 使用对立阵营
    // 批1: 数据驱动——从 FACTION_DEFS 取合法 faction 列表，CC 从 factionDef.ccBuilding 读取
    const playerFaction = this._playerFaction as string;
    const allFactions = Object.keys(FACTION_DEFS);
    // 联机模式: 对手阵营/行会由 LobbyScene 传入; 单机模式: 随机选对立阵营
    const aiFaction = this._netMode !== 'single'
      ? this._opponentFaction
      : (allFactions.filter(f => f !== playerFaction)[Math.floor(Math.random()
        * (allFactions.length - 1))]) ?? 'hammer_federation';
    const playerCC = FACTION_DEFS[playerFaction]?.ccBuilding ?? 'bld_cc_empire';
    const aiCC = FACTION_DEFS[aiFaction]?.ccBuilding ?? 'bld_cc_federation';

    // P1-AI4: AI guild choice varies so void_institute is reachable.
    const playerHasMages = this._playerGuilds.includes('mages_guild');
    const playerHasVoid = this._playerGuilds.includes('void_institute');
    let aiGuilds: string[];
    if (this._netMode !== 'single') {
      // 联机: 对手行会由大厅传入
      aiGuilds = [...this._opponentGuilds];
    } else if (this._aiDifficulty === 'hard' && !playerHasVoid) {
      aiGuilds = ['void_institute', 'alchemists_society'];
    } else if (playerHasMages) {
      aiGuilds = ['mechanists_guild', 'alchemists_society'];
    } else {
      aiGuilds = ['mages_guild', 'alchemists_society'];
    }

    // 联机模式: owner 1 是真人对手 (isAI=false); 单机: AI (isAI=true)
    this.world.addPlayer(playerFaction as FactionId, [...this._playerGuilds], false);
    this.world.addPlayer(aiFaction as FactionId, [...aiGuilds], this._netMode === 'single');

    // 初始化 per-player 科技效果缓存
    this.initTechEffects();

    // P1-超武: 初始化双方超武状态（按行会解锁）
    SuperWeaponSystem.initPlayer(0, [...this._playerGuilds]);
    SuperWeaponSystem.initPlayer(1, [...aiGuilds]);

    // 初始化子系统
    this.cameraCtrl = new CameraController(this.cameras.main, mapW, mapH, tileSize);
    // 客户端模式: 本地玩家是 owner 1; host/single: owner 0
    const localPlayerIndex = this._netMode === 'client' ? 1 : 0;
    this.inputCtrl = new InputController(this, localPlayerIndex);
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
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT) ?? null;
    this.spriteRenderer = new SpriteRenderer(
      this.unitSprites, this.buildingSprites, this.flashTimers, this.hpBarRenderer,
      this.world.fogOfWar, localPlayerIndex,
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

    // 开局聚焦玩家实际出生点 (client 聚焦 owner 1 出生点)
    const camFocusX = this._netMode === 'client' ? p1x : p0x;
    const camFocusY = this._netMode === 'client' ? p1y : p0y;
    this.cameraCtrl.centerOn(camFocusX * tileSize + tileSize/2, camFocusY * tileSize + tileSize/2);

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
    this._onUnitKilled = (data: any) => {
      // P1-C2 修复：建筑击杀走两条 XP 路径——此处 UNIT_KILLED→rewardHeroXp +20，
      // cleanupDeadEntities→rewardHeroXpBuilding +50，同栋建筑击杀方拿 70 XP（双倍）。
      // 此处跳过建筑（由 cleanup 的 rewardHeroXpBuilding 统一给 +50），仅单位击杀走 +20。
      const victimUnit = this.entities.getUnit(data.unitId);
      const victimBld = this.entities.getBuilding(data.unitId);
      // P1-D5 修复：英雄被杀跳过基础 +20 XP，由下方 +100 统一奖励，避免双发 (+120)
      if (!victimBld && !(victimUnit instanceof Hero)) {
        this.rewardHeroXp(data.killerId);
      }
      // 若被害者是英雄，补充发射 HERO_DIED（供音效/HUD 消费）
      // P2-H1: killing an enemy hero grants bonus XP (+100) to the killer side heroes.
      if (victimUnit instanceof Hero && !victimBld && data.killerId) {
        const heroKiller = this.entities.getUnit(data.killerId);
        if (heroKiller) {
          const allyHeroes = this.heroes.filter(h => h.owner === heroKiller.owner && h.isAlive);
          for (const hero of allyHeroes) {
            const leveled = hero.gainXp(100);
            if (leveled) {
              EventBus.emit(GameEvent.HERO_LEVELED, {
                unitId: hero.id, heroId: hero.spriteKey, newLevel: hero.level, playerIndex: hero.owner,
              });
            }
          }
        }
      }
      if (victimUnit instanceof Hero) {
        EventBus.emit(GameEvent.HERO_DIED, {
          unitId: data.unitId,
          heroId: victimUnit.spriteKey,
          playerIndex: data.playerIndex ?? victimUnit.owner,
          killerId: data.killerId ?? '',
        });
      }
    };
    EventBus.on(GameEvent.UNIT_KILLED, this._onUnitKilled);

    // 联机模式: 初始化网络连接 (host 收命令+广播快照, client 收快照+发命令)
    this.setupNetworking();

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
    this.flashTimers.delete(id); // P2-PERF1: clean flash timer to avoid dangling reference
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
    this.world.map.registerResourceTile(field.tileX, field.tileY);
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
      // P1-超武: 瞄准模式下单击确认目标（坐标由 confirmTarget 经回调直接传入命令）
      const hud = this.scene.get('HUDScene') as any;
      if (hud?.superWeaponBar?.aimingWeaponId) {
        hud.superWeaponBar.confirmTarget(tile.x, tile.y);
        return;
      }

      // 建造模式：单击确认放置
      if (this.buildController.isActive) {
        this.confirmBuild(tile.x, tile.y);
        return;
      }

      this.selectedBuildingId = null;

      // 先检查单位
      const clickedUnit = this.units.find(u =>
        u.owner === this._localPlayerIndex && u.isAlive &&
        Math.round(u.tileX) === tile.x && Math.round(u.tileY) === tile.y
      );
      if (clickedUnit) {
        // P1-D8: Shift+click adds to selection (append), plain click replaces
        if (this.shiftKey && this.input.keyboard?.checkDown(this.shiftKey)) {
          this.inputCtrl.addToSelection([clickedUnit.id]);
        } else {
          this.inputCtrl.setSelection([clickedUnit.id]);
        }
        this.updateSelectionHighlight();
        EventBus.emit(GameEvent.SELECTION_CHANGED, {
          unitIds: this.inputCtrl.getSelection(),
          playerIndex: 0,
        });
        return;
      }

      // 再检查建筑
      const clickedBuilding = this.buildings.find(b =>
        b.owner === this._localPlayerIndex && b.isAlive &&
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
      // P1-UI2: Shift+box-select appends to existing selection instead of replacing
      const shiftDown = this.shiftKey && this.input.keyboard?.checkDown(this.shiftKey);
      if (!shiftDown) {
        this.inputCtrl.clearSelection();
        this.selectedBuildingId = null;
      }
      for (const unit of this.units) {
        if (unit.owner !== this._localPlayerIndex || !unit.isAlive) continue;
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

      // === 客户端模式: 不本地执行, 构造命令发给主机 ===
      if (this._netMode === 'client') {
        if (selection.length === 0) return;
        const cmd = this.buildClientCommand(selection, tile);
        if (cmd) this.sendCommandToHost(cmd);
        return;
      }

      // P1-BUILD3: right-click with a building selected sets its rally point for produced units.
      if (selection.length === 0 && this.selectedBuildingId) {
        const bld = this.entities.getBuilding(this.selectedBuildingId);
        if (bld && bld.owner === this._localPlayerIndex && bld.isAlive) {
          bld.rallyPoint = { x: tile.x, y: tile.y };
        }
        return;
      }
      if (selection.length === 0) return;

      // 攻击移动模式：强制移动（自动索敌会处理沿途攻击）
      if (this.attackMoveMode) {
        this.attackMoveMode = false;
        EventBus.emit(GameEvent.ATTACK_MOVE_TOGGLE, { active: false });
        const mvUnits = selection
          .map(id => this.entities.getUnit(id))
          .filter(u => u && u.isAlive) as Unit[];
        const goals = mvUnits.length > 1
          ? MovementSystem.assignGroupGoals(mvUnits, tile, this.world.map)
          : null;
        for (const unit of mvUnits) {
          unit.stopAttacking();
          const goal = goals ? (goals.get(unit.id) ?? tile) : tile;
          MovementSystem.navigate(unit, goal, this.world.map, 0);
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
            u.owner === this._localPlayerIndex && u.isAlive && u.spriteKey === 'unit_transport' &&
            Math.round(u.tileX) === tile.x && Math.round(u.tileY) === tile.y
          )
        : null;

      // 预计算移动命令的编队散开终点（仅纯移动单位需要）
      const moveOnlyUnits: Unit[] = [];
      for (const id of selection) {
        const unit = this.entities.getUnit(id);
        if (!unit || !unit.isAlive) continue;
        if (ownTransportAtTile && unit.category === 'infantry' && unit.id !== ownTransportAtTile.id) continue;
        if (enemyAtTile) continue;
        if (unit.spriteKey === 'unit_transport' && unit.cargo.length > 0 && selection.length === 1) continue;
        if (fieldAtTile && unit.spriteKey === 'unit_worker') continue;
        moveOnlyUnits.push(unit);
      }
      const moveGoals = moveOnlyUnits.length > 1
        ? MovementSystem.assignGroupGoals(moveOnlyUnits, tile, this.world.map)
        : null;

      for (const id of selection) {
        const unit = this.entities.getUnit(id);
        if (!unit || !unit.isAlive) continue;
        // P0-A2 补修：右键下达新命令时离开坚守状态（holdPosition 复位），
        // 否则按过 H 的单位永久 holdPosition=true 永不自动索敌。
        unit.holdPosition = false;

        // 运输卡车装载：选中步兵右键点击己方运输卡车
        if (ownTransportAtTile && unit.category === 'infantry' && unit.id !== ownTransportAtTile.id) {
          if (ownTransportAtTile.cargo.length < 12) {
            ownTransportAtTile.cargo.push(unit);
            // 从地图上移除单位进入装载状态
            const sprite = this.unitSprites.get(unit.id);
            if (sprite) sprite.setAlpha(0);
            unit.resetCombatState(() => this.releaseGatherSlot(unit));
            unit.isActive = false;
            unit.isCargo = true;
          }
          continue;
        }

        if (enemyAtTile) {
          // 攻击命令
          unit.stopAttacking();
          unit.attackTarget(enemyAtTile.id);
          MovementSystem.navigate(unit, tile, this.world.map, 0);
          unit.state = 'pursuing';
        } else if (unit.spriteKey === 'unit_transport' && unit.cargo.length > 0) {
          // P1-3 修复：运输车仅在单独选中时才卸载（混编时跟随大部队移动，避免静默卸货）
          if (selection.length === 1) {
            unit.stopAttacking();
            MovementSystem.navigate(unit, tile, this.world.map, 0);
            // 到达后卸载（由每帧检查 proximity 触发）
            unit.unloadTarget = { x: tile.x, y: tile.y };
          } else {
            // 混编：运输车随大部队移动，不卸载
            unit.stopAttacking();
            MovementSystem.navigate(unit, tile, this.world.map, 0);
          }
        } else if (fieldAtTile && unit.spriteKey === 'unit_worker') {
          // 工人采集 - 直接走向矿点格（工人可与矿点重叠，多工人可同格采集）
          unit.stopAttacking();
          // P1-N2 修复：工人接到新命令时，若正在建造中则放弃建造（释放锁定+退款）
          if (unit.aiLockedAction === 'building') {
            unit.aiLockedAction = null;
            this.buildController.cancelBuilderConstructions(
              unit.id, this.buildings,
              (cost) => { this.world.refund(0, cost); },
            );
          }
          // P0-A2 修复：换矿前先释放旧矿采集位
          this.releaseGatherSlot(unit);
          unit.targetResourceId = fieldAtTile.id;
          unit.gatherTimer = 0;
          // 工人直接走向矿点 tile 本身，到点后由 stepMovement 的 dist<=1.5 切 gathering
          MovementSystem.navigate(unit, { x: fieldAtTile.tileX, y: fieldAtTile.tileY }, this.world.map, 0);
        } else {
          // 移动命令：先清除攻击目标，再移动
          unit.stopAttacking();
          // P1-N2 修复：工人接到移动命令时，若正在建造中则放弃建造
          if (unit.aiLockedAction === 'building') {
            unit.aiLockedAction = null;
            this.buildController.cancelBuilderConstructions(
              unit.id, this.buildings,
              (cost) => { this.world.refund(0, cost); },
            );
          }
          // P0-A2 修复：移动命令会离开采集，释放旧矿采集位
          this.releaseGatherSlot(unit);
          const goal = moveGoals ? (moveGoals.get(unit.id) ?? tile) : tile;
          MovementSystem.navigate(unit, goal, this.world.map, 0);
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
          // P0-A2 修复：停止命令释放采集位
          this.releaseGatherSlot(unit);
          unit.stopAttacking();
          unit.clearPath();
          // P0-A2 补修：停止命令离开坚守状态（holdPosition 复位）
          unit.holdPosition = false;
          unit.state = 'idle';
        }
      }
    });

    // H: 坚守位置（与 S 停止区别：设 holdPosition=true，不主动寻路但可还击）
    this.input.keyboard!.on('keydown-H', () => {
      for (const id of this.inputCtrl.getSelection()) {
        const unit = this.entities.getUnit(id);
        if (unit && unit.isAlive) {
          // P0-A2 修复：坚守命令释放采集位
          this.releaseGatherSlot(unit);
          unit.stopAttacking();
          unit.clearPath();
          unit.holdPosition = true;
          unit.aiLockedAction = null;
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
      this.toggleAttackMove();
    });

    // F2: 全选作战单位
    this.input.keyboard!.on('keydown-F2', () => {
      const combatIds = this.units
        .filter(u => u.owner === this._localPlayerIndex && u.isAlive && u.spriteKey !== 'unit_worker')
        .map(u => u.id);
      this.inputCtrl.setSelection(combatIds);
      this.selectedBuildingId = null;
      this.updateSelectionHighlight();
      EventBus.emit(GameEvent.SELECTION_CHANGED, {
        unitIds: combatIds,
        playerIndex: 0,
      });
    });

    // ESC：退出建造模式 或 退出攻击移动模式 或 取消超武瞄准
    this.input.keyboard!.on('keydown-ESC', () => {
      // P1-UI 批6: 暂停菜单可见时 GameScene 不响应 ESC
      const hud = this.scene.get('HUDScene') as any;
      if (hud?.pauseMenu?.isVisible) return;
      // P1-超武: 先取消超武瞄准
      if (hud?.superWeaponBar?.aimingWeaponId) {
        hud.superWeaponBar.cancelAim();
        return;
      }
      if (this.buildController.isActive) {
        this.cancelBuildMode();
        return;
      }
      if (this.attackMoveMode) {
        this.attackMoveMode = false;
        EventBus.emit(GameEvent.ATTACK_MOVE_TOGGLE, { active: false });
      }
    });

    // P1-超武: 快捷键 1-4 对应超武槽
    for (let slot = 1; slot <= 4; slot++) {
      this.input.keyboard!.on(`keydown-${slot}` as any, () => {
        const hud2 = this.scene.get('HUDScene') as any;
        if (hud2?.superWeaponBar) hud2.superWeaponBar.hotkey(slot);
      });
    }

    // P0-B1: Q key applies alchemy potion to selected units
    // P0-C6 修复：多选施法只扣 1 次水晶（原来每单位各扣 1 次，N 选扣 N 倍可秒空水晶）。
    // 加全局 cooldown（5 秒）避免连按。
    this.input.keyboard!.on('keydown-Q', () => {
      if (!this._playerGuilds.includes('alchemists_society')) return;
      const sel = this.inputCtrl.getSelection();
      if (sel.length === 0) return;
      // P0-C6: 全局 cooldown 检查
      const now = this.time.now;
      if (now < (this._potionCooldownUntil ?? 0)) return;
      this._potionIndex = (this._potionIndex + 1) % ALCHEMY_POTIONS.length;
      const potion = ALCHEMY_POTIONS[this._potionIndex];
      // 批C: 炼金工坊药剂折扣 — 拥有 bld_alchemy_lab 时消耗 -25%
      const potionCost = GuildSystem.getPotionCost(0, this.buildings, potion.crystalCost);
      if (!this.world.canAfford(0, { crystal: potionCost })) return;
      this.world.spend(0, { crystal: potionCost });
      for (const id of sel) {
        const unit = this.entities.getUnit(id);
        if (unit && unit.isAlive && unit.owner === 0) {
          GuildSystem.applyAlchemyPotion(unit, potion);
        }
      }
      this._potionCooldownUntil = now + 5000; // 5 秒全局 cooldown
    });

    // P0-B2: R key activates void overload on selected units
    this.input.keyboard!.on('keydown-R', () => {
      if (!this._playerGuilds.includes('void_institute')) return;
      const sel = this.inputCtrl.getSelection();
      const nowR = this.time.now;
      if (nowR < (this._voidCooldownUntil ?? 0)) return;
      if (sel.length === 0) return;
      if (sel.length === 0) return;
      const hasOpt = this.world.techTrees.get(0)?.isResearched('tech:production_line_optimized') ?? false;
      for (const id of sel) {
        const unit = this.entities.getUnit(id);
        if (unit && unit.isAlive && unit.owner === 0) {
          GuildSystem.activateVoidOverload(unit, hasOpt);
        }
      }
      this._voidCooldownUntil = nowR + 8000; // 8s global cooldown
    });

    // 滚轮缩放
    this.input.on('wheel', (_pointer: any, _gx: any, _gy: any, _gz: any, delta: any) => {
      if (delta && delta.y) this.cameraCtrl.zoomAt(delta.y);
    });
  }

  private findEnemyAtTile(tx: number, ty: number): Entity | null {
    // 敌方单位
    const unit = this.units.find(u =>
      u.owner !== this._localPlayerIndex && u.isAlive &&
      Math.round(u.tileX) === tx && Math.round(u.tileY) === ty
    );
    if (unit) return unit;
    // 敌方建筑
    const bld = this.buildings.find(b =>
      b.owner !== this._localPlayerIndex && b.isAlive &&
      b.tileX === tx && b.tileY === ty
    );
    return bld ?? null;
  }

  private updateSelectionHighlight(): void {
    // 选中视觉由 syncSprites() 统一处理（tint 方式），
    // P2-质疑34: 防御塔选中时显示射程圈
    if (!this._rangeIndicator) {
      this._rangeIndicator = this.add.graphics();
      this._rangeIndicator.setDepth(8);
    }
    this._rangeIndicator.clear();
    if (this.selectedBuildingId) {
      const bld = this.entities.getBuilding(this.selectedBuildingId);
      if (bld && bld.isAlive && bld.attackDamage > 0 && bld.attackRange > 0) {
        const w = tileToWorld(bld.tileX, bld.tileY);
        this._rangeIndicator.lineStyle(2, 0xffff00, 0.3);
        this._rangeIndicator.strokeCircle(w.x, w.y, bld.attackRange * 32);
        this._rangeIndicator.fillStyle(0xffff00, 0.05);
        this._rangeIndicator.fillCircle(w.x, w.y, bld.attackRange * 32);
      }
    }
  }

  // ============ 主循环 ============

  update(_time: number, delta: number): void {
    if (this._gameOver) return;
    // 审2: 暂停菜单可见时跳过游戏推进(真正暂停)
    const hudPause = (this.scene.get('HUDScene') as any)?.pauseMenu?.isVisible;
    if (hudPause) return;
    // P1-C8: tab hidden = explicit pause (avoid rAF throttle causing inconsistent game time)
    // P2-质疑28: 但宽限期/游戏计时器仍需用墙钟时间推进，防止切标签暂停作弊
    if (typeof document !== 'undefined' && document.hidden) {
      // hidden 时仅推进宽限计时器，不跑完整模拟
      const hiddenDs = Math.min(delta / 1000, 1.0);
      this._advanceGraceTimers(hiddenDs);
      return;
    }
    // P0-1 修复：钳制 deltaSec，防止标签页回后台再切回时 delta 爆炸导致瞬移/一帧多结算
    const ds = Math.min(delta / 1000, 0.1); // 上限 100ms，超出视为卡顿/后台

    // === 客户端模式: 不跑模拟, 只渲染+相机 ===
    if (this._netMode === 'client') {
      this.stepBuildPreview();
      this.stepCamera();
      this.stepRender(ds);
      return;
    }

    this.stepBuildPreview();
    this.stepCamera();
    this.stepMovement(ds);
    // 联机模式不跑 AI (owner 1 是真人对手); 单机才跑 AI
    if (this._netMode === 'single') {
      this.stepAI(ds);
    }
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

    // === 主机模式: 每 100ms 广播快照给客户端 ===
    if (this._netMode === 'host') {
      this._snapshotTimer += delta;
      if (this._snapshotTimer >= 100) {
        this._snapshotTimer = 0;
        this.broadcastSnapshot();
      }
    }
  }

  // ============ 联机 (状态同步: 主机权威) ============

  /** 初始化网络连接: host 收命令+广播快照; client 收快照+发命令 */
  private setupNetworking(): void {
    if (this._netMode === 'single') return;

    if (this._netMode === 'host') {
      // 主机: 连本机中继, 收客户端命令
      this._netHost = new NetHost('Host');
      this._netHost.on({
        onCommand: (playerIndex, frame, command) => {
          // 客户端命令喂给 CommandExecutor (已有 playerIndex 校验)
          this.commandExecutor.execute(command as AnyCommand);
        },
        onPeerDisconnect: () => {
          // 客户端断开: 可选显示提示 (MVP 不处理重连)
        },
      });
      this._netHost.connect();
    } else if (this._netMode === 'client') {
      // 客户端: 连主机中继, 收快照
      this._netClient = new NetClient('localhost', 3000);
      this._netClient.on({
        onSnapshot: (frame, data) => {
          if (frame > this._latestSnapshotFrame) {
            this._latestSnapshotFrame = frame;
            this.applySnapshot(data);
          }
        },
        onGameOver: (winner) => {
          // 客户端: 游戏结束, 返回主菜单 (MVP 简化处理)
          this.cleanupNetwork();
          this.scene.start('MenuScene');
        },
        onDisconnect: () => {
          // 主机断开 (MVP 不处理)
        },
      });
      this._netClient.connect('Client');
    }
  }

  /** 主机: 序列化当前游戏状态, 广播给客户端 */
  private broadcastSnapshot(): void {
    if (!this._netHost) return;
    const aiFaction = this.world.players[1]?.faction ?? 'hammer_federation';
    const data = serialize({
      world: this.world,
      entities: this.entities,
      gameTimer: this.gameOverCtrl.gameTimer,
      graceTimers: this.gameOverCtrl.graceTimers,
      meta: {
        mapId: this._mapId,
        mapWidth: this.world.map.config.width,
        mapHeight: this.world.map.config.height,
        playerFaction: this._playerFaction as unknown as import('../types/data').FactionId,
        aiFaction: aiFaction as import('../types/data').FactionId,
        aiDifficulty: this._aiDifficulty as 'easy' | 'normal' | 'hard',
        playerGuilds: [...this._playerGuilds],
        aiGuilds: this.world.players[1]?.guilds ?? [...this._opponentGuilds],
      },
    });
    this._netHost.send({ t: 'snapshot', frame: this._latestSnapshotFrame++, data });
  }

  /** 客户端: 从主机快照重建游戏状态, 更新渲染 */
  private applySnapshot(data: SaveData): void {
    const result = deserialize(data);
    // 替换本地世界+实体注册表 (units/buildings/resourceFields 是 getter, 自动跟随)
    this.world = result.world;
    this.entities = result.entities;
    // 更新游戏计时器
    this.gameOverCtrl.gameTimer = result.gameTimer;
    this.gameOverCtrl.graceTimers = result.graceTimers;
    // 同步渲染: 重建精灵映射 (旧精灵删除, 新实体添加)
    this.syncSpritesFromState();
  }

  /** 客户端: 根据当前实体状态重建精灵 (快照应用后调用) */
  private syncSpritesFromState(): void {
    // 删除不再存在的精灵
    const liveUnitIds = new Set(this.units.map(u => u.id));
    const liveBldIds = new Set(this.buildings.map(b => b.id));
    for (const [id, sp] of this.unitSprites) {
      if (!liveUnitIds.has(id)) { sp.destroy(); this.unitSprites.delete(id); }
    }
    for (const [id, sp] of this.buildingSprites) {
      if (!liveBldIds.has(id)) { sp.destroy(); this.buildingSprites.delete(id); }
    }
    // 添加新实体的精灵
    for (const u of this.units) {
      if (!this.unitSprites.has(u.id) && u.isAlive && !u.isCargo) {
        this.addUnit(u);
      }
    }
    for (const b of this.buildings) {
      if (!this.buildingSprites.has(b.id) && b.isAlive) {
        this.addBuilding(b);
      }
    }
  }

  /** 客户端模式: 构造命令发给主机 (不本地执行) */
  private sendCommandToHost(cmd: AnyCommand): void {
    if (!this._netClient) return;
    // 客户端是 owner 1
    cmd.playerIndex = 1;
    cmd.frame = this._latestSnapshotFrame;
    this._netClient.send({ t: 'cmd', playerIndex: 1, frame: cmd.frame, command: cmd });
  }

  /** 客户端模式: 根据右键目标点构造智能命令 (移动/攻击/采集) */
  /** 客户端模式: 根据右键目标点构造智能命令 (移动/攻击/采集) */
  private buildClientCommand(selection: string[], tile: { x: number; y: number }): AnyCommand | null {
    const enemy = this.findEnemyAtTile(tile.x, tile.y);
    if (enemy) {
      return {
        type: 'attack_target', playerIndex: 1, unitIds: [...selection], frame: 0,
        targetEntityId: enemy.id,
      };
    }
    const field = this.resourceFields.find(f =>
      f.isActive && !f.isDepleted && f.tileX === tile.x && f.tileY === tile.y);
    if (field) {
      return {
        type: 'gather', playerIndex: 1, unitIds: [...selection], frame: 0,
        resourceFieldId: field.id,
      };
    }
    return {
      type: 'move', playerIndex: 1, unitIds: [...selection], frame: 0,
      target: { x: tile.x, y: tile.y },
    };
  }

  /** 清理网络连接 (游戏结束/场景切换时调用) */
  private cleanupNetwork(): void {
    this._netHost?.disconnect();
    this._netHost = null;
    this._netClient?.disconnect();
    this._netClient = null;
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

  /**
   * P0-A2 修复：释放工人的采集位。
   * 工人离开 gathering 状态（换矿/移动/停止/死亡）时必须递减旧矿点 currentGatherers，
   * 否则幽灵采集位单调膨胀（到点 +1 在 stepMovement 内，但换矿/移动从不递减旧矿）。
   * 幂等：仅在 unit 正在 gathering 且有旧 targetResourceId 时递减。
   */
  private releaseGatherSlot(unit: Unit): void {
    if (unit.state === 'gathering' && unit.targetResourceId) {
      const oldField = this.entities.getField(unit.targetResourceId);
      if (oldField && oldField.currentGatherers > 0) oldField.currentGatherers--;
      // P1-A5: clear targetResourceId to prevent silent re-gather after STOP
      unit.targetResourceId = null;
      unit.state = 'idle';
    }
  }

  private stepMovement(ds: number): void {
    // 每帧重建单位占用（用于碰撞检测）
    this.world.map.rebuildUnitOccupancy(this.units);
    for (const unit of this.units) {
      if (!unit.isAlive) continue;
      const wasMoving = unit.state === 'moving';
      MovementSystem.updateMovement(unit, ds, this.world.map);

      if (wasMoving && unit.state === 'idle') {
        // 运输卡车卸载 — P1-17/P1-R3 修复：逐一检查通行性，失败则保留在 cargo
        const unloadTarget = unit.unloadTarget;
        if (unit.spriteKey === 'unit_transport' && unloadTarget) {
          const stillInCargo: Unit[] = [];
          for (const passenger of unit.cargo) {
            // 尝试最多5次找到可通行位置
            let placed = false;
            for (let attempt = 0; attempt < 5; attempt++) {
              const px = unit.tileX + (Math.random() - 0.5) * 2;
              const py = unit.tileY + (Math.random() - 0.5) * 2;
              if (this.world.map.isPassableWithUnits(Math.round(px), Math.round(py))) {
                passenger.tileX = px;
                passenger.tileY = py;
                placed = true;
                break;
              }
            }
            // 兜底：找运输车旁最近可通行格
            if (!placed) {
              const safe = this.world.map.findNearbyPassable(unit.tileX, unit.tileY, 3);
              if (safe) { passenger.tileX = safe.x; passenger.tileY = safe.y; placed = true; }
            }
            if (placed) {
              // P0-NEW-1: 卸载成功才清除 cargo 标记并激活
              passenger.isCargo = false;
              passenger.isActive = true;
              // P1-S1c: unload must reset combat/gather state, avoid following pre-load path
              passenger.resetCombatState();
              const sp = this.unitSprites.get(passenger.id);
              if (sp) sp.setAlpha(1);
              // P1-R4: 即时更新占用，避免同帧后续单位叠放
              this.world.map.markOccupied(passenger.tileX, passenger.tileY);
            } else {
              // P1-R3: 找不到位置则保留在 cargo，下次再试
              stillInCargo.push(passenger);
            }
          }
          unit.cargo = stillInCargo;
          unit.unloadTarget = stillInCargo.length > 0 ? unloadTarget : null;
        }
        // 工人采集切换
        if (unit.targetResourceId) {
          const field = this.entities.getField(unit.targetResourceId);
          if (field && field.isActive && !field.isDepleted) {
            const dist = Math.abs(unit.tileX - field.tileX) + Math.abs(unit.tileY - field.tileY);
            if (dist <= 1.5) {
              // P1-maxGatherers 修复：采集位已满时不再入场，工人保持 idle 等待空位
              if (field.currentGatherers >= field.maxGatherers) {
                unit.state = 'idle';
                continue;
              }
              // P0-A2 修复：到点切 gathering 前先释放旧矿采集位，避免重复 +1
              this.releaseGatherSlot(unit);
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
    this._fogTick++;
    // P2-质疑11: 4帧->2帧节流，减少视野边缘闪烁
    if (this._fogTick % 2 !== 0) return;
    // 直接传 units 引用（避免每帧 units.map() 新数组分配）
    this.world.fogOfWar.update(this.units, 0, this.buildings);
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
            unitId: evt.targetId, killerId: evt.attackerId, playerIndex: owner, isBuilding: !!targetBld,
          });
        }
      } else {
        const attacker = this.entities.getUnit(evt.attackerId);
        if (attacker) {
          this.projectileController.spawn(attacker, evt.targetId, evt.damage, evt.attackEffect, evt.corrosionPenalty ?? 0, evt.rawDamage);
        }
      }
    }
  }

  /** 为击杀者阵营的英雄分配 XP（P1-D4: 限制距离，仅击杀点附近 15 格内的英雄获得 XP） */
  private rewardHeroXp(killerId: string): void {
    const killer = this.entities.getUnit(killerId);
    if (!killer) return;
    const allyHeroes = this.heroes.filter(
      h => h.owner === killer.owner && h.isAlive,
    );
    for (const hero of allyHeroes) {
      // P1-D4: 超过 15 格的英雄不得 XP（防止蹲基地蹭经验）
      const d = Math.abs(hero.tileX - killer.tileX) + Math.abs(hero.tileY - killer.tileY);
      if (d > 15) continue;
      const xpAmount = 20;
      const leveled = hero.gainXp(xpAmount);
      if (leveled) {
        EventBus.emit(GameEvent.HERO_LEVELED, {
          unitId: hero.id, heroId: hero.spriteKey, newLevel: hero.level, playerIndex: hero.owner,
        });
      }
    }
  }

  /** 建筑被摧毁时为英雄分配额外 XP */
  // P1-1 修复：奖励摧毁建筑的一方（对手Hero获XP）
  private rewardHeroXpBuilding(destroyedOwner: number): void {
    // 对手 = 1 - 建筑所属方
    const enemyOwner = 1 - destroyedOwner;
    const allyHeroes = this.heroes.filter(
      h => h.owner === enemyOwner && h.isAlive,
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
    const result = HeroSystem.update(this.heroes, this.units, this.buildings, this.world, ds, this.resourceFields);
    // 公会专属建筑机制（维修站光环等）— 每帧推进
    BuildingSystem.update(this.units, this.buildings, ds, this.world);
    // L3 单位特殊机制（移动工坊光环/不稳定水晶倒计时）— 每帧推进
    UnitSpecialSystem.update(this.units, ds, this.world);
    // 处理英雄派生指令（如马库斯空投）— P0-3：标记为免费召唤（不占用补给）
    for (const spawn of result.spawnCommands) {
      for (let i = 0; i < spawn.count; i++) {
        this.unitSpawner.spawnUnit(
          spawn.unitDefId,
          { x: spawn.position.x + i * 0.5, y: spawn.position.y },
          spawn.playerIndex,
          true, // freeSpawn: 技能召唤单位不消耗补给
        );
      }
    }

    // P1-超武: 推进冷却计时 + 应用持续效果
    SuperWeaponSystem.update(ds);
    SuperWeaponSystem.applyActiveEffects(0, this.units, this.buildings, ds);
    SuperWeaponSystem.applyActiveEffects(1, this.units, this.buildings, ds);
  }

  private stepHeroRevive(): void {
    for (const hero of this.heroes) {
      if (!hero.isAlive && hero.reviveTimer === -1) {
        // P0-D2 修复：CC 被毁后英雄无法复活。改为优先在 CC 复活，无 CC 则在任意己方存活建筑旁复活。
        const playerCC = this.entities.aliveBuildings.find(
          b => b.owner === hero.owner && b.isAlive && (b.spriteKey === 'bld_cc_empire' || b.spriteKey === 'bld_cc_federation')
        );
        const anchor = playerCC ?? this.entities.aliveBuildings.find(
          b => b.owner === hero.owner && b.isAlive
        );
        if (anchor) {
          const spawnPos = this.world.map.findNearbyPassable(
            anchor.tileX + 1, anchor.tileY + 2, 8
          ) ?? { x: anchor.tileX + 1, y: anchor.tileY + 2 };
          hero.reviveTimer = 0; // 0=存活
          hero.hp = hero.maxHp;
          hero.shieldHp = 0;
          hero.tileX = spawnPos.x;
          hero.tileY = spawnPos.y;
          hero.resetCombatState();
          hero.alchemyBuffTimer = 0;
          hero.alchemyBuffType = 'none';
          hero.isVoidOvercharged = false;
          hero.voidOverloadTimer = 0;
          hero.isActive = true;
          // P1-D12 修复：复活时给技能一个 15s 虚弱冷却，避免"死亡重置+复活即满技能"双免费窗口
          hero.skillCooldowns = [15, 15, 15];
          hero.skillCooldown = 15;
          const sprite = this.unitSprites.get(hero.id);
          if (sprite) sprite.setAlpha(0.9);
          EventBus.emit(GameEvent.HERO_REVIVED, { heroId: hero.id, playerIndex: hero.owner });
        }
      }
    }
  }

  private stepGathering(ds: number): void {
    const gMult0 = this.getTechEffects(0).gatherMult;
    // P1-AI6: AI 采集应用难度资源倍率（hard 2x, easy 0.7x）
    const gMult1 = this.getTechEffects(1).gatherMult * this.aiController.resourceMult;
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
    // P2-质疑30: 玩家经济安全网 - 0 工人且水晶<100 时被动回血(每秒+5)
    const p0 = this.world.players[0];
    if (p0) {
      const workerCount = this.units.some(u => u.owner === 0 && u.isAlive && u.spriteKey === 'unit_worker');
      if (!workerCount && p0.resources.crystal < 100) {
        p0.resources.crystal = Math.min(100, p0.resources.crystal + 5 * ds);
      }
    }
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
        // P1-8 修复：建造失败退款走 world.refund()（含 MAX_CRYSTAL + industryCap 上限保护）
        this.world.refund(0, cost);
        const p = this.world.players[0];
        EventBus.emit(GameEvent.RESOURCE_CHANGED, {
          playerIndex: 0, resource: 'crystal', newValue: p.resources.crystal, delta: cost.crystal,
        });
      },
    );
    // P1-AI20: 推进 AI 建筑模拟建造进度
    for (const bld of this.buildings) {
      if (bld.state === 'constructing' && bld._aiBuildTime > 0) {
        bld.buildProgress += ds / bld._aiBuildTime;
        if (bld.buildProgress >= 1) {
          bld.complete();
          bld._aiBuildTime = 0;
        }
      }
    }
    this.researchSystem.update(ds);
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
    // 客户端模式: 命令转发给主机执行 (本地不模拟); 
    // 本地玩家是 owner 1, 把命令的 playerIndex 修正为本地玩家的 owner
    if (this._netMode === 'client') {
      // HUD 命令硬编码 playerIndex: 0, 客户端需修正为 1
      if (cmd.playerIndex === 0) cmd.playerIndex = 1;
      this.sendCommandToHost(cmd);
      return;
    }
    this.commandExecutor.execute(cmd);
  }

  /** HUD 回调查用: 统一命令入口 (客户端模式内部转发给主机) */
  execButtonCommand(cmd: AnyCommand): import('../controllers/CommandExecutor').CommandResult | undefined {
    if (this._netMode === 'client') {
      // 客户端: 转发给主机, 本地无执行结果
      if (cmd.playerIndex === 0) cmd.playerIndex = 1;
      this.sendCommandToHost(cmd);
      return undefined;
    }
    return this.commandExecutor.execute(cmd);
  }

  /** P1-UI: 切换攻击移动模式（供 HUDScene 命令按钮调用） */
  toggleAttackMove(): void {
    this.attackMoveMode = !this.attackMoveMode;
    EventBus.emit(GameEvent.ATTACK_MOVE_TOGGLE, { active: this.attackMoveMode });
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

  /** 每帧推进研究进度（委托 ResearchSystem） */
  private updateResearch(deltaSec: number): void { this.researchSystem.update(deltaSec); }

  // ============ 死亡清理 ============

  private cleanupDeadEntities(): void { this.deathCleanup.cleanup(); }

  /** 选中建筑若为 id 则清除并返回 true（供 DeathCleanupSystem 回调用） */
  private _consumeIfSelectedBuilding(id: string): boolean {
    if (this.selectedBuildingId === id) { this.selectedBuildingId = null; return true; }
    return false;
  }
  // ============ 胜负检测（委托 GameOverController）===========

  private get _gameOver(): boolean { return this.gameOverCtrl.isOver; }
  private checkGameOver(): void { this.gameOverCtrl.checkGameOver(); }
  private _advanceGraceTimers(ds: number): void { this.gameOverCtrl.advanceGraceTimers(ds); }
  private stepTimer(ds: number): void { this.gameOverCtrl.stepTimer(ds); }

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
  // ========== 读档分支 ==========

  /** 从 SaveData 重建游戏状态（替代 create() 的新建流程） */
  private createFromSave(data: SaveData): void {
    const mapW = data.meta.mapWidth;
    const mapH = data.meta.mapHeight;
    const tileSize = 32;

    // 读档元数据覆盖 init 值
    this._mapId = data.meta.mapId;
    this._playerFaction = data.meta.playerFaction;
    this._aiDifficulty = data.meta.aiDifficulty;
    this._playerGuilds = [...data.meta.playerGuilds];

    // === 核心状态：从 SaveData 反序列化 ===
    const restored = deserialize(data);
    this.world = restored.world;
    this.entities = restored.entities;

    // === 子系统 ===
    this.techSystem = new TechSystem(this.world);
    this.techSystem.initAll(); // 重新计算科技效果缓存
    this.researchSystem = new ResearchSystem(this.world, this.entities, this.techSystem);
    this.gameOverCtrl = new GameOverController(this, this.world, this.entities);
    this.gameOverCtrl.gameTimer = restored.gameTimer;
    this.gameOverCtrl.graceTimers = restored.graceTimers;
    this.deathCleanup = new DeathCleanupSystem(this.world, this.entities, {
      removeUnitSprite: (id) => {
        const sp = this.unitSprites.get(id); if (sp) { sp.destroy(); this.unitSprites.delete(id); }
      },
      removeBuildingSprite: (id) => {
        const sp = this.buildingSprites.get(id); if (sp) { sp.destroy(); this.buildingSprites.delete(id); }
      },
      removeFieldSprite: (id) => {
        const sp = this.resourceSprites.get(id); if (sp) { sp.destroy(); this.resourceSprites.delete(id); }
      },
      onUnitRemoved: (id) => this.removeUnit(id),
      onBuildingRemoved: (id) => this.removeBuilding(id),
      rewardBuildingXp: (destroyedOwner) => this.rewardHeroXpBuilding(destroyedOwner),
      updateSelectionHighlight: () => this.updateSelectionHighlight(),
      getSelection: () => this.inputCtrl.getSelection(),
      setSelection: (ids) => this.inputCtrl.setSelection(ids),
      clearSelection: () => this.inputCtrl.clearSelection(),
      consumeIfSelectedBuilding: (id) => this._consumeIfSelectedBuilding(id),
    });

    // 地形：先加载地图 JSON 的基本地形（用于渲染 grass/water/mountain 纹理），
    // 然后覆盖存档中记录的非默认地形
    const mapJson = this.cache.json.get('mapData') as any;
    if (mapJson?.tiles) {
      this.world.map.loadFromData(mapJson);
    }

    // === 初始化 Phaser 层 ===
    this.cameraCtrl = new CameraController(this.cameras.main, mapW, mapH, tileSize);
    this.inputCtrl = new InputController(this, 0);
    const aiFaction = data.meta.aiFaction;
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
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT) ?? null;

    // === 渲染 ===
    this.renderTiles();
    this.fogRenderer = new FogRenderer(this);
    this.fogRenderer.init(mapW, mapH, tileSize);

    // 为所有已恢复实体创建 sprite
    for (const u of this.entities.units) this.addUnitSprite(u);
    for (const b of this.entities.buildings) this.addBuildingSprite(b);
    for (const f of this.entities.fields) this.addResourceFieldSprite(f);

    this.spriteRenderer = new SpriteRenderer(
      this.unitSprites, this.buildingSprites, this.flashTimers, this.hpBarRenderer,
      this.world.fogOfWar, 0,
    );

    // === 迷雾 ===
    this.initializeFogOfWar();

    // === UI + 输入 ===
    this.setupInputCallbacks();
    this.setupKeyboard();

    // 聚焦玩家 CC（或第一个建筑）位置
    const playerCC = this.entities.buildings.find(b => b.owner === 0 && b.isAlive);
    if (playerCC) {
      this.cameraCtrl.centerOn(playerCC.tileX * tileSize + tileSize / 2, playerCC.tileY * tileSize + tileSize / 2);
    }

    const hudScene = this.scene.get('HUDScene') as any;
    if (hudScene && hudScene.initMinimap) {
      hudScene.initMinimap(this.world.map, this.world.fogOfWar, this.cameraCtrl);
    }

    ResourceSystem.updateResources(this.world.players, this.entities.units, this.entities.buildings, 0);

    const p0 = this.world.players[0];
    EventBus.emit(GameEvent.RESOURCE_CHANGED, {
      playerIndex: 0,
      resource: 'crystal',
      newValue: p0.resources.crystal,
      delta: p0.resources.crystal,
    });

    if (!this.scene.isActive('HUDScene')) {
      this.scene.launch('HUDScene');
    }

    EventBus.emit(GameEvent.GAME_STARTED, {});
    this.setupSoundListeners();

    this._onUnitKilled = (d: any) => {
      const victimUnit = this.entities.getUnit(d.unitId);
      const victimBld = this.entities.getBuilding(d.unitId);
      if (!victimBld && !(victimUnit instanceof Hero)) {
        this.rewardHeroXp(d.killerId);
      }
      if (victimUnit instanceof Hero && !victimBld && d.killerId) {
        const heroKiller = this.entities.getUnit(d.killerId);
        if (heroKiller) {
          const allyHeroes = this.heroes.filter(h => h.owner === heroKiller.owner && h.isAlive);
          for (const hero of allyHeroes) {
            const leveled = hero.gainXp(100);
            if (leveled) {
              EventBus.emit(GameEvent.HERO_LEVELED, {
                unitId: hero.id, heroId: hero.spriteKey, newLevel: hero.level, playerIndex: hero.owner,
              });
            }
          }
        }
      }
      if (victimUnit instanceof Hero) {
        EventBus.emit(GameEvent.HERO_DIED, {
          unitId: d.unitId, heroId: victimUnit.spriteKey,
          playerIndex: d.playerIndex ?? victimUnit.owner, killerId: d.killerId ?? '',
        });
      }
    };
    EventBus.on(GameEvent.UNIT_KILLED, this._onUnitKilled);
    this.events.on('shutdown', this.shutdown, this);
  }

  // ========== 清理 ==========

  shutdown(): void {
    this._soundDispose?.();
    this.fogRenderer?.destroy();
    this.projectileController?.destroy();
    this.buildController?.destroy();
    this._rangeIndicator?.destroy();
    this._rangeIndicator = null;
    this.gameOverCtrl?.destroy();
    // 精确移除 EventBus 监听器（防止内存泄漏）
    if (this._onUnitKilled) {
      EventBus.off(GameEvent.UNIT_KILLED, this._onUnitKilled);
      this._onUnitKilled = null;
    }
    // P1-质疑30 修复：停止 HUDScene 以清理其 EventBus 监听器，防止重启后旧监听器残留
    if (this.scene.isActive('HUDScene')) {
      this.scene.stop('HUDScene');
    }
    this.entities.clear();
    // 审4: 重置超武 static Map，防止跨会话状态泄漏
    SuperWeaponSystem.reset();
    // 联机: 断开网络连接
    this.cleanupNetwork();
  }

}

