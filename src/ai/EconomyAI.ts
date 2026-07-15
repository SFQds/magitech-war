/**
 * 经济 AI — 资源管理、建造决策、军事扩张
 *
 * 读取 StrategyDirective 调整建造/训练优先级。
 * 支持难度差异化：Hard 更早出兵、更激进扩张。
 */

import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';
import type { Building } from '../entities/Building';
import type { Unit } from '../entities/Unit';
import type { ResourceField } from '../entities/ResourceField';
import type { StrategyDirective } from './StrategyManager';
import { UNIT_DEFS, BUILDING_DEFS, TECH_DEFS, getBuildingCost as getBuildingCostWithDiscount } from '../config/unitData';
import type { BuildCommand, ResearchCommand, TrainCommand } from '../types/commands';

/** 构造 Build 命令（类型安全，不含 as any） */
function makeBuildCmd(playerIndex: number, bldId: string): BuildCommand {
  return { type: 'build', playerIndex, unitIds: [], buildingDefId: bldId, position: { x: 0, y: 0 }, frame: 0 };
}
/** 构造 Research 命令 */
function makeResearchCmd(playerIndex: number, bldId: string, techId: string): ResearchCommand {
  return { type: 'research', playerIndex, unitIds: [], buildingId: bldId, techDefId: techId, frame: 0 };
}
/** 构造 Train 命令 */
function makeTrainCmd(playerIndex: number, bldId: string, unitId: string): TrainCommand {
  return { type: 'train', playerIndex, unitIds: [], buildingId: bldId, unitDefId: unitId, count: 1, frame: 0 };
}

export class EconomyAI {
  private world: GameWorld;
  private playerIndex: number;
  private playerFaction: string;
  private difficulty: 'easy' | 'normal' | 'hard';
  /** 资源倍率 (easy=0.7, normal=1.0, hard=2.0) — 影响AI有效水晶 */
  private resourceMult: number;

  constructor(world: GameWorld, playerIndex: number, difficulty: 'easy' | 'normal' | 'hard', resourceMult = 1.0) {
    this.world = world;
    this.playerIndex = playerIndex;
    this.difficulty = difficulty;
    this.resourceMult = resourceMult;
    this.playerFaction = world.getPlayer(playerIndex)?.faction ?? 'hammer_federation';
  }

  /** 从 UNIT_DEFS 动态读取水晶成本 */
  private getUnitCost(unitDefId: string): number {
    return UNIT_DEFS[unitDefId]?.cost?.crystal ?? 999;
  }

  /** 从 BUILDING_DEFS 动态读取建筑水晶成本（含阵营折扣） */
  private getBuildingCost(bldDefId: string): number {
    const cost = getBuildingCostWithDiscount(bldDefId, this.playerFaction);
    return cost?.crystal ?? 999;
  }

  /** 从 TECH_DEFS 动态读取科技水晶成本 */
  private getTechCost(techDefId: string): number {
    return TECH_DEFS[techDefId]?.crystal ?? 999;
  }

  /** 每次 tick 输出建造/训练命令 */
  evaluate(
    buildings: Building[],
    units: Unit[],
    fields: ResourceField[],
    directive: StrategyDirective,
  ): AnyCommand[] {
    const commands: AnyCommand[] = [];
    const player = this.world.getPlayer(this.playerIndex);
    if (!player) return commands;

    const crystal = player.resources.crystal;
    const { supply, supplyCap } = player.resources;

    const faction = player.faction;
    const techBldId = faction === 'arcane_empire' ? 'bld_ancient_archive' : 'bld_assembly_workshop';
    const heroId = faction === 'arcane_empire' ? 'hero:isabelle' : 'hero:marcus';

    // 难度系数：Hard 更激进
    const aggressMultiplier = this.difficulty === 'hard' ? 0.7
                           : this.difficulty === 'easy' ? 1.5 : 1.0;

    // P1-6 修复：资源阈值 factor 替代 effectiveCrystal
    // Hard: resourceMult=2.0, aggress=0.7 -> factor=0.35 (更早建造)
    // Normal: factor=1.0, Easy: resourceMult=0.7, aggress=1.5 -> factor=2.14 (更晚建造)
    const resourceFactor = this.resourceMult > 0
      ? aggressMultiplier / this.resourceMult
      : aggressMultiplier;

    const workerCount = units.filter(
      u => u.owner === this.playerIndex && u.isAlive && u.spriteKey === 'unit_worker'
    ).length;

    const combatCount = units.filter(
      u => u.owner === this.playerIndex && u.isAlive && u.spriteKey !== 'unit_worker'
    ).length;

    // 0. 指派空闲工人去采集
    const activeFields = fields.filter(f => f.isActive && !f.isDepleted);
    if (activeFields.length > 0) {
      const idleWorkers = units.filter(u =>
        u.owner === this.playerIndex && u.isAlive &&
        u.spriteKey === 'unit_worker' && u.state === 'idle'
      );
      for (const worker of idleWorkers) {
        let closest: ResourceField | null = null;
        let closestDist = Infinity;
        for (const f of activeFields) {
          const d = Math.abs(worker.tileX - f.tileX) + Math.abs(worker.tileY - f.tileY);
          if (d < closestDist) { closestDist = d; closest = f; }
        }
        if (closest) {
          commands.push({
            type: 'gather', playerIndex: this.playerIndex,
            unitIds: [worker.id], resourceFieldId: closest!.id, frame: 0,
          });
        }
      }
    }

    const ownProductions = buildings.filter(
      b => b.owner === this.playerIndex && b.isAlive && b.buildingType === 'production' && b.canEnqueue()
    );
    if (ownProductions.length === 0) return commands;

    const hasBarracks = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_barracks'
    );
    const hasFactory = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_factory'
    );
    const hasRefinery = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_refinery'
    );
    const hasPowerPlant = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_power_plant'
    );
    const hasTechBuilding = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive &&
        (b.spriteKey === 'bld_ancient_archive' || b.spriteKey === 'bld_assembly_workshop')
    );
    const hasHero = units.some(
      u => u.owner === this.playerIndex && u.isAlive && (u.spriteKey === 'hero:isabelle' || u.spriteKey === 'hero:marcus')
    );
    const hasScout = units.some(
      u => u.owner === this.playerIndex && u.isAlive && u.spriteKey === 'unit_scout_bike'
    );
    const wallCount = buildings.filter(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_wall'
    ).length;
    const hasTurret = buildings.some(
      b => b.owner === this.playerIndex && b.isAlive && b.spriteKey === 'bld_turret'
    );

    const cc = ownProductions.find(b =>
      b.spriteKey === 'bld_cc_empire' || b.spriteKey === 'bld_cc_federation'
    ) ?? ownProductions[0];

    // 1. 工人数量维护
    const targetWorkers = directive.expansion > 0.5 ? 8 : 5;

    // P0-2 修复：AI安全网 — 当0工人且水晶不足时，被动提供最低水晶收入以免永久死锁
    if (workerCount === 0 && crystal < 100) {
      // 给予保底水晶 = 一个工人的成本，让AI能重新训练工人
      const rescueCrystal = Math.ceil(100 / this.resourceMult);
      player.resources.crystal = Math.max(player.resources.crystal, rescueCrystal);
    }

    if (crystal >= 100 && supply < supplyCap && workerCount < targetWorkers) {
      commands.push(makeTrainCmd(this.playerIndex, cc.id, 'unit_worker'));
    }

    // 2. 建造建筑 — P1-6: 阈值使用 resourceFactor 保持原设计意图
    const buildCostThreshold = (cost: number) => crystal >= cost * resourceFactor;

    if (directive.aggression < 0.7 || (!hasBarracks && !hasFactory)) {
      if (!hasBarracks && buildCostThreshold(this.getBuildingCost('bld_barracks'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_barracks'));
      }
      if (!hasFactory && buildCostThreshold(this.getBuildingCost('bld_factory'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_factory'));
      }
    }
    if (!hasRefinery && buildCostThreshold(this.getBuildingCost('bld_refinery'))) {
      commands.push(makeBuildCmd(this.playerIndex, 'bld_refinery'));
    }
    if (!hasPowerPlant && hasFactory && buildCostThreshold(this.getBuildingCost('bld_power_plant'))) {
      commands.push(makeBuildCmd(this.playerIndex, 'bld_power_plant'));
    }
    if (!hasTechBuilding && buildCostThreshold(this.getBuildingCost(techBldId))) {
      commands.push(makeBuildCmd(this.playerIndex, techBldId));
    }

    // 2.5 防御建筑
    if (combatCount >= 5 || crystal > 600) {
      if (wallCount < 4 && buildCostThreshold(this.getBuildingCost('bld_wall'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_wall'));
      }
      if (!hasTurret && buildCostThreshold(this.getBuildingCost('bld_turret'))) {
        commands.push(makeBuildCmd(this.playerIndex, 'bld_turret'));
      }
    }

    // 3. 科技研究：找任意空闲且有科技槽的建筑，选择一个未研究的科技
    const techBld = buildings.find(
      b => b.owner === this.playerIndex && b.isAlive && b.state === 'idle' &&
        !b.researchingTechId && BUILDING_DEFS[b.spriteKey]?.researches?.length
    );
    if (techBld) {
      const tt = this.world.techTrees.get(this.playerIndex);
      const availTechs = (BUILDING_DEFS[techBld.spriteKey]?.researches ?? []).filter(
        tid => !tt?.isResearched(tid) && this.getTechCost(tid) < crystal * resourceFactor
      );
      if (availTechs.length > 0) {
        commands.push(makeResearchCmd(this.playerIndex, techBld.id, availTechs[0]));
      }
    }

    // 4. 训练英雄（拥有足够水晶 且 尚未拥有）
    const heroCost = this.getUnitCost(heroId);
    if (!hasHero && crystal >= heroCost && supply < supplyCap - 4) {
      commands.push(makeTrainCmd(this.playerIndex, cc.id, heroId));
    }

    // 5. 训练侦察摩托（至少 1 辆）
    const scoutCost = this.getUnitCost('unit_scout_bike');
    const factoryBld = ownProductions.find(b => b.spriteKey === 'bld_factory');
    if (!hasScout && hasFactory && crystal >= scoutCost && supply < supplyCap && factoryBld) {
      commands.push(makeTrainCmd(this.playerIndex, factoryBld.id, 'unit_scout_bike'));
    }

    // 6. 按 directive.preferredUnits 优先级训练战斗单位
    const trainedBuildings = new Set<string>();
    for (const unitDefId of directive.preferredUnits) {
      if (unitDefId === 'unit_worker') continue;
      if (supply >= supplyCap) continue;

      const unitCost = this.getUnitCost(unitDefId);
      if (crystal < unitCost) continue;

      let producer = ownProductions.find(b => {
        if (trainedBuildings.has(b.id)) return false;
        if (unitDefId === 'unit_magitech_mech') return b.spriteKey === 'bld_factory';
        if (unitDefId === 'unit_hammer_squad') return b.spriteKey === 'bld_factory';
        if (unitDefId === 'unit_scout_bike') return b.spriteKey === 'bld_factory';
        if (unitDefId === 'unit_arcane_guard') return b.spriteKey === 'bld_ancient_archive';
        if (unitDefId === 'unit_battle_mage') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_arcane_heavy') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_rifleman') return b.spriteKey === 'bld_barracks';
if (unitDefId === 'unit_grenadier') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_assault_worker') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_void_probe') return b.spriteKey === 'bld_factory';
	        return false;
      });
      if (!producer) continue;

      commands.push({
        type: 'train', playerIndex: this.playerIndex,
        unitIds: [], buildingId: producer.id,
        unitDefId, count: 1, frame: 0,
      });
      trainedBuildings.add(producer.id);
    }

    return commands;
  }
}