/**
 * 命令执行器 — 将命令翻译为系统调用
 *
 * 从 GameScene 抽离，通过依赖注入解耦。
 * 所有命令执行均为纯逻辑，无 Phaser 依赖。
 */

import type { AnyCommand, TrainCommand, MoveCommand, AttackCommand, BuildCommand, GatherCommand, ResearchCommand, SpawnCommand, StopCommand, HoldPositionCommand, AbilityCommand } from '../types/commands';
import type { GameWorld } from '../core/GameWorld';
import { EntityRegistry } from '../core/EntityRegistry';
import { UnitSpawner } from './UnitSpawner';
import { Building } from '../entities/Building';
import { MovementSystem } from '../systems/MovementSystem';
import { ProductionSystem } from '../systems/ProductionSystem';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { UNIT_DEFS, TECH_DEFS, getBuildingCost, getFactionBonuses, createBuilding } from '../config/unitData';
import { HERO_DEFS } from '../config/heroData';

/** 命令执行结果 */
export type CommandResult = { ok: true } | { ok: false; reason: string };

function ok(): CommandResult { return { ok: true }; }
function fail(reason: string): CommandResult { return { ok: false, reason }; }

/** 所有可训练单位的造价（含英雄） */
const UNIT_COSTS: Record<string, { crystal: number; supply: number; time: number; category: string }> = {};
// 从 UNIT_DEFS 填充
for (const [k, v] of Object.entries(UNIT_DEFS)) {
  UNIT_COSTS[k] = { ...v.cost, category: v.stats.category };
}
// 从 HERO_DEFS 填充
for (const [k, v] of Object.entries(HERO_DEFS)) {
  UNIT_COSTS[k] = { ...v.cost, category: 'infantry' };
}

type ApplyTechToBldFn = (bld: Building) => void;
type AddBuildingFn = (bld: Building) => void;

export class CommandExecutor {
  constructor(
    private world: GameWorld,
    private entities: EntityRegistry,
    private spawner: UnitSpawner,
    private applyTechToBuilding: ApplyTechToBldFn,
    private addBuilding: AddBuildingFn,
  ) {}

  execute(cmd: AnyCommand): CommandResult {
    switch (cmd.type) {
      case 'train': return this.execTrain(cmd as TrainCommand);
      case 'move':
      case 'attack_move': return this.execMove(cmd as MoveCommand);
      case 'attack_target': return this.execAttackTarget(cmd as AttackCommand);
      case 'build': return this.execBuild(cmd);
      case 'gather': return this.execGather(cmd);
      case 'research': return this.execResearch(cmd);
      case 'spawn': return this.execSpawn(cmd);
      case 'deploy': return this.execBuild(cmd as unknown as BuildCommand);  // deploy = build别名
      case 'use_ability': return this.execAbility(cmd as AbilityCommand);
      case 'stop':
      case 'hold_position': return this.execStop(cmd);
      default: return fail('未知命令');
    }
  }

  private execTrain(cmd: TrainCommand): CommandResult {
    const bld = this.entities.getBuilding(cmd.buildingId);
    if (!bld || bld.owner !== cmd.playerIndex) return fail('建筑不存在');
    if (!bld.canEnqueue()) return fail('训练队列已满');

    const cost = UNIT_COSTS[cmd.unitDefId];
    if (!cost) return fail('未知单位');
    // 检查科技前置
    const unitDef = UNIT_DEFS[cmd.unitDefId];
    if (unitDef?.techReq) {
      const tt = this.world.techTrees.get(cmd.playerIndex);
      for (const tid of unitDef.techReq) {
        if (!tt?.isResearched(tid)) return fail('科技未解锁');
      }
    }
    if (!this.world.canAfford(cmd.playerIndex, { crystal: cost.crystal, supply: cost.supply })) return fail('资源不足');

    this.world.spend(cmd.playerIndex, { crystal: cost.crystal, supply: cost.supply });
    ProductionSystem.startProduction(bld, cmd.unitDefId, cost.time);
    EventBus.emit(GameEvent.PRODUCTION_STARTED, {
      buildingId: bld.id, playerIndex: cmd.playerIndex,
      unitDefId: cmd.unitDefId, totalTime: cost.time,
    });
    return ok();
  }

  private execMove(cmd: MoveCommand): CommandResult {
    for (const id of cmd.unitIds) {
      const unit = this.entities.getUnit(id);
      if (unit && unit.isAlive) {
        MovementSystem.navigate(unit, cmd.target, this.world.map);
        if (cmd.type === 'attack_move' && unit.targetEntityId) {
          unit.state = 'pursuing';
        }
      }
    }
    return ok();
  }

  private execAttackTarget(cmd: AttackCommand): CommandResult {
    for (const id of cmd.unitIds) {
      const unit = this.entities.getUnit(id);
      if (unit && unit.isAlive) {
        unit.attackTarget(cmd.targetEntityId);
      }
    }
    return ok();
  }

  private execBuild(cmd: BuildCommand): CommandResult {
    const aiFaction = this.world.players[cmd.playerIndex]?.faction ?? 'hammer_federation';
    const cost = getBuildingCost(cmd.buildingDefId, aiFaction);
    if (!cost) return fail('建筑数据不存在');
    if (!this.world.canAfford(cmd.playerIndex, { crystal: cost.crystal })) return fail('资源不足');

    const aiCC = this.entities.aliveBuildings.find(b => b.owner === cmd.playerIndex);
    if (!aiCC) return fail('没有指挥中心');

    // 尝试多个候选位置（避开已有建筑）
    let safePos: { x: number; y: number } | null = null;
    for (let radius = 5; radius <= 20; radius += 3) {
      const pos = this.world.map.findNearbyPassable(aiCC.tileX + 4, aiCC.tileY + 4, radius);
      if (pos && !this.entities.hasBuildingAt(pos.x, pos.y)) {
        safePos = pos;
        break;
      }
    }
    if (!safePos) return fail('没有合适的建造位置');

    this.world.spend(cmd.playerIndex, { crystal: cost.crystal });
    const bld = createBuilding(cmd.playerIndex, aiFaction, cmd.buildingDefId, safePos.x, safePos.y);
    this.applyTechToBuilding(bld);
    this.addBuilding(bld);
    return ok();
  }

  private execGather(cmd: GatherCommand): CommandResult {
    for (const id of cmd.unitIds) {
      const unit = this.entities.getUnit(id);
      if (unit && unit.isAlive && cmd.resourceFieldId) {
        const field = this.entities.getField(cmd.resourceFieldId);
        if (field && field.isActive && !field.isDepleted) {
          field.currentGatherers++;
          unit.state = 'gathering';
          unit.targetResourceId = field.id;
          unit.gatherTimer = 0;
          MovementSystem.navigate(unit, { x: field.tileX, y: field.tileY }, this.world.map);
        }
      }
    }
    return ok();
  }

  private execResearch(cmd: ResearchCommand): CommandResult {
    const bld = this.entities.getBuilding(cmd.buildingId);
    if (!bld || bld.owner !== cmd.playerIndex) return fail('建筑不存在');

    const tech = TECH_DEFS[cmd.techDefId];
    if (!tech) return fail('未知科技');
    // 检查科技前置条件
    if (tech.prerequisites) {
      const tt = this.world.techTrees.get(cmd.playerIndex);
      for (const pid of tech.prerequisites) {
        if (!tt?.isResearched(pid)) return fail('前置科技未研究');
      }
    }
    if (!this.world.canAfford(cmd.playerIndex, { crystal: tech.crystal })) return fail('水晶不足');
    if (this.world.techTrees.get(cmd.playerIndex)?.isResearched(cmd.techDefId)) return fail('科技已研究');
    if (bld.researchingTechId) return fail('正在研究其他科技');
    if (bld.state !== 'idle') return fail('建筑忙碌中');

    this.world.spend(cmd.playerIndex, { crystal: tech.crystal });
    bld.researchingTechId = cmd.techDefId;
    bld.researchProgress = 0;
    const factionBonuses = getFactionBonuses(bld.faction);
    bld.researchTotalTime = tech.time * factionBonuses.researchSpeedMult;
    bld.state = 'researching';
    EventBus.emit(GameEvent.PRODUCTION_STARTED, {
      buildingId: bld.id, playerIndex: cmd.playerIndex,
      unitDefId: cmd.techDefId, totalTime: tech.time,
    });
    return ok();
  }

  private execSpawn(cmd: SpawnCommand): CommandResult {
    for (let i = 0; i < (cmd.count ?? 1); i++) {
      const sPos = this.world.map.findNearbyPassable(cmd.position.x, cmd.position.y, 5);
      if (sPos) {
        this.spawner.spawnUnit(cmd.unitDefId, sPos, cmd.playerIndex);
      }
    }
    return ok();
  }

  private execStop(cmd: StopCommand | HoldPositionCommand): CommandResult {
    for (const id of cmd.unitIds) {
      const unit = this.entities.getUnit(id);
      if (!unit || !unit.isAlive) continue;
      unit.stopAttacking();
      unit.clearPath();
      unit.holdPosition = cmd.type === 'hold_position';
      unit.aiLockedAction = null;
      if (cmd.type === 'stop') {
        unit.state = 'idle';
      }
    }
    return ok();
  }

  /** 使用技能命令桩（待英雄/行会 UI 完善后实现完整逻辑） */
  private execAbility(cmd: AbilityCommand): CommandResult {
    // Phase 2: 调用 HeroSystem.activateSkill 或 GuildSystem 主动技能
    return fail('技能系统暂未开放');
  }
}