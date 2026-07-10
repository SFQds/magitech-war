/**
 * 资源系统 — 采集、消耗、补给计算
 *
 * 纯逻辑：管理水晶采集、工业产值、人口补给
 */

import type { PlayerState } from '../types/entity';
import { Unit } from '../entities/Unit';
import { ResourceField } from '../entities/ResourceField';
import { Building } from '../entities/Building';

export interface GatherEvent {
  workerId: string;
  fieldId: string;
  playerIndex: number;
  amount: number;
}

export class ResourceSystem {
  /** 工兵采集资源（单次调用） */
  static gather(worker: Unit, field: ResourceField): number {
    if (!field.isActive || field.isDepleted) return 0;
    // 允许超出 maxGatherers 的情况（已到场的已通过 GameScene 检查）
    const gathered = field.gather(10); // 基础采集速率：10/次
    return gathered;
  }

  /**
   * 每帧更新所有正在采集的工人
   * 每 1 秒执行一次采集 tick
   */
  static updateGathering(
    units: Unit[],
    fields: ResourceField[],
    players: PlayerState[],
    deltaSec: number,
    buildings?: Building[],
    gatherMult?: Map<number, number>,
  ): GatherEvent[] {
    const events: GatherEvent[] = [];

    for (const unit of units) {
      if (!unit.isAlive || unit.state !== 'gathering') continue;

      if (!unit.targetResourceId) {
        unit.state = 'idle';
        continue;
      }

      const field = fields.find(f => f.id === unit.targetResourceId);
      if (!field || !field.isActive || field.isDepleted) {
        unit.targetResourceId = null;
        unit.state = 'idle';
        continue;
      }

      // 累积采集计时
      (unit as any)._gatherTimer = ((unit as any)._gatherTimer ?? 0) + deltaSec;
      if ((unit as any)._gatherTimer >= 1.0) {
        (unit as any)._gatherTimer -= 1.0;

        const amount = ResourceSystem.gather(unit, field);
        // 采矿场速率检查：无采矿场=3/s，有=10/s
        let gathered = amount;
        if (buildings) {
          const hasRefinery = buildings.some(b => b.owner === unit.owner && b.isAlive && b.spriteKey === 'bld_refinery');
          gathered = hasRefinery ? amount : 3;
          // 无采矿场时只采集 3，退还矿场 7
          if (!hasRefinery) {
            field.amount += (amount - gathered);
          }
        }
        // 科技采集加成
        const mult = gatherMult?.get(unit.owner) ?? 1.0;
        gathered = Math.round(gathered * mult);
        if (gathered > 0) {
          const player = players[unit.owner];
          if (player) {
            player.resources.crystal += gathered;
            events.push({
              workerId: unit.id,
              fieldId: field.id,
              playerIndex: unit.owner,
              amount: gathered,
            });
          }

          if (field.isDepleted) {
            unit.targetResourceId = null;
            unit.state = 'idle';
            if (field.currentGatherers > 0) field.currentGatherers--;
          }
        }
      }
    }

    return events;
  }

  /** 更新所有玩家资源（补给/工业上限重算） */
  static updateResources(
    players: PlayerState[],
    _units: Unit[],
    buildings: Building[],
    deltaSec: number = 0,
  ): void {
    for (const player of players) {
      // 重新计算补给上限和工业上限
      let totalSupply = 0;
      let totalIndustry = 0;

      for (const building of buildings) {
        // 建设中建筑不提供供给/工业（建造完成后才生效）
        if (building.owner !== player.index || !building.isAlive || building.state === 'constructing') continue;
        totalSupply += building.providesSupply;
        totalIndustry += building.providesIndustry;
      }

      player.resources.supplyCap = totalSupply;
      player.resources.industryCap = totalIndustry;

      // 工业产值：缓慢自然增长（1/s 基础 + 建筑提供值的 10% /s）
      if (deltaSec > 0) {
        const regenRate = 1 + totalIndustry * 0.1; // 每秒恢复量
        player.resources.industry = Math.min(
          totalIndustry,
          player.resources.industry + regenRate * deltaSec,
        );
      } else {
        // 初始化时直接填满（游戏开始）
        if (player.resources.industry < 0) player.resources.industry = 0;
        if (player.resources.industry > totalIndustry) player.resources.industry = totalIndustry;
      }
    }
  }
}