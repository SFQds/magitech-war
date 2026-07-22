/**
 * 命令执行器 — 将命令翻译为系统调用
 *
 * 从 GameScene 抽离，通过依赖注入解耦。
 * 所有命令执行均为纯逻辑，无 Phaser 依赖。
 */

import type { AnyCommand, TrainCommand, MoveCommand, AttackCommand, BuildCommand, GatherCommand, ResearchCommand, CancelResearchCommand, SpawnCommand, StopCommand, HoldPositionCommand, AbilityCommand } from '../types/commands';
import type { GameWorld } from '../core/GameWorld';
import { EntityRegistry } from '../core/EntityRegistry';
import { UnitSpawner } from './UnitSpawner';
import { Building } from '../entities/Building';
import type { Unit } from '../entities/Unit';
import { MovementSystem } from '../systems/MovementSystem';
import { ProductionSystem } from '../systems/ProductionSystem';
import { EventBus } from '../utils/EventBus';
import { GameEvent } from '../types/events';
import { UNIT_DEFS, TECH_DEFS, BUILDING_DEFS, getBuildingCost, getFactionBonuses, createBuilding, getUnitCostWithFaction } from '../config/unitData';
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
      case 'cancel_research': return this.execCancelResearch(cmd as CancelResearchCommand);
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
    if (bld.state === 'constructing') return fail('建筑尚未完工');
    if (!bld.canEnqueue()) return fail('训练队列已满');
    // P0-C1: researching 状态禁止训练，避免 startProduction 覆盖 state 致研究冻结不退款
    // P1-CC 修复：CC 可同时训练工兵/英雄和研究（CC 是唯一工兵产地，阻塞会经济雪崩）
    const isCC = bld.spriteKey === 'bld_cc_empire' || bld.spriteKey === 'bld_cc_federation';
    if (bld.state === 'researching' && !isCC) return fail('建筑正在研究中');
    const playerState = this.world.players[cmd.playerIndex];
    const faction = playerState?.faction;
    const guilds = playerState?.guilds;

    // P1-1 fix: hero uniqueness check (one of each hero per player)
    if (cmd.unitDefId.startsWith('hero_')) {
      const heroExists = this.entities.aliveUnits.some(
        u => u.owner === cmd.playerIndex && u.isAlive && u.spriteKey === cmd.unitDefId
      );
      if (heroExists) return fail('已有同名英雄');
      // P1-H1: hero must match player faction (prevent cross-faction hero training)
      const heroDef = HERO_DEFS[cmd.unitDefId];
      if (heroDef && heroDef.faction && heroDef.faction !== faction) {
        return fail('hero faction mismatch');
      }
    }

    // P1-D2: use getUnitCostWithFaction to apply favoredBy discount (faction + guild)
    const cost = cmd.unitDefId.startsWith('hero_')
      ? UNIT_COSTS[cmd.unitDefId]
      : getUnitCostWithFaction(cmd.unitDefId, faction, guilds) ?? UNIT_COSTS[cmd.unitDefId];
    if (!cost) return fail('未知单位');
    // 检查科技前置
    const unitDef = UNIT_DEFS[cmd.unitDefId];
    if (unitDef?.techReq) {
      const tt = this.world.techTrees.get(cmd.playerIndex);
      for (const tid of unitDef.techReq) {
        if (!tt?.isResearched(tid)) return fail('科技未解锁');
      }
    }
    // P1-BUILD2: enforce exclusiveTo.faction - prevent cross-faction unit training.
    if (unitDef?.exclusiveTo?.faction && unitDef.exclusiveTo.faction !== faction) {
      return fail('exclusive faction mismatch');
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
    // 多单位移动：给每个单位分配围绕 target 的独立终点格，避免叠在同一点
    const units = cmd.unitIds
      .map(id => this.entities.getUnit(id))
      .filter(u => u && u.isAlive && u.owner === cmd.playerIndex) as Unit[];
    const goals = units.length > 1
      ? MovementSystem.assignGroupGoals(units, cmd.target, this.world.map)
      : null;

    for (const unit of units) {
      const goal = goals ? (goals.get(unit.id) ?? cmd.target) : cmd.target;
      MovementSystem.navigate(unit, goal, this.world.map, cmd.playerIndex);
      // P1-D5: align with player right-click - clear gather slot on move command
      if (unit.state === 'gathering' && unit.targetResourceId) {
        const oldField = this.entities.getField(unit.targetResourceId);
        if (oldField && oldField.currentGatherers > 0) oldField.currentGatherers--;
        unit.targetResourceId = null;
        unit.state = 'idle';
      }
      // P1-S1f: attack_move clears attack target but keeps new move target;
      // gather slot already cleared above, so no residual targetResourceId
      if (cmd.type === 'attack_move' && unit.targetEntityId) {
        unit.state = 'pursuing';
      }
    }
    return ok();
  }

  private execAttackTarget(cmd: AttackCommand): CommandResult {
    for (const id of cmd.unitIds) {
      const unit = this.entities.getUnit(id);
      // P1-D7: ownership check
      if (unit && unit.isAlive && unit.owner === cmd.playerIndex) {
        // P1-S1d: clear path and release gather slot before attacking
        unit.clearPath();
        if (unit.state === 'gathering' && unit.targetResourceId) {
          const oldField = this.entities.getField(unit.targetResourceId);
          if (oldField && oldField.currentGatherers > 0) oldField.currentGatherers--;
          unit.targetResourceId = null;
        }
        unit.attackTarget(cmd.targetEntityId);
      }
    }
    return ok();
  }

  private execBuild(cmd: BuildCommand): CommandResult {
    const aiFaction = this.world.players[cmd.playerIndex]?.faction ?? 'hammer_federation';
    const cost = getBuildingCost(cmd.buildingDefId, aiFaction);
    if (!cost) return fail('建筑数据不存在');
    // P0-1 修复：AI建造必须检查和扣除工业值（此前AI可零工业建造）
    if (!this.world.canAfford(cmd.playerIndex, { crystal: cost.crystal, industry: cost.industry })) return fail('资源不足');

    const aiCC = this.entities.aliveBuildings.find(b => b.owner === cmd.playerIndex);
    if (!aiCC) return fail('没有指挥中心');

    // 尝试多个候选位置（避开已有建筑）
    // P2-D6: deploy command uses cmd.position; AI build falls back to CC-anchored search
    let safePos: { x: number; y: number } | null = null;
    if ((cmd as any).type === 'deploy' && cmd.position && (cmd.position.x !== 0 || cmd.position.y !== 0)) {
      const p = this.world.map.findNearbyPassable(cmd.position.x, cmd.position.y, 3);
      if (p && !this.entities.hasBuildingAt(p.x, p.y)) safePos = p;
    }
    if (!safePos) {
      for (let radius = 5; radius <= 20; radius += 3) {
      const pos = this.world.map.findNearbyPassable(aiCC.tileX + 4, aiCC.tileY + 4, radius);
      if (pos && !this.entities.hasBuildingAt(pos.x, pos.y)) {
        safePos = pos;
        break;
      }
    }
        }
    if (!safePos) return fail('没有合适的建造位置');

    this.world.spend(cmd.playerIndex, { crystal: cost.crystal, industry: cost.industry });
    const bld = createBuilding(cmd.playerIndex, aiFaction, cmd.buildingDefId, safePos.x, safePos.y);
    // P1-AI20 修复：AI 建筑不再瞬间完工，改为模拟建造时间（无需工人，但有时间成本）
    bld.state = 'constructing';
    bld.buildProgress = 0;
    bld._aiBuildTime = cost.time > 0 ? cost.time : 10;
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
          // P0-A2 修复：换矿前先递减旧矿 currentGatherers，避免幽灵采集位膨胀
          if (unit.state === 'gathering' && unit.targetResourceId) {
            const oldField = this.entities.getField(unit.targetResourceId);
            if (oldField && oldField.currentGatherers > 0) oldField.currentGatherers--;
          }
          // P1-S1e: stop attacking before gathering, clear stale targetEntityId
          unit.stopAttacking();
          // 工人直接走向矿点格（工人可与矿点重叠，多工人可同格采集）
          unit.targetResourceId = field.id;
          unit.gatherTimer = 0;
          MovementSystem.navigate(unit, { x: field.tileX, y: field.tileY }, this.world.map, cmd.playerIndex);
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
    // P2-C4: use TechTreeSystem.canResearch instead of inline prereq check
    const tt = this.world.techTrees.get(cmd.playerIndex);
    if (tt && !tt.canResearch(cmd.techDefId, tech)) return fail('前置科技未研究或已研究');
    if (!this.world.canAfford(cmd.playerIndex, { crystal: tech.crystal })) return fail('水晶不足');
    if (this.world.techTrees.get(cmd.playerIndex)?.isResearched(cmd.techDefId)) return fail('科技已研究');
    // P0-C3: cross-building same-tech check to prevent double crystal spend
    const researchingElsewhere = this.entities.aliveBuildings.some(
      b => b.owner === cmd.playerIndex && b.isAlive && b.id !== bld.id && b.researchingTechId === cmd.techDefId,
    );
    if (researchingElsewhere) return fail('该科技正在其他建筑研究');
    if (bld.researchingTechId) return fail('正在研究其他科技');
    if (bld.state !== 'idle') return fail('建筑忙碌中');
    // P1-BUILD1: research must be in the building's researches whitelist (def.researches).
    const bldDef = BUILDING_DEFS[bld.spriteKey];
    if (bldDef && bldDef.researches && !bldDef.researches.includes(cmd.techDefId)) {
      return fail('该建筑不能研究此科技');
    }

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

  /** P1-14：取消进行中的科技研究，按剩余进度线性退款 */
  private execCancelResearch(cmd: CancelResearchCommand): CommandResult {
    const bld = this.entities.getBuilding(cmd.buildingId);
    if (!bld || bld.owner !== cmd.playerIndex) return fail('建筑不存在');
    if (!bld.researchingTechId) return fail('该建筑未在研究科技');
    if (bld.state !== 'researching') return fail('建筑当前不在研究状态');

    const techId = bld.researchingTechId;
    const tech = TECH_DEFS[techId];
    if (!tech) return fail('未知科技');

    // 按研究进度线性退款：剩余比例 * 总成本，floor 避免多退
    const progress = Math.max(0, Math.min(1, bld.researchProgress));
    const refundAmount = Math.floor(tech.crystal * (1 - progress));
    if (refundAmount > 0) {
      this.world.refund(cmd.playerIndex, { crystal: refundAmount });
    }

    // 清理研究状态，释放建筑
    bld.researchingTechId = null;
    bld.researchProgress = 0;
    bld.researchTotalTime = 0;
    bld.state = 'idle';

    EventBus.emit(GameEvent.RESEARCH_CANCELED, {
      buildingId: bld.id, playerIndex: cmd.playerIndex,
      techDefId: techId, refundAmount,
    } as any);
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
      // P0-A2 修复：停止/坚守命令会离开采集，递减旧矿 currentGatherers
      if (unit.state === 'gathering' && unit.targetResourceId) {
        const oldField = this.entities.getField(unit.targetResourceId);
        if (oldField && oldField.currentGatherers > 0) oldField.currentGatherers--;
      }
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

  /** 使用技能命令桩（HUD 按钮绕过此处直接调 HeroSystem.activateSkill） */
  private execAbility(_cmd: AbilityCommand): CommandResult {
    return fail('技能系统暂未开放');
  }
}