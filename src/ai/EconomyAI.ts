/**
 * 经济 AI — 资源管理、建造决策
 *
 * 读取 StrategyDirective 调整建造/训练优先级
 */

import type { GameWorld } from '../core/GameWorld';
import type { AnyCommand } from '../types/commands';
import type { Building } from '../entities/Building';
import type { Unit } from '../entities/Unit';
import type { ResourceField } from '../entities/ResourceField';
import type { StrategyDirective } from './StrategyManager';

/** 单位造价快速查询（从 UNIT_DEFS 同步维护） */
const UNIT_CRYSTAL_COST: Record<string, number> = {
  unit_worker: 100,
  unit_rifleman: 150,
  unit_battle_mage: 240,
  unit_magitech_mech: 400,
  unit_arcane_heavy: 600,
};

export class EconomyAI {
  private world: GameWorld;
  private playerIndex: number;
  private resourceMultiplier: number;

  constructor(world: GameWorld, playerIndex: number, resourceMultiplier = 1.0) {
    this.world = world;
    this.playerIndex = playerIndex;
    this.resourceMultiplier = resourceMultiplier;
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

    // 难度通过 tickInterval 实现，这里直接用实际水晶值（避免与 GameScene 花费验证不一致）

    const workerCount = units.filter(
      u => u.owner === this.playerIndex && u.isAlive && u.spriteKey === 'unit_worker'
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

    // 生产建筑列表
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
    const cc = ownProductions.find(b =>
      b.spriteKey === 'bld_cc_empire' || b.spriteKey === 'bld_cc_federation'
    ) ?? ownProductions[0];

    // 1. 工人数量维护（扩张倾向高时目标更多）
    const targetWorkers = directive.expansion > 0.5 ? 8 : 5;
    if (crystal >= 100 && supply < supplyCap && workerCount < targetWorkers) {
      commands.push({
        type: 'train', playerIndex: this.playerIndex,
        unitIds: [], buildingId: cc.id, unitDefId: 'unit_worker', count: 1, frame: 0,
      });
      // 不 return，继续尝试建造和训练其他单位
    }

    // 2. 建造建筑（缺什么建什么，不受侵略性限制；但高侵略时优先训练而非新建）
    if (directive.aggression < 0.7 || (!hasBarracks && !hasFactory)) {
      if (!hasBarracks && crystal >= 300) {
        commands.push({
          type: 'build', playerIndex: this.playerIndex,
          unitIds: [], buildingDefId: 'bld_barracks',
          position: { x: 0, y: 0 }, frame: 0,
        } as any);
      }
      if (!hasFactory && crystal >= 500) {
        commands.push({
          type: 'build', playerIndex: this.playerIndex,
          unitIds: [], buildingDefId: 'bld_factory',
          position: { x: 0, y: 0 }, frame: 0,
        } as any);
      }
    }

    // 3. 按 directive.preferredUnits 优先级训练（每个建筑一次一个）
    const trainedBuildings = new Set<string>();
    for (const unitDefId of directive.preferredUnits) {
      if (unitDefId === 'unit_worker') continue;
      if (supply >= supplyCap) continue;

      const unitCost = UNIT_CRYSTAL_COST[unitDefId] ?? 999;
      if (crystal < unitCost) continue;

      let producer = ownProductions.find(b => {
        if (trainedBuildings.has(b.id)) return false;
        if (unitDefId === 'unit_magitech_mech') return b.spriteKey === 'bld_factory';
        if (unitDefId === 'unit_battle_mage') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_arcane_heavy') return b.spriteKey === 'bld_barracks';
        if (unitDefId === 'unit_rifleman') return b.spriteKey === 'bld_barracks';
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