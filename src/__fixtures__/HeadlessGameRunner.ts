/**
 * 无头游戏循环内核 — 在 node 测试环境驱动完整游戏循环，不依赖 Phaser 运行时
 *
 * 抽取 GameScene 的 13 个纯/可注入 step* 方法，按原 update() 顺序编排：
 *   stepMovement → stepAI → stepFogOfWar → stepCombat → stepGuildAndHero →
 *   stepHeroRevive → stepGathering → stepResources → stepProduction →
 *   stepConstructionResearch → stepProjectiles → stepCleanup → stepTimer → stepGameOver
 *
 * 跳过 4 个 Phaser 锁死 step：stepBuildPreview / stepCamera / stepRender / flushHud
 * （纯渲染/输入/镜头，无游戏逻辑）
 *
 * 解耦点：
 *  - sprite.setAlpha → 注入 no-op 回调（运输车卸载/英雄复活）
 *  - ProjectileController → 用 phaserStub 构造，伤害逻辑正常跑
 *  - addUnit/addBuilding 回调 → 只更新 entities + map 占位，不建 sprite
 *
 * 用法：
 *   const runner = new HeadlessGameRunner({ difficulty: 'normal' });
 *   runner.setup(); // 初始化世界+玩家+起始单位
 *   runner.runUntil(r => r.gameOverCtrl.isOver, 5000); // 跑到游戏结束或超帧
 */

import { GameWorld } from '../core/GameWorld';
import { EntityRegistry } from '../core/EntityRegistry';
import { TechSystem } from '../systems/TechSystem';
import { ResearchSystem } from '../systems/ResearchSystem';
import { GameOverController } from '../controllers/GameOverController';
import { DeathCleanupSystem } from '../systems/DeathCleanupSystem';
import { UnitSpawner } from '../controllers/UnitSpawner';
import { CommandExecutor } from '../controllers/CommandExecutor';
import { BuildController } from '../controllers/BuildController';
import { ProjectileController } from '../controllers/ProjectileController';
import { AIController } from '../ai/AIController';
import { MovementSystem } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { ProductionSystem } from '../systems/ProductionSystem';
import { GuildSystem } from '../systems/GuildSystem';
import { HeroSystem } from '../systems/HeroSystem';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { makeStubScene } from './phaserStub';
import { ResourceField } from '../entities/ResourceField';
import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import type { Point } from '../types/entity';

export interface HeadlessRunnerOptions {
  /** 地图尺寸 */
  width?: number;
  height?: number;
  /** AI 难度 */
  difficulty?: 'easy' | 'normal' | 'hard';
  /** 是否放置起始单位（CC + workers + riflemen） */
  placeStartingUnits?: boolean;
  /** 玩家 0 阵营 */
  playerFaction?: 'arcane_empire' | 'hammer_federation';
}

export class HeadlessGameRunner {
  readonly world: GameWorld;
  readonly entities: EntityRegistry;
  readonly techSystem: TechSystem;
  readonly researchSystem: ResearchSystem;
  readonly gameOverCtrl: GameOverController;
  readonly deathCleanup: DeathCleanupSystem;
  readonly spawner: UnitSpawner;
  readonly commandExecutor: CommandExecutor;
  readonly buildController: BuildController;
  readonly projectileController: ProjectileController;
  readonly aiController: AIController;

  private readonly flashTimers = new Map<string, number>();
  private readonly aiDifficulty: 'easy' | 'normal' | 'hard';
  private readonly playerFaction: 'arcane_empire' | 'hammer_federation';
  private readonly stubScene: any;

  constructor(opts: HeadlessRunnerOptions = {}) {
    const {
      width = 64, height = 64,
      difficulty = 'normal',
      placeStartingUnits = true,
      playerFaction = 'arcane_empire',
    } = opts;

    this.aiDifficulty = difficulty;
    this.playerFaction = playerFaction;
    this.stubScene = makeStubScene();

    // 核心世界与注册表
    this.world = new GameWorld(width, height);
    this.entities = new EntityRegistry();

    // 玩家 0（人）+ 玩家 1（AI）
    const aiFaction = playerFaction === 'arcane_empire' ? 'hammer_federation' : 'arcane_empire';
    this.world.addPlayer(playerFaction, ['mages_guild', 'alchemists_society'], false);
    this.world.addPlayer(aiFaction, ['mechanists_guild', 'alchemists_society'], true);

    // 子系统
    this.techSystem = new TechSystem(this.world);
    this.techSystem.initAll();
    this.researchSystem = new ResearchSystem(this.world, this.entities, this.techSystem);

    // 控制器（回调只更新注册表/地图，不建 sprite）
    this.spawner = new UnitSpawner(
      this.world.map,
      (u) => { this.techSystem.applyToUnit(u); this.entities.addUnit(u); this.world.map.markOccupied(u.tileX, u.tileY); },
      (b) => { this.techSystem.applyToBuilding(b); this.entities.addBuilding(b); this.world.map.markBlocked(b.tileX, b.tileY, 1, 1, true); },
      (owner) => this.world.players[owner]?.faction ?? 'arcane_empire',
    );
    this.commandExecutor = new CommandExecutor(
      this.world, this.entities, this.spawner,
      (bld) => this.techSystem.applyToBuilding(bld),
      (bld) => { this.entities.addBuilding(bld); this.world.map.markBlocked(bld.tileX, bld.tileY, 1, 1, true); },
    );
    this.buildController = new BuildController(this.stubScene);
    this.projectileController = new ProjectileController(this.stubScene);
    this.gameOverCtrl = new GameOverController(this.stubScene, this.world, this.entities);
    this.deathCleanup = new DeathCleanupSystem(this.world, this.entities, {
      removeUnitSprite: () => {},
      removeBuildingSprite: () => {},
      removeFieldSprite: () => {},
      onUnitRemoved: (id) => this.removeUnit(id),
      onBuildingRemoved: (id) => this.removeBuilding(id),
      rewardBuildingXp: (destroyedOwner) => this.rewardHeroXpBuilding(destroyedOwner),
      updateSelectionHighlight: () => {},
      getSelection: () => [],
      setSelection: () => {},
      clearSelection: () => {},
      consumeIfSelectedBuilding: () => false,
    });
    this.aiController = new AIController(this.world, 1, this.aiDifficulty);

    if (placeStartingUnits) {
      this.placeStartUnits();
    }

    // 初始资源计算
    ResourceSystem.updateResources(this.world.players, this.entities.units, this.entities.buildings, 0);
  }

  /** 放置双方起始单位：CC + 4 worker + 2 rifleman */
  private placeStartUnits(): void {
    const p0 = { x: 6, y: 6 };
    const p1 = { x: 56, y: 56 };
    this.spawner.placeStartingUnits(p0, p1, this.playerFaction,
      this.playerFaction === 'arcane_empire' ? 'hammer_federation' : 'arcane_empire');
    // 初始资源点
    for (const pos of [{ x: 9, y: 6 }, { x: 6, y: 9 }, { x: 53, y: 56 }, { x: 56, y: 53 }, { x: 30, y: 30 }]) {
      this.entities.addField(new ResourceField(pos.x, pos.y, 'crystal', 5000, 3));
      this.world.map.registerResourceTile(pos.x, pos.y);
    }
  }

  /** 移除单位（注册表 + 采集位 + 地图占用） */
  private removeUnit(id: string): void {
    const u = this.entities.getUnit(id);
    this.entities.removeUnit(id);
    this.flashTimers.delete(id);
  }

  /** 移除建筑（注册表 + 地图占位） */
  private removeBuilding(id: string): void {
    const b = this.entities.getBuilding(id);
    if (b) this.world.map.markBlocked(b.tileX, b.tileY, 1, 1, false);
    this.entities.removeBuilding(id);
  }

  /** 释放工人采集位 */
  private releaseGatherSlot(unit: Unit): void {
    if (unit.state === 'gathering' && unit.targetResourceId) {
      const oldField = this.entities.getField(unit.targetResourceId);
      if (oldField && oldField.currentGatherers > 0) oldField.currentGatherers--;
      unit.targetResourceId = null;
      unit.state = 'idle';
    }
  }

  /** 建筑被摧毁时为英雄分配 XP */
  private rewardHeroXpBuilding(destroyedOwner: number): void {
    const enemyOwner = 1 - destroyedOwner;
    for (const hero of this.entities.heroes) {
      if (hero.owner === enemyOwner && hero.isAlive) {
        hero.gainXp(50);
      }
    }
  }

  // ============ step* 方法（按 GameScene.update 顺序）============

  private stepMovement(ds: number): void {
    this.world.map.rebuildUnitOccupancy(this.entities.units);
    for (const unit of this.entities.units) {
      if (!unit.isAlive) continue;
      const wasMoving = unit.state === 'moving';
      MovementSystem.updateMovement(unit, ds, this.world.map);

      if (wasMoving && unit.state === 'idle') {
        // 运输车卸载（sprite.setAlpha → no-op，无头不渲染）
        const unloadTarget = unit.unloadTarget;
        if (unit.spriteKey === 'unit_transport' && unloadTarget) {
          const stillInCargo: Unit[] = [];
          for (const passenger of unit.cargo) {
            let placed = false;
            for (let attempt = 0; attempt < 5; attempt++) {
              const px = unit.tileX + (Math.random() - 0.5) * 2;
              const py = unit.tileY + (Math.random() - 0.5) * 2;
              if (this.world.map.isPassableWithUnits(Math.round(px), Math.round(py))) {
                passenger.tileX = px; passenger.tileY = py; placed = true; break;
              }
            }
            if (!placed) {
              const safe = this.world.map.findNearbyPassable(unit.tileX, unit.tileY, 3);
              if (safe) { passenger.tileX = safe.x; passenger.tileY = safe.y; placed = true; }
            }
            if (placed) {
              passenger.isCargo = false;
              passenger.isActive = true;
              passenger.resetCombatState();
              this.world.map.markOccupied(passenger.tileX, passenger.tileY);
            } else {
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
              if (field.currentGatherers >= field.maxGatherers) { unit.state = 'idle'; continue; }
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
    const cmds = this.aiController.update(ds, this.entities.units, this.entities.buildings, this.entities.fields);
    for (const cmd of cmds) this.commandExecutor.execute(cmd);
  }

  private stepFogOfWar(): void {
    this.world.fogOfWar.update(this.entities.units, 0, this.entities.buildings);
  }

  private stepCombat(ds: number): void {
    const events = CombatSystem.updateCombat(
      this.entities.units, this.entities.buildings,
      this.entities.units, this.entities.buildings,
      this.world.map, ds, this.world.fogOfWar, this.entities,
    );
    for (const evt of events) {
      EventBus.emit(GameEvent.UNIT_ATTACK_START, { attackerId: evt.attackerId, targetId: evt.targetId });
      if (evt.isMelee) {
        this.flashTimers.set(evt.targetId, 0.12);
        if (evt.targetDied) {
          this.flashTimers.delete(evt.targetId);
          const tU = this.entities.getUnit(evt.targetId);
          const tB = this.entities.getBuilding(evt.targetId);
          const owner = tU?.owner ?? tB?.owner ?? -1;
          EventBus.emit(GameEvent.UNIT_KILLED, { unitId: evt.targetId, killerId: evt.attackerId, playerIndex: owner, isBuilding: !!tB });
        }
      } else {
        const attacker = this.entities.getUnit(evt.attackerId);
        if (attacker) {
          this.projectileController.spawn(attacker, evt.targetId, evt.damage, evt.attackEffect, evt.corrosionPenalty ?? 0, evt.rawDamage);
        }
      }
    }
  }

  private stepGuildAndHero(ds: number): void {
    GuildSystem.update(this.world.players, this.entities.units, this.entities.buildings, ds, this.world.techTrees, this.world.arcaneChargeTimers);
    const result = HeroSystem.update(this.entities.heroes, this.entities.units, this.entities.buildings, this.world, ds);
    for (const spawn of result.spawnCommands) {
      for (let i = 0; i < spawn.count; i++) {
        this.spawner.spawnUnit(spawn.unitDefId, { x: spawn.position.x + i * 0.5, y: spawn.position.y }, spawn.playerIndex, true);
      }
    }
  }

  private stepHeroRevive(): void {
    for (const hero of this.entities.heroes) {
      if (!hero.isAlive && (hero as any).reviveTimer === -1) {
        const cc = this.entities.aliveBuildings.find(b => b.owner === hero.owner && (b.spriteKey === 'bld_cc_empire' || b.spriteKey === 'bld_cc_federation'));
        const anchor = cc ?? this.entities.aliveBuildings.find(b => b.owner === hero.owner && b.isAlive);
        if (anchor) {
          const spawnPos = this.world.map.findNearbyPassable(anchor.tileX + 1, anchor.tileY + 2, 8) ?? { x: anchor.tileX + 1, y: anchor.tileY + 2 };
          (hero as any).reviveTimer = 0;
          hero.hp = hero.maxHp;
          hero.shieldHp = 0;
          hero.tileX = spawnPos.x;
          hero.tileY = spawnPos.y;
          hero.resetCombatState();
          (hero as any).alchemyBuffTimer = 0;
          (hero as any).alchemyBuffType = 'none';
          (hero as any).isVoidOvercharged = false;
          (hero as any).voidOverloadTimer = 0;
          hero.isActive = true;
          (hero as any).skillCooldowns = [15, 15, 15];
          (hero as any).skillCooldown = 15;
          EventBus.emit(GameEvent.HERO_REVIVED, { heroId: hero.id, playerIndex: hero.owner });
        }
      }
    }
  }

  private stepGathering(ds: number): void {
    const gMult0 = this.techSystem.getEffects(0).gatherMult;
    const gMult1 = this.techSystem.getEffects(1).gatherMult * this.aiController.resourceMult;
    const events = ResourceSystem.updateGathering(this.entities.units, this.entities.fields, this.world.players, ds, this.entities.buildings, gMult0, gMult1);
    for (const ge of events) {
      EventBus.emit(GameEvent.RESOURCE_GATHERED, { fieldId: ge.fieldId, workerId: ge.workerId, playerIndex: ge.playerIndex, amount: ge.amount });
    }
  }

  private stepResources(ds: number): void {
    ResourceSystem.updateResources(this.world.players, this.entities.units, this.entities.buildings, ds);
  }

  private stepProduction(ds: number): void {
    const completed = ProductionSystem.updateProduction(this.entities.buildings, this.world.players, this.world.techTrees, ds);
    for (const item of completed) {
      const building = this.entities.getBuilding(item.buildingId);
      if (building) {
        this.spawner.spawnUnit(item.unitDefId, item.position, building.owner);
        EventBus.emit(GameEvent.PRODUCTION_COMPLETE, { buildingId: item.buildingId, playerIndex: building.owner, unitDefId: item.unitDefId });
      }
    }
  }

  private stepConstructionResearch(ds: number): void {
    this.buildController.updateConstruction(
      ds, this.entities.buildings, (id) => this.entities.getUnit(id),
      (cost) => { this.world.refund(0, cost); },
    );
    // AI 建筑模拟建造进度
    for (const bld of this.entities.buildings) {
      if (bld.state === 'constructing' && (bld as any)._aiBuildTime > 0) {
        bld.buildProgress += ds / (bld as any)._aiBuildTime;
        if (bld.buildProgress >= 1) { bld.complete(); (bld as any)._aiBuildTime = 0; }
      }
    }
    this.researchSystem.update(ds);
  }

  private stepProjectiles(ds: number): void {
    this.projectileController.update(ds, this.entities.unitIndex, this.entities.buildingIndex, this.entities.units, this.entities.buildings, this.flashTimers);
  }

  private stepCleanup(): void {
    this.deathCleanup.cleanup();
  }

  private stepTimer(ds: number): void {
    this.gameOverCtrl.stepTimer(ds);
  }

  private stepGameOver(): void {
    this.gameOverCtrl.checkGameOver();
  }

  // ============ 公共 API ============

  /** 推进一帧（按原 update 顺序执行所有 step） */
  step(ds: number = 0.05): void {
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
  }

  /** 循环 step 直到条件满足或达到最大帧数 */
  runUntil(predicate: (r: HeadlessGameRunner) => boolean, maxFrames: number = 10000, ds: number = 0.05): number {
    for (let f = 0; f < maxFrames; f++) {
      this.step(ds);
      if (predicate(this)) return f;
    }
    return maxFrames;
  }

  /** 跑固定帧数 */
  runFrames(frames: number, ds: number = 0.05): void {
    for (let f = 0; f < frames; f++) this.step(ds);
  }

  /** 清理 EventBus（测试 afterEach 调用） */
  dispose(): void {
    EventBus.clear();
    this.gameOverCtrl.destroy();
  }
}
