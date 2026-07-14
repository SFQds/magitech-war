/**
 * 生产系统 — 建筑建造、单位训练队列管理
 *
 * 机械行会并行训练：兵营/工厂最多同时推进3个队列项，
 * 额外队列效率 -10%/项（科技优化后 -5%）。
 */

import { Building } from '../entities/Building';
import type { ProductionItem } from '../types/entity';
import type { PlayerState } from '../types/entity';
import { getFactionBonuses } from '../config/unitData';
import { GuildSystem } from './GuildSystem';

export class ProductionSystem {
  /** 开始建造/训练 */
  static startProduction(
    building: Building,
    unitDefId: string,
    buildTime: number,
  ): void {
    if (!building.canEnqueue()) return;

    // 联邦生产速度+15% → 时间×0.85
    const bonuses = getFactionBonuses(building.faction);
    const effectiveTime = buildTime * bonuses.productionSpeedMult;

    building.enqueueProduction({
      unitDefId,
      timeRemaining: effectiveTime,
      totalTime: effectiveTime,
    });
  }

  /** 推进所有建筑的生产进度（含机械行会并行训练） */
  static updateProduction(
    buildings: Building[],
    players: PlayerState[],
    techTrees: Map<number, { isResearched(id: string): boolean }>,
    deltaSec: number,
  ): ProductionComplete[] {
    const completed: ProductionComplete[] = [];

    for (const building of buildings) {
      if (!building.isAlive || building.state === 'constructing') continue;
      if (building.productionQueue.length === 0) {
        if (building.state === 'producing') building.state = 'idle';
        continue;
      }

      // 检查是否属于机械行会玩家
      const owner = players[building.owner];
      const isMechanist = owner?.guilds?.includes('mechanists_guild');
      const hasOptimized = techTrees.get(building.owner)?.isResearched('tech:production_line_optimized') ?? false;
      const parallelSlots = isMechanist
        ? GuildSystem.getMechanistParallelSlots(building, hasOptimized)
        : 1;

      // 并行推进队列项（最多 parallelSlots 个）
      const activeCount = Math.min(parallelSlots, building.productionQueue.length);
      const removeIndices: number[] = [];

      for (let i = 0; i < activeCount; i++) {
        const item = building.productionQueue[i];
        if (!item) continue;

        // 机械行会：额外队列效率惩罚（第一条队列无惩罚）
        const penalty = isMechanist
          ? GuildSystem.getMechanistPenalty(i, hasOptimized)
          : 0;

        // 应用英雄光环等临时生产速度加成
        const speedBonus = 1 + building.productionSpeedBonus;
        item.timeRemaining -= deltaSec * speedBonus * (1 - penalty);

        if (item.timeRemaining <= 0) {
          removeIndices.push(i);
        }
      }

      // 移除已完成项（从后往前确保索引正确）
      removeIndices.sort((a, b) => b - a);
      for (const idx of removeIndices) {
        const item = building.productionQueue.splice(idx, 1)[0];
        completed.push({
          buildingId: building.id,
          unitDefId: item.unitDefId,
          position: building.rallyPoint ?? { x: building.tileX + 1, y: building.tileY },
        });
      }

      // 更新建筑状态
      if (building.productionQueue.length === 0 && building.state === 'producing') {
        building.state = 'idle';
      }
    }

    return completed;
  }
}

export interface ProductionComplete {
  buildingId: string;
  unitDefId: string;
  position: { x: number; y: number };
}